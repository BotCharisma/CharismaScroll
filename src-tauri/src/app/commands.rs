use crate::app::tray::refresh_tray_state;
use crate::config::{
    app_data_dir, delete_custom_preset_file, load_custom_presets, resolve_preset_profile,
    save_custom_preset_file, AppSettings, CustomPreset, ScrollProfile,
};
use crate::platform::{
    detect_primary_monitor_hz, is_running_as_admin, list_running_apps, rebind_global_hotkey,
    restart_as_admin, sync_autostart, RunningAppInfo,
};
use parking_lot::RwLock;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct SharedAppState {
    pub settings: Arc<RwLock<AppSettings>>,
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

impl SharedAppState {
    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            settings: self.settings.read().clone(),
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
        let prev = self.settings.read().clone();

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
        *self.settings.write() = sanitized;

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
    let mut next = state.settings.read().clone();
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
    let mut next = state.settings.read().clone();
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
    let mut next = state.settings.read().clone();
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
    let mut next = state.settings.read().clone();
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
