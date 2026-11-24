use serde::Serialize;
use std::collections::HashSet;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, GetMonitorInfoW, MonitorFromWindow, DEVMODEW, ENUM_CURRENT_SETTINGS,
    MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentThreadId, OpenProcess, OpenProcessToken, PROCESS_QUERY_INFORMATION,
    PROCESS_VM_READ,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetMessageW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, PostThreadMessageW, MSG, SW_SHOWNORMAL, WM_APP,
    WM_HOTKEY,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const WM_REBIND_HOTKEY: u32 = WM_APP + 17;
const HOTKEY_ID: i32 = 1;

static HOTKEY_THREAD_ID: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningAppInfo {
    pub exe_name: String,
    pub display_name: String,
    pub window_title: String,
}

pub fn is_running_as_admin() -> bool {
    unsafe {
        let mut token = Default::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some((&mut elevation as *mut TOKEN_ELEVATION).cast()),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        )
        .is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

pub fn restart_as_admin() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot resolve exe path: {e}"))?;
    let exe_wide: Vec<u16> = exe
        .as_os_str()
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let res = unsafe {
        ShellExecuteW(
            None,
            w!("runas"),
            PCWSTR(exe_wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (res.0 as isize) <= 32 {
        return Err("Elevation was cancelled or denied".to_string());
    }
    Ok(())
}

pub fn sync_autostart(enable: bool, as_admin: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot resolve exe path: {e}"))?;
    let exe_str = exe.to_string_lossy();
    let launch_cmd = format!("\"{exe_str}\" --minimized");

    // Clear both entries first to avoid duplicate launches
    let _ = Command::new("reg")
        .args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "CharismaScroll",
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", "CharismaScroll", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    if !enable {
        return Ok(());
    }

    if as_admin && is_running_as_admin() {
        let out = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                "CharismaScroll",
                "/TR",
                &launch_cmd,
                "/SC",
                "ONLOGON",
                "/RL",
                "HIGHEST",
                "/F",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to invoke schtasks: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    } else {
        let out = Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "CharismaScroll",
                "/t",
                "REG_SZ",
                "/d",
                &launch_cmd,
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to update Run registry key: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    }

    Ok(())
}

pub fn process_exe_from_hwnd(hwnd: HWND) -> String {
    if hwnd.0.is_null() {
        return String::new();
    }
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return String::new();
    }
    unsafe {
        let Ok(proc) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) else {
            return String::new();
        };
        let mut buf = [0u16; 260];
        let len = GetModuleFileNameExW(proc, None, &mut buf);
        let _ = windows::Win32::Foundation::CloseHandle(proc);
        if len == 0 {
            return String::new();
        }
        let full = String::from_utf16_lossy(&buf[..len as usize]);
        Path::new(&full)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    }
}

pub fn detect_primary_monitor_hz() -> u32 {
    unsafe {
        let mut dm = DEVMODEW {
            dmSize: std::mem::size_of::<DEVMODEW>() as u16,
            ..Default::default()
        };
        if EnumDisplaySettingsW(None, ENUM_CURRENT_SETTINGS, &mut dm).as_bool()
            && dm.dmDisplayFrequency >= 30
        {
            dm.dmDisplayFrequency.clamp(60, 360)
        } else {
            60
        }
    }
}

pub fn detect_monitor_hz_for_window(hwnd: HWND) -> u32 {
    unsafe {
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(hmon, (&mut info as *mut MONITORINFOEXW).cast()).as_bool() {
            let mut dm = DEVMODEW {
                dmSize: std::mem::size_of::<DEVMODEW>() as u16,
                ..Default::default()
            };
            if EnumDisplaySettingsW(
                PCWSTR(info.szDevice.as_ptr()),
                ENUM_CURRENT_SETTINGS,
                &mut dm,
            )
            .as_bool()
                && dm.dmDisplayFrequency >= 30
            {
                return dm.dmDisplayFrequency.clamp(60, 360);
            }
        }
    }
    detect_primary_monitor_hz()
}

pub fn is_window_fullscreen_game(hwnd: HWND, exe_name: &str) -> bool {
    if hwnd.0.is_null() {
        return false;
    }
    // Ignore Windows desktop shells and standard browsers/editors in fullscreen reading mode
    let lower = exe_name.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "explorer.exe"
            | "progman.exe"
            | "shellexperiencehost.exe"
            | "searchhost.exe"
            | "chrome.exe"
            | "msedge.exe"
            | "firefox.exe"
            | "brave.exe"
            | "code.exe"
    ) {
        return false;
    }

    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(hmon, &mut info).as_bool() {
            return false;
        }
        let m = info.rcMonitor;
        rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
    }
}

