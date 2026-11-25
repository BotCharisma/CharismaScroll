use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use windows::Win32::UI::Shell::{FOLDERID_Documents, KF_FLAG_CREATE, SHGetKnownFolderPath};

#[link(name = "ole32")]
extern "system" {
    fn CoTaskMemFree(pv: *const std::ffi::c_void);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EasingCurve {
    OutExpo,
    OutQuint,
    OutCubic,
    OutQuart,
    Linear,
}

impl EasingCurve {
    /// Evaluates normalized displacement y(t) for progress t in [0.0, 1.0].
    pub fn evaluate(&self, t: f64) -> f64 {
        let clamped = t.clamp(0.0, 1.0);
        if clamped <= 0.0 {
            return 0.0;
        }
        if clamped >= 1.0 {
            return 1.0;
        }
        match self {
            Self::OutExpo => 1.0 - 2.0_f64.powf(-10.0 * clamped),
            Self::OutQuint => 1.0 - (1.0 - clamped).powi(5),
            Self::OutQuart => 1.0 - (1.0 - clamped).powi(4),
            Self::OutCubic => 1.0 - (1.0 - clamped).powi(3),
            Self::Linear => clamped,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollProfile {
    pub step_size_px: u32,
    pub animation_time_ms: u32,
    pub acceleration_delta_ms: u32,
    pub acceleration_max: f64,
    pub easing: EasingCurve,
    pub reverse_vertical: bool,
    pub reverse_horizontal: bool,
    pub horizontal_smooth: bool,
    pub shift_wheel_horizontal: bool,
    pub stop_on_reverse: bool,
}

impl Default for ScrollProfile {
    fn default() -> Self {
        Self::preset("classic")
    }
}

impl ScrollProfile {
    pub fn preset(id: &str) -> Self {
        match id {
            "macbook" => Self {
                step_size_px: 95,
                animation_time_ms: 520,
                acceleration_delta_ms: 85,
                acceleration_max: 3.4,
                easing: EasingCurve::OutExpo,
                reverse_vertical: false,
                reverse_horizontal: false,
                horizontal_smooth: true,
                shift_wheel_horizontal: true,
                stop_on_reverse: true,
            },
            "coding" => Self {
                step_size_px: 90,
                animation_time_ms: 210,
                acceleration_delta_ms: 55,
                acceleration_max: 2.0,
                easing: EasingCurve::OutCubic,
                reverse_vertical: false,
                reverse_horizontal: false,
                horizontal_smooth: true,
                shift_wheel_horizontal: true,
                stop_on_reverse: true,
            },
            "cinema" => Self {
                step_size_px: 135,
                animation_time_ms: 680,
                acceleration_delta_ms: 80,
                acceleration_max: 3.0,
                easing: EasingCurve::OutQuart,
                reverse_vertical: false,
                reverse_horizontal: false,
                horizontal_smooth: true,
                shift_wheel_horizontal: true,
                stop_on_reverse: true,
            },
            _ => Self {
                step_size_px: 110,
                animation_time_ms: 420,
                acceleration_delta_ms: 70,
                acceleration_max: 2.8,
                easing: EasingCurve::OutQuint,
                reverse_vertical: false,
                reverse_horizontal: false,
                horizontal_smooth: true,
                shift_wheel_horizontal: true,
                stop_on_reverse: true,
            },
        }
    }

    pub fn sanitized(mut self) -> Self {
        self.step_size_px = self.step_size_px.clamp(40, 300);
        self.animation_time_ms = self.animation_time_ms.clamp(100, 1000);
        self.acceleration_delta_ms = self.acceleration_delta_ms.clamp(20, 150);
        self.acceleration_max = self.acceleration_max.clamp(1.0, 6.0);
        self
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomPreset {
    pub id: String,
    pub name: String,
    pub profile: ScrollProfile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AppRuleMode {
    Disabled,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRule {
    pub exe_name: String,
    pub display_name: String,
    pub mode: AppRuleMode,
    pub profile: ScrollProfile,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub enabled: bool,
    pub active_preset: String,
    pub global_profile: ScrollProfile,
    pub app_rules: Vec<AppRule>,
    pub game_mode_fullscreen: bool,
    pub bypass_touchpad: bool,
    pub passthrough_ctrl_alt: bool,
    pub hotkey: String,
    pub target_fps: u32,
    pub language: String,
    pub theme: String,
    pub start_with_windows: bool,
    pub start_as_admin: bool,
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default)]
    pub dismissed_tips: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            active_preset: "classic".to_string(),
            global_profile: ScrollProfile::preset("classic"),
            app_rules: Vec::new(),
            game_mode_fullscreen: true,
            bypass_touchpad: true,
            passthrough_ctrl_alt: true,
            hotkey: "Alt+Shift+S".to_string(),
            target_fps: 0,
            language: "en".to_string(),
            theme: "dark".to_string(),
            start_with_windows: false,
            start_as_admin: false,
            onboarding_completed: false,
            dismissed_tips: Vec::new(),
        }
    }
}

/// Resolves the authoritative Windows Documents folder (automatically handling OneDrive Known Folder Move).
pub fn resolve_documents_dir() -> PathBuf {
    unsafe {
        if let Ok(pwstr) = SHGetKnownFolderPath(&FOLDERID_Documents, KF_FLAG_CREATE, None) {
            if !pwstr.is_null() {
                let path_str = pwstr.to_string().unwrap_or_default();
                CoTaskMemFree(pwstr.0.cast());
                if !path_str.is_empty() {
                    return PathBuf::from(path_str);
                }
            }
        }
    }
    // Fallbacks if Shell Known Folder API is unavailable
    if let Ok(onedrive) = std::env::var("OneDrive") {
        let candidate = PathBuf::from(onedrive).join("Documents");
        if candidate.exists() {
            return candidate;
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let od = PathBuf::from(&profile).join("OneDrive").join("Documents");
        if od.exists() {
            return od;
        }
        return PathBuf::from(profile).join("Documents");
    }
    PathBuf::from(".")
}

pub fn app_data_dir() -> PathBuf {
    resolve_documents_dir().join("CharismaScroll")
}

pub fn presets_dir() -> PathBuf {
    app_data_dir().join("presets")
}

pub fn slugify_preset_name(name: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "custom-preset".to_string()
    } else {
        trimmed
    }
}

pub fn load_custom_presets() -> Vec<CustomPreset> {
    let dir = presets_dir();
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut list = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(mut parsed) = serde_json::from_str::<CustomPreset>(&raw) {
                parsed.profile = parsed.profile.sanitized();
                if !parsed.id.is_empty() && !parsed.name.trim().is_empty() {
                    list.push(parsed);
                }
            }
        }
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    list
}

pub fn save_custom_preset_file(name: &str, profile: ScrollProfile) -> Result<CustomPreset, String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("Preset name cannot be empty".to_string());
    }
    let dir = presets_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create presets directory: {e}"))?;

    let slug = slugify_preset_name(clean_name);
    let preset = CustomPreset {
        id: format!("custom:{slug}"),
        name: clean_name.to_string(),
        profile: profile.sanitized(),
    };

    let path = dir.join(format!("{slug}.json"));
    let tmp = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(&preset)
        .map_err(|e| format!("Failed to serialize custom preset: {e}"))?;
    fs::write(&tmp, content).map_err(|e| format!("Failed to write temp preset: {e}"))?;
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to save custom preset: {e}"))?;
    Ok(preset)
}

pub fn delete_custom_preset_file(id: &str) -> Result<(), String> {
    let slug = id.strip_prefix("custom:").unwrap_or(id);
    if slug.is_empty() || slug.contains('/') || slug.contains('\\') || slug.contains("..") {
        return Err("Invalid preset identifier".to_string());
    }
    let path = presets_dir().join(format!("{slug}.json"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete preset: {e}"))?;
    }
    Ok(())
}

pub fn resolve_preset_profile(id: &str) -> ScrollProfile {
    if id.starts_with("custom:") {
        if let Some(found) = load_custom_presets().into_iter().find(|p| p.id == id) {
            return found.profile;
        }
    }
    ScrollProfile::preset(id)
}

impl AppSettings {
    pub fn sanitized(mut self) -> Self {
        self.global_profile = self.global_profile.sanitized();
        for rule in &mut self.app_rules {
            rule.exe_name = rule.exe_name.trim().to_string();
            rule.display_name = rule.display_name.trim().to_string();
            rule.profile = rule.profile.clone().sanitized();
        }
        self.app_rules.retain(|r| !r.exe_name.is_empty());
        self.language = "en".to_string();
        self.theme = "dark".to_string();
        if self.hotkey.trim().is_empty() {
            self.hotkey = "Alt+Shift+S".to_string();
        }
        if self.target_fps != 0 {
            self.target_fps = self.target_fps.clamp(60, 360);
        }
        self
    }

    pub fn config_path() -> PathBuf {
        app_data_dir().join("settings.json")
    }

    fn legacy_appdata_path() -> Option<PathBuf> {
        std::env::var("APPDATA")
            .ok()
            .map(|a| PathBuf::from(a).join("CharismaScroll").join("settings.json"))
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
                return parsed.sanitized();
            }
        }
        // One-time migration from legacy %APPDATA%\CharismaScroll\settings.json into Documents
        if let Some(legacy) = Self::legacy_appdata_path() {
            if let Ok(raw) = fs::read_to_string(&legacy) {
                if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
                    let clean = parsed.sanitized();
                    let _ = clean.save();
                    return clean;
                }
            }
        }
        Self::default()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Cannot create config directory: {e}"))?;
            }
        }
        let tmp = path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;
        fs::write(&tmp, content).map_err(|e| format!("Failed to write temp settings: {e}"))?;
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        fs::rename(&tmp, &path).map_err(|e| format!("Failed to persist settings: {e}"))?;
        Ok(())
    }
}
