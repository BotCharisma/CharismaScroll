use serde::Serialize;
use std::collections::HashSet;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM, POINT, RECT,
    WAIT_OBJECT_0, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, DEVMODEW,
    ENUM_CURRENT_SETTINGS, MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
    MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
use windows::Win32::System::Threading::{
    CreateEventW, CreateMutexW, GetCurrentProcess, GetCurrentThreadId, OpenEventW, OpenProcess,
    OpenProcessToken, SetEvent, WaitForSingleObject, EVENT_MODIFY_STATE, INFINITE,
    PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetMessageW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, PostThreadMessageW, MSG, SW_SHOWNORMAL, WM_APP,
    WM_HOTKEY, WM_QUIT,
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

pub fn stop_hotkey_thread() {
    let tid = HOTKEY_THREAD_ID.swap(0, Ordering::Relaxed);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

/// Ensures only one CharismaScroll instance runs per user session; a second launch wakes the existing instance.
pub struct SingleInstanceGuard {
    mutex: HANDLE,
    show_event: HANDLE,
}

unsafe impl Send for SingleInstanceGuard {}
unsafe impl Sync for SingleInstanceGuard {}

impl SingleInstanceGuard {
    pub fn acquire() -> Option<Self> {
        unsafe {
            let Ok(mutex) = CreateMutexW(None, false, w!("Local\\CharismaScroll_SingleInstance_v1")) else {
                return None;
            };
            if GetLastError() == ERROR_ALREADY_EXISTS {
                if let Ok(evt) = OpenEventW(
                    EVENT_MODIFY_STATE,
                    false,
                    w!("Local\\CharismaScroll_ShowEvent_v1"),
                ) {
                    let _ = SetEvent(evt);
                    let _ = CloseHandle(evt);
                }
                let _ = CloseHandle(mutex);
                return None;
            }
            let Ok(show_event) = CreateEventW(None, false, false, w!("Local\\CharismaScroll_ShowEvent_v1")) else {
                let _ = CloseHandle(mutex);
                return None;
            };
            Some(Self { mutex, show_event })
        }
    }

    pub fn spawn_focus_listener<F>(&self, on_focus: F)
    where
        F: Fn() + Send + 'static,
    {
        let event_raw = self.show_event.0 as usize;
        let _ = std::thread::Builder::new()
            .name("charisma-single-instance".to_string())
            .spawn(move || unsafe {
                let handle = HANDLE(event_raw as *mut std::ffi::c_void);
                while WaitForSingleObject(handle, INFINITE) == WAIT_OBJECT_0 {
                    on_focus();
                }
            });
    }
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            if !self.show_event.is_invalid() {
                let _ = CloseHandle(self.show_event);
            }
            if !self.mutex.is_invalid() {
                let _ = CloseHandle(self.mutex);
            }
        }
    }
}

#[link(name = "advapi32")]
extern "system" {
    fn RegGetValueW(
        hkey: isize,
        lp_sub_key: *const u16,
        lp_value: *const u16,
        dw_flags: u32,
        pdw_type: *mut u32,
        pv_data: *mut std::ffi::c_void,
        pcb_data: *mut u32,
    ) -> i32;
    fn RegOpenKeyExW(
        hkey: isize,
        lp_sub_key: *const u16,
        ul_options: u32,
        sam_desired: u32,
        phk_result: *mut isize,
    ) -> i32;
    fn RegNotifyChangeKeyValue(
        hkey: isize,
        b_watch_subtree: i32,
        dw_notify_filter: u32,
        h_event: isize,
        f_asynchronous: i32,
    ) -> i32;
    fn RegCloseKey(hkey: isize) -> i32;
}

const HKEY_CURRENT_USER: isize = -2147483647; // 0x8000_0001
const RRF_RT_REG_DWORD: u32 = 0x0000_0010;
const KEY_NOTIFY: u32 = 0x0010;
const REG_NOTIFY_CHANGE_LAST_SET: u32 = 0x0000_0004;

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Returns `true` when Windows taskbar / system chrome uses Light theme (`SystemUsesLightTheme == 1`),
/// or `false` when Windows taskbar uses Dark theme (`SystemUsesLightTheme == 0`).
pub fn is_windows_system_light_theme() -> bool {
    let subkey = to_wide_null(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
    let value = to_wide_null("SystemUsesLightTheme");
    let mut data: u32 = 0;
    let mut data_size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut data as *mut u32).cast(),
            &mut data_size,
        )
    };
    status == 0 && data != 0
}

/// Zero-CPU blocking registry watcher for Windows Dark/Light taskbar theme changes.
pub fn spawn_system_theme_watcher<F>(on_change: F)
where
    F: Fn(bool) + Send + 'static,
{
    let _ = std::thread::Builder::new()
        .name("charisma-theme-watch".to_string())
        .spawn(move || {
            let subkey =
                to_wide_null(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            let mut hkey: isize = 0;
            let open_res = unsafe {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    subkey.as_ptr(),
                    0,
                    KEY_NOTIFY,
                    &mut hkey,
                )
            };
            if open_res != 0 || hkey == 0 {
                return;
            }
            let mut last_light = is_windows_system_light_theme();
            loop {
                let wait_res = unsafe {
                    RegNotifyChangeKeyValue(hkey, 0, REG_NOTIFY_CHANGE_LAST_SET, 0, 0)
                };
                if wait_res != 0 {
                    break;
                }
                let next_light = is_windows_system_light_theme();
                if next_light != last_light {
                    last_light = next_light;
                    on_change(next_light);
                }
            }
            unsafe {
                RegCloseKey(hkey);
            }
        });
}

/// Returns `(left, top, right, bottom)` of the work area (excluding taskbar) for the monitor containing `(x, y)`.
pub fn monitor_work_area_at_point(x: i32, y: i32) -> (i32, i32, i32, i32) {
    unsafe {
        let hmon = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut info).as_bool() {
            let w = info.rcWork;
            return (w.left, w.top, w.right, w.bottom);
        }
    }
    (0, 0, 1920, 1040)
}
