use crate::app::commands::SharedAppState;
use crate::platform::{is_windows_system_light_theme, monitor_work_area_at_point};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconFromResourceEx, DestroyIcon, SendMessageW, HICON, ICON_BIG, ICON_SMALL,
    LR_DEFAULTCOLOR, WM_SETICON,
};

const TRAY_ID: &str = "charisma-tray";
pub const TRAY_MENU_LABEL: &str = "tray-menu";
const TRAY_MENU_WIDTH: f64 = 256.0;
const TRAY_MENU_DEFAULT_HEIGHT: f64 = 332.0;
const TRAY_IDLE_RELEASE_SECS: u64 = 25;

const TRAY_ICON_PNG: &[u8] = include_bytes!("../../icons/32x32.png");
const TASKBAR_LIGHT_PNG: &[u8] = include_bytes!("../../icons/taskbar-light-64.png");
const TASKBAR_DARK_PNG: &[u8] = include_bytes!("../../icons/taskbar-dark-64.png");

static LAST_TRAY_ANCHOR: Mutex<(f64, f64)> = Mutex::new((0.0, 0.0));
static LAST_TRAY_HIDE: Mutex<Option<Instant>> = Mutex::new(None);
static TRAY_MENU_HIDE_GEN: AtomicU64 = AtomicU64::new(0);
static ACTIVE_TASKBAR_HICON: Mutex<Option<isize>> = Mutex::new(None);

#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

fn apply_win11_rounding(win: &tauri::WebviewWindow) {
    if let Ok(hwnd) = win.hwnd() {
        let pref: u32 = 2; // DWMWCP_ROUND
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd.0 as isize,
                33, // DWMWA_WINDOW_CORNER_PREFERENCE
                (&pref as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

/// Adaptive taskbar icon: Light Ivory on Dark Windows taskbar, Dark Espresso on Light Windows taskbar.
pub fn apply_adaptive_taskbar_icon(win: &tauri::WebviewWindow) {
    let bytes = if is_windows_system_light_theme() {
        TASKBAR_DARK_PNG
    } else {
        TASKBAR_LIGHT_PNG
    };

    if let Ok(win_hwnd) = win.hwnd() {
        let hwnd = HWND(win_hwnd.0 as *mut std::ffi::c_void);
        if let Ok(hicon) = unsafe {
            CreateIconFromResourceEx(bytes, true, 0x0003_0000, 0, 0, LR_DEFAULTCOLOR)
        } {
            unsafe {
                let _ = SendMessageW(
                    hwnd,
                    WM_SETICON,
                    WPARAM(ICON_BIG as usize),
                    LPARAM(hicon.0 as isize),
                );
                let _ = SendMessageW(
                    hwnd,
                    WM_SETICON,
                    WPARAM(ICON_SMALL as usize),
                    LPARAM(hicon.0 as isize),
                );
            }
            let prev = ACTIVE_TASKBAR_HICON.lock().replace(hicon.0 as isize);
            if let Some(old_ptr) = prev {
                if old_ptr != hicon.0 as isize {
                    unsafe {
                        let _ = DestroyIcon(HICON(old_ptr as *mut std::ffi::c_void));
                    }
                }
            }
            return;
        }
    }

    if let Ok(img) = Image::from_bytes(bytes) {
        let _ = win.set_icon(img);
    }
}

pub fn refresh_taskbar_icon(app: &AppHandle) {
    let app_clone = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_clone.get_webview_window("main") {
            apply_adaptive_taskbar_icon(&win);
        }
    });
}

/// System Tray icon: Vivid Ember Orange when Active, soft grayscale when Paused.
pub fn generate_tray_icon(active: bool) -> Image<'static> {
    if let Ok(img) = Image::from_bytes(TRAY_ICON_PNG) {
        let width = img.width();
        let height = img.height();
        let mut rgba = img.rgba().to_vec();
        if !active {
            for px in rgba.chunks_exact_mut(4) {
                let lum = ((px[0] as u32 * 77 + px[1] as u32 * 150 + px[2] as u32 * 29) >> 8) as u8;
                let dimmed = ((lum as u32 * 168) >> 8) as u8;
                px[0] = dimmed;
                px[1] = dimmed;
                px[2] = dimmed;
                px[3] = ((px[3] as u32 * 195) >> 8) as u8;
            }
        }
        return Image::new_owned(rgba, width, height);
    }

    Image::new_owned(vec![0u8; 32 * 32 * 4], 32, 32)
}

pub fn ensure_tray_menu_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(win) = app.get_webview_window(TRAY_MENU_LABEL) {
        return Some(win);
    }

    if let Ok(win) = WebviewWindowBuilder::new(
        app,
        TRAY_MENU_LABEL,
        WebviewUrl::App("index.html?view=tray".into()),
    )
    .title("CharismaScroll Tray")
    .inner_size(TRAY_MENU_WIDTH, TRAY_MENU_DEFAULT_HEIGHT)
    .resizable(false)
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .shadow(true)
    .background_color(Color(28, 22, 23, 255))
    .build()
    {
        apply_win11_rounding(&win);
        return Some(win);
    }
    None
}

