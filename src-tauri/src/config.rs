use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
        }
    }
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
        if let Ok(appdata) = std::env::var("APPDATA") {
            let dir = PathBuf::from(appdata).join("CharismaScroll");
            return dir.join("settings.json");
        }
        PathBuf::from("settings.json")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
                return parsed.sanitized();
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