pub fn list_running_apps() -> Vec<RunningAppInfo> {
    struct EnumState {
        seen: HashSet<String>,
        items: Vec<RunningAppInfo>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let title_len = GetWindowTextLengthW(hwnd);
        if title_len <= 0 {
            return BOOL(1);
        }
        let mut title_buf = vec![0u16; (title_len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut title_buf);
        if copied <= 0 {
            return BOOL(1);
        }
        let window_title = String::from_utf16_lossy(&title_buf[..copied as usize]);
        let exe_name = process_exe_from_hwnd(hwnd);
        if exe_name.is_empty() {
            return BOOL(1);
        }
        let lower = exe_name.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "charismascroll.exe"
                | "charisma-scroll.exe"
                | "applicationframehost.exe"
                | "textinputhost.exe"
                | "shellexperiencehost.exe"
                | "systemsettings.exe"
        ) {
            return BOOL(1);
        }

        let state = &mut *(lparam.0 as *mut EnumState);
        if state.seen.insert(lower) {
            let display_name = exe_name
                .strip_suffix(".exe")
                .or_else(|| exe_name.strip_suffix(".EXE"))
                .unwrap_or(&exe_name)
                .to_string();
            state.items.push(RunningAppInfo {
                exe_name,
                display_name,
                window_title,
            });
        }
        BOOL(1)
    }

    let mut state = EnumState {
        seen: HashSet::new(),
        items: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM((&mut state as *mut EnumState) as isize));
    }
    state
        .items
        .sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
    state.items
}

fn parse_hotkey(spec: &str) -> Option<(HOT_KEY_MODIFIERS, u32)> {
    let mut mods = MOD_NOREPEAT;
    let mut vk: Option<u32> = None;

    for raw in spec.split('+') {
        let part = raw.trim().to_ascii_uppercase();
        match part.as_str() {
            "ALT" => mods |= MOD_ALT,
            "CTRL" | "CONTROL" => mods |= MOD_CONTROL,
            "SHIFT" => mods |= MOD_SHIFT,
            "WIN" | "META" | "SUPER" => mods |= MOD_WIN,
            s if s.len() == 1 => {
                let ch = s.as_bytes()[0];
                if ch.is_ascii_alphanumeric() {
                    vk = Some(ch as u32);
                }
            }
            "SPACE" => vk = Some(0x20),
            "F1" => vk = Some(0x70),
            "F2" => vk = Some(0x71),
            "F3" => vk = Some(0x72),
            "F4" => vk = Some(0x73),
            "F5" => vk = Some(0x74),
            "F6" => vk = Some(0x75),
            "F7" => vk = Some(0x76),
            "F8" => vk = Some(0x77),
            "F9" => vk = Some(0x78),
            "F10" => vk = Some(0x79),
            "F11" => vk = Some(0x7A),
            "F12" => vk = Some(0x7B),
            _ => {}
        }
    }

    vk.map(|k| (mods, k))
}

static SHARED_HOTKEY_SPEC: parking_lot::RwLock<Option<String>> = parking_lot::RwLock::new(None);

pub fn rebind_global_hotkey(spec: &str) {
    *SHARED_HOTKEY_SPEC.write() = Some(spec.to_string());
    let tid = HOTKEY_THREAD_ID.load(Ordering::Relaxed);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_REBIND_HOTKEY, WPARAM(0), LPARAM(0));
        }
    }
}

pub fn spawn_hotkey_thread<F>(initial_spec: String, on_trigger: F)
where
    F: Fn() + Send + 'static,
{
    *SHARED_HOTKEY_SPEC.write() = Some(initial_spec);
    std::thread::Builder::new()
        .name("charisma-hotkey".to_string())
        .spawn(move || unsafe {
            let tid = GetCurrentThreadId();
            HOTKEY_THREAD_ID.store(tid, Ordering::Relaxed);

            let register_current = || {
                let _ = UnregisterHotKey(None, HOTKEY_ID);
                if let Some(ref spec) = *SHARED_HOTKEY_SPEC.read() {
                    if let Some((mods, vk)) = parse_hotkey(spec) {
                        let _ = RegisterHotKey(None, HOTKEY_ID, mods, vk);
                    }
                }
            };

            register_current();

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                    on_trigger();
                } else if msg.message == WM_REBIND_HOTKEY {
                    register_current();
                }
            }
            let _ = UnregisterHotKey(None, HOTKEY_ID);
        })
        .expect("Failed to spawn hotkey thread");
}