fn position_tray_menu(win: &tauri::WebviewWindow, anchor_x: f64, anchor_y: f64, logical_h: f64) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let phys_w = (TRAY_MENU_WIDTH * scale).round() as i32;
    let phys_h = (logical_h * scale).round() as i32;
    let margin = (10.0 * scale).round() as i32;
    let gap = (8.0 * scale).round() as i32;

    let (work_l, work_t, work_r, work_b) =
        monitor_work_area_at_point(anchor_x.round() as i32, anchor_y.round() as i32);

    let desired_x = anchor_x.round() as i32 - phys_w / 2;
    let clamped_x = desired_x.clamp(work_l + margin, (work_r - phys_w - margin).max(work_l + margin));

    // Prefer opening above the click point; clamp strictly inside monitor work area
    let above_y = anchor_y.round() as i32 - phys_h - gap;
    let below_y = anchor_y.round() as i32 + gap;
    let desired_y = if above_y >= work_t + margin {
        above_y
    } else if below_y + phys_h <= work_b - margin {
        below_y
    } else {
        work_b - phys_h - margin
    };
    let clamped_y = desired_y.clamp(work_t + margin, (work_b - phys_h - margin).max(work_t + margin));

    let _ = win.set_position(PhysicalPosition::new(clamped_x, clamped_y));
}

pub fn hide_tray_menu(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(TRAY_MENU_LABEL) {
        if win.is_visible().unwrap_or(false) {
            *LAST_TRAY_HIDE.lock() = Some(Instant::now());
        }
        let _ = win.hide();

        // Release WebView2 tray popup memory after idle period so background tray stays ~8-15 MB
        let gen = TRAY_MENU_HIDE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        let app_clone = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(TRAY_IDLE_RELEASE_SECS));
            if TRAY_MENU_HIDE_GEN.load(Ordering::SeqCst) == gen {
                let app_main = app_clone.clone();
                let _ = app_clone.run_on_main_thread(move || {
                    if TRAY_MENU_HIDE_GEN.load(Ordering::SeqCst) == gen {
                        if let Some(w) = app_main.get_webview_window(TRAY_MENU_LABEL) {
                            if !w.is_visible().unwrap_or(false) {
                                let _ = w.close();
                            }
                        }
                    }
                });
            }
        });
    }
}

pub fn resize_tray_menu(app: &AppHandle, logical_height: f64) {
    let clamped_h = logical_height.clamp(160.0, 520.0);
    if let Some(win) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = win.set_size(LogicalSize::new(TRAY_MENU_WIDTH, clamped_h));
        let (ax, ay) = *LAST_TRAY_ANCHOR.lock();
        if ax != 0.0 || ay != 0.0 {
            position_tray_menu(&win, ax, ay, clamped_h);
        }
    }
}

pub fn toggle_tray_menu_popup(app: &AppHandle, click_x: f64, click_y: f64) {
    if let Some(last_hide) = *LAST_TRAY_HIDE.lock() {
        if last_hide.elapsed() < Duration::from_millis(260) {
            return;
        }
    }
    TRAY_MENU_HIDE_GEN.fetch_add(1, Ordering::SeqCst);
    let app_clone = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = ensure_tray_menu_window(&app_clone) {
            if win.is_visible().unwrap_or(false) {
                hide_tray_menu(&app_clone);
                return;
            }
            *LAST_TRAY_ANCHOR.lock() = (click_x, click_y);
            let scale = win.scale_factor().unwrap_or(1.0);
            let current_h = win
                .inner_size()
                .map(|s| (s.height as f64) / scale)
                .unwrap_or(TRAY_MENU_DEFAULT_HEIGHT)
                .clamp(160.0, 520.0);
            apply_win11_rounding(&win);
            position_tray_menu(&win, click_x, click_y, current_h);
            let _ = win.emit("tray-menu-opened", ());
            let _ = win.show();
            let _ = win.set_focus();
        }
    });
}

pub fn create_or_focus_main_window(app: &AppHandle) {
    hide_tray_menu(app);
    if let Some(win) = app.get_webview_window("main") {
        apply_win11_rounding(&win);
        let _ = win.unminimize();
        let _ = win.show();
        apply_adaptive_taskbar_icon(&win);
        let _ = win.set_focus();
        return;
    }

    if let Ok(win) = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("CharismaScroll")
        .inner_size(960.0, 600.0)
        .min_inner_size(860.0, 560.0)
        .center()
        .resizable(true)
        .decorations(false)
        .build()
    {
        apply_win11_rounding(&win);
        apply_adaptive_taskbar_icon(&win);
        let _ = win.set_focus();
    }
}

pub fn refresh_tray_state(app: &AppHandle) {
    let app_clone = app.clone();
    let _ = app.run_on_main_thread(move || {
        let state = app_clone.state::<SharedAppState>();
        if let Some(tray) = app_clone.tray_by_id(TRAY_ID) {
            let enabled = state.enabled.load(Ordering::Relaxed);
            let _ = tray.set_icon(Some(generate_tray_icon(enabled)));
            let tooltip = if enabled {
                "CharismaScroll — Active"
            } else {
                "CharismaScroll — Paused"
            };
            let _ = tray.set_tooltip(Some(tooltip));
        }
        let has_ui_window = app_clone.get_webview_window("main").is_some()
            || app_clone.get_webview_window(TRAY_MENU_LABEL).is_some();
        if has_ui_window {
            let snap = state.snapshot();
            let _ = app_clone.emit("snapshot-updated", &snap);
        }
    });
}

pub fn setup_tray(app: &AppHandle, state: &SharedAppState) -> tauri::Result<TrayIcon<tauri::Wry>> {
    let enabled = state.enabled.load(Ordering::Relaxed);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(generate_tray_icon(enabled))
        .tooltip(if enabled {
            "CharismaScroll — Active"
        } else {
            "CharismaScroll — Paused"
        })
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                create_or_focus_main_window(tray.app_handle());
            }
            TrayIconEvent::Click {
                button: MouseButton::Right,
                button_state: MouseButtonState::Up,
                position,
                ..
            } => {
                toggle_tray_menu_popup(tray.app_handle(), position.x, position.y);
            }
            _ => {}
        })
        .build(app)
}
