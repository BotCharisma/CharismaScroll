use crate::config::{AppRuleMode, AppSettings};
use crate::engine::physics::{EngineCommand, ScrollAxis, CHARISMA_MAGIC_TAG};
use crate::platform::{detect_monitor_hz_for_window, is_window_fullscreen_game, process_exe_from_hwnd};
use crossbeam_channel::Sender;
use parking_lot::RwLock;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::{
    GetCurrentThread, GetCurrentThreadId, SetThreadPriority, THREAD_PRIORITY_HIGHEST,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetAncestor, GetMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, MSG,
    MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_MOUSEHWHEEL, WM_MOUSEWHEEL, WM_QUIT,
};

#[derive(Clone)]
struct CachedTarget {
    hwnd: isize,
    exe_name: String,
    is_fullscreen_game: bool,
    monitor_hz: u32,
    fetched_at: Instant,
}

pub struct HookContext {
    pub settings: Arc<RwLock<Arc<AppSettings>>>,
    pub tx: Sender<EngineCommand>,
    pub enabled: Arc<AtomicBool>,
    pub last_scrolled_exe: Arc<RwLock<Option<String>>>,
    pub on_recent_app_changed: Box<dyn Fn() + Send + Sync>,
}

static GLOBAL_HOOK_CTX: OnceLock<Arc<HookContext>> = OnceLock::new();
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

thread_local! {
    static TARGET_CACHE: RefCell<Option<CachedTarget>> = const { RefCell::new(None) };
}

fn is_vk_down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let msg = wparam.0 as u32;
    // Ultra-fast early return for WM_MOUSEMOVE & clicks (<10ns overhead)
    if msg != WM_MOUSEWHEEL && msg != WM_MOUSEHWHEEL {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let msll = &*(lparam.0 as *const MSLLHOOKSTRUCT);
    if msll.dwExtraInfo == CHARISMA_MAGIC_TAG {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let Some(ctx) = GLOBAL_HOOK_CTX.get() else {
        return CallNextHookEx(None, code, wparam, lparam);
    };

    if !ctx.enabled.load(Ordering::Relaxed) {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let raw_delta = ((msll.mouseData >> 16) & 0xFFFF) as i16 as i32;
    if raw_delta == 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let settings = Arc::clone(&ctx.settings.read());

    // Ctrl or Alt held -> cancel residual momentum & pass raw wheel for zoom / app shortcuts
    if settings.passthrough_ctrl_alt && (is_vk_down(VK_CONTROL.0) || is_vk_down(VK_MENU.0)) {
        let _ = ctx.tx.try_send(EngineCommand::CancelAll);
        return CallNextHookEx(None, code, wparam, lparam);
    }

    // Precision touchpad or free-spinning high-res hardware wheel auto-bypass
    if settings.bypass_touchpad && raw_delta.abs() < 100 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let target = resolve_target_under_point(msll.pt);
    if !target.exe_name.is_empty()
        && !target.exe_name.eq_ignore_ascii_case("CharismaScroll.exe")
        && !target.exe_name.eq_ignore_ascii_case("charisma-scroll.exe")
    {
        let changed = {
            let mut guard = ctx.last_scrolled_exe.write();
            if guard.as_deref() != Some(target.exe_name.as_str()) {
                *guard = Some(target.exe_name.clone());
                true
            } else {
                false
            }
        };
        if changed {
            (ctx.on_recent_app_changed)();
        }
    }

    if settings.game_mode_fullscreen && target.is_fullscreen_game {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let mut active_profile = settings.global_profile.clone();
    if !target.exe_name.is_empty() {
        if let Some(rule) = settings
            .app_rules
            .iter()
            .find(|r| r.exe_name.eq_ignore_ascii_case(&target.exe_name))
        {
            match rule.mode {
                AppRuleMode::Disabled => {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                AppRuleMode::Custom => {
                    active_profile = rule.profile.clone();
                }
            }
        }
    }

    let (axis, effective_delta) = if msg == WM_MOUSEHWHEEL {
        if !active_profile.horizontal_smooth {
            return CallNextHookEx(None, code, wparam, lparam);
        }
        (ScrollAxis::Horizontal, raw_delta)
    } else if active_profile.shift_wheel_horizontal && is_vk_down(VK_SHIFT.0) {
        if !active_profile.horizontal_smooth {
            return CallNextHookEx(None, code, wparam, lparam);
        }
        // Standard wheel down (-120) with Shift scrolls right (+120 in HWHEEL)
        (ScrollAxis::Horizontal, -raw_delta)
    } else {
        (ScrollAxis::Vertical, raw_delta)
    };

    if ctx
        .tx
        .try_send(EngineCommand::Impulse {
            raw_delta: effective_delta,
            axis,
            profile: active_profile,
            monitor_hz: target.monitor_hz,
            exe_name: target.exe_name,
        })
        .is_ok()
    {
        return LRESULT(1);
    }

    CallNextHookEx(None, code, wparam, lparam)
}

fn resolve_target_under_point(pt: windows::Win32::Foundation::POINT) -> CachedTarget {
    let raw_hwnd = unsafe { WindowFromPoint(pt) };
    let root_hwnd = if raw_hwnd.0.is_null() {
        HWND::default()
    } else {
        let anc = unsafe { GetAncestor(raw_hwnd, GA_ROOT) };
        if anc.0.is_null() {
            raw_hwnd
        } else {
            anc
        }
    };
    let hwnd_key = root_hwnd.0 as isize;
    let now = Instant::now();

    let hit = TARGET_CACHE.with(|cell| {
        if let Some(ref cached) = *cell.borrow() {
            if cached.hwnd == hwnd_key && now.duration_since(cached.fetched_at) < Duration::from_millis(350) {
                return Some(cached.clone());
            }
        }
        None
    });

    if let Some(c) = hit {
        return c;
    }

    let exe_name = process_exe_from_hwnd(root_hwnd);
    let is_fullscreen_game = is_window_fullscreen_game(root_hwnd, &exe_name);
    let monitor_hz = detect_monitor_hz_for_window(root_hwnd);

    let fresh = CachedTarget {
        hwnd: hwnd_key,
        exe_name,
        is_fullscreen_game,
        monitor_hz,
        fetched_at: now,
    };

    TARGET_CACHE.with(|cell| {
        *cell.borrow_mut() = Some(fresh.clone());
    });

    fresh
}

pub fn spawn_mouse_hook_thread(ctx: Arc<HookContext>) {
    let _ = GLOBAL_HOOK_CTX.set(ctx);
    std::thread::Builder::new()
        .name("charisma-mouse-hook".to_string())
        .spawn(|| unsafe {
            HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::Relaxed);
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
            let Ok(hook) = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), None, 0) else {
                HOOK_THREAD_ID.store(0, Ordering::Relaxed);
                return;
            };

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(hook);
            HOOK_THREAD_ID.store(0, Ordering::Relaxed);
        })
        .expect("Failed to spawn WH_MOUSE_LL thread");
}

pub fn stop_mouse_hook_thread() {
    let tid = HOOK_THREAD_ID.swap(0, Ordering::Relaxed);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}
