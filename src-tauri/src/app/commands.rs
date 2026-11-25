use crate::app::tray::{
    create_or_focus_main_window, hide_tray_menu, refresh_tray_state, resize_tray_menu,
};
use crate::config::{
    app_data_dir, delete_custom_preset_file, load_custom_presets, resolve_preset_profile,
    save_custom_preset_file, AppRule, AppRuleMode, AppSettings, CustomPreset, ScrollProfile,
};
use crate::engine::hook::stop_mouse_hook_thread;
use crate::platform::{
    detect_primary_monitor_hz, is_running_as_admin, list_running_apps, rebind_global_hotkey,
    restart_as_admin, stop_hotkey_thread, sync_autostart, RunningAppInfo,
};
use parking_lot::RwLock;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct SharedAppState {
    pub settings: Arc<RwLock<Arc<AppSettings>>>,
    pub enabled: Arc<AtomicBool>,
    pub passthrough_ctrl_alt: Arc<AtomicBool>,
    pub target_fps: Arc<AtomicU32>,
    pub telemetry_active: Arc<AtomicBool>,
    pub last_scrolled_exe: Arc<RwLock<Option<String>>>,
    pub should_exit: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub settings: AppSettings,
    pub custom_presets: Vec<CustomPreset>,
    pub storage_dir: String,
    pub is_admin: bool,
    pub detected_hz: u32,
    pub last_scrolled_exe: Option<String>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressPayload {
    pub downloaded: usize,
    pub total: Option<u64>,
    pub stage: String,
}

impl SharedAppState {
    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            settings: (**self.settings.read()).clone(),
            custom_presets: load_custom_presets(),
            storage_dir: app_data_dir().to_string_lossy().to_string(),
            is_admin: is_running_as_admin(),
            detected_hz: detect_primary_monitor_hz(),
            last_scrolled_exe: self.last_scrolled_exe.read().clone(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub fn apply_settings_to_runtime(&self, next: AppSettings, app: &AppHandle) -> Result<AppSnapshot, String> {
        let sanitized = next.sanitized();
        let prev = (**self.settings.read()).clone();

        if prev.start_with_windows != sanitized.start_with_windows
            || prev.start_as_admin != sanitized.start_as_admin
        {
            sync_autostart(sanitized.start_with_windows, sanitized.start_as_admin)?;
        }

        if prev.hotkey != sanitized.hotkey {
            rebind_global_hotkey(&sanitized.hotkey);
        }

        sanitized.save()?;
        self.enabled.store(sanitized.enabled, Ordering::Relaxed);
        self.passthrough_ctrl_alt
            .store(sanitized.passthrough_ctrl_alt, Ordering::Relaxed);
        self.target_fps.store(sanitized.target_fps, Ordering::Relaxed);
        *self.settings.write() = Arc::new(sanitized);

        refresh_tray_state(app);
        let snap = self.snapshot();
        let _ = app.emit("snapshot-updated", &snap);
        Ok(snap)
    }
}

#[tauri::command]
pub fn get_app_snapshot(state: State<'_, SharedAppState>) -> AppSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    settings: AppSettings,
) -> Result<AppSnapshot, String> {
    state.apply_settings_to_runtime(settings, &app)
}

#[tauri::command]
pub fn apply_preset(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    preset_id: String,
) -> Result<AppSnapshot, String> {
    let mut next = (**state.settings.read()).clone();
    next.active_preset = preset_id.clone();
    next.global_profile = resolve_preset_profile(&preset_id);
    state.apply_settings_to_runtime(next, &app)
}

#[tauri::command]
pub fn save_custom_preset(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    name: String,
    profile: ScrollProfile,
) -> Result<AppSnapshot, String> {
    let saved = save_custom_preset_file(&name, profile)?;
    let mut next = (**state.settings.read()).clone();
    next.active_preset = saved.id;
    next.global_profile = saved.profile;
    state.apply_settings_to_runtime(next, &app)
}

#[tauri::command]
pub fn delete_custom_preset(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    preset_id: String,
) -> Result<AppSnapshot, String> {
    delete_custom_preset_file(&preset_id)?;
    let mut next = (**state.settings.read()).clone();
    if next.active_preset == preset_id {
        next.active_preset = "classic".to_string();
        next.global_profile = ScrollProfile::preset("classic");
    }
    state.apply_settings_to_runtime(next, &app)
}

#[tauri::command]
pub fn open_storage_folder() -> Result<(), String> {
    let dir = app_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    Command::new("explorer")
        .arg(&dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Documents folder: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn toggle_engine(
    app: AppHandle,
    state: State<'_, SharedAppState>,
) -> Result<AppSnapshot, String> {
    let mut next = (**state.settings.read()).clone();
    next.enabled = !next.enabled;
    state.apply_settings_to_runtime(next, &app)
}

#[tauri::command]
pub fn get_running_apps() -> Vec<RunningAppInfo> {
    list_running_apps()
}

#[tauri::command]
pub fn elevate_to_admin(app: AppHandle, state: State<'_, SharedAppState>) -> Result<(), String> {
    restart_as_admin()?;
    state.should_exit.store(true, Ordering::Relaxed);
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn set_telemetry_active(state: State<'_, SharedAppState>, active: bool) {
    state.telemetry_active.store(active, Ordering::Relaxed);
}

#[tauri::command]
pub fn tray_open_main(app: AppHandle) {
    create_or_focus_main_window(&app);
}

#[tauri::command]
pub fn tray_quit_app(app: AppHandle, state: State<'_, SharedAppState>) {
    state.should_exit.store(true, Ordering::Relaxed);
    app.exit(0);
}

#[tauri::command]
pub fn tray_hide_menu(app: AppHandle) {
    hide_tray_menu(&app);
}

#[tauri::command]
pub fn tray_resize_menu(app: AppHandle, height: f64) {
    resize_tray_menu(&app, height);
}

#[tauri::command]
pub fn tray_toggle_recent_app(
    app: AppHandle,
    state: State<'_, SharedAppState>,
) -> Result<AppSnapshot, String> {
    if let Some(exe) = state.last_scrolled_exe.read().clone() {
        let mut next = (**state.settings.read()).clone();
        if let Some(pos) = next
            .app_rules
            .iter()
            .position(|r| r.exe_name.eq_ignore_ascii_case(&exe))
        {
            if next.app_rules[pos].mode == AppRuleMode::Disabled {
                next.app_rules.remove(pos);
            } else {
                next.app_rules[pos].mode = AppRuleMode::Disabled;
            }
        } else {
            let display_name = exe
                .strip_suffix(".exe")
                .or_else(|| exe.strip_suffix(".EXE"))
                .unwrap_or(&exe)
                .to_string();
            next.app_rules.push(AppRule {
                exe_name: exe,
                display_name,
                mode: AppRuleMode::Disabled,
                profile: ScrollProfile::default(),
            });
        }
        return state.apply_settings_to_runtime(next, &app);
    }
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let updater = app
        .updater()
        .map_err(|e| format!("Updater unavailable: {e}"))?;
    let maybe_update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?;

    if let Some(update) = maybe_update {
        Ok(UpdateInfo {
            available: true,
            current_version,
            version: Some(update.version),
            body: update.body,
            date: update.date.map(|d| d.to_string()),
        })
    } else {
        Ok(UpdateInfo {
            available: false,
            current_version,
            version: None,
            body: None,
            date: None,
        })
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, SharedAppState>) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Updater unavailable: {e}"))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?
    else {
        return Err("Already up to date".to_string());
    };

    let mut downloaded: usize = 0;
    let progress_app = app.clone();
    let finish_app = app.clone();
    let should_exit = state.should_exit.clone();

    update
        .download_and_install(
            move |chunk_len, content_len| {
                downloaded += chunk_len;
                let _ = progress_app.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        downloaded,
                        total: content_len,
                        stage: "downloading".to_string(),
                    },
                );
            },
            move || {
                // Allow app to exit cleanly and unhook Win32 hooks before Windows installer overwrites binary
                should_exit.store(true, Ordering::Relaxed);
                stop_mouse_hook_thread();
                stop_hotkey_thread();
                let _ = finish_app.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        downloaded: 0,
                        total: None,
                        stage: "installing".to_string(),
                    },
                );
            },
        )
        .await
        .map_err(|e| format!("Update failed: {e}"))?;

    app.restart();
}
