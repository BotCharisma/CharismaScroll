use crate::app::commands::SharedAppState;
use crate::config::{AppRule, AppRuleMode, ScrollProfile};
use std::sync::atomic::Ordering;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const TRAY_ID: &str = "charisma-tray";

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

pub fn generate_tray_icon(active: bool) -> Image<'static> {
    let size = 32usize;
    let mut rgba = vec![0u8; size * size * 4];
    let cx = 15.5_f32;
    let cy = 15.5_f32;

    for y in 0..size {
        for x in 0..size {
            let idx = (y * size + x) * 4;
            let dx = (x as f32 - cx).abs();
            let dy = (y as f32 - cy).abs();
            let qx = (dx - 9.0).max(0.0);
            let qy = (dy - 9.0).max(0.0);
            let dist = (qx * qx + qy * qy).sqrt() - 5.0;

            if dist > 0.6 {
                continue;
            }

            let alpha = (0.6 - dist).clamp(0.0, 1.0);
            let (mut r, mut g, mut b) = if active {
                (26u8, 28u8, 33u8)
            } else {
                (38u8, 40u8, 44u8)
            };

            if dist > -1.3 {
                (r, g, b) = if active { (82, 88, 100) } else { (72, 75, 80) };
            }

            // Mouse wheel capsule outline
            let hx = (dx - 2.8).max(0.0);
            let hy = (dy - 6.8).max(0.0);
            let h_dist = (hx * hx + hy * hy).sqrt() - 3.2;
            if h_dist <= 0.0 && h_dist >= -1.7 {
                (r, g, b) = if active {
                    (232, 236, 244)
                } else {
                    (150, 155, 162)
                };
            }

            // Center wheel notch
            if dx <= 1.8 && dy <= 4.2 {
                (r, g, b) = if active {
                    (236, 94, 56) // Vermilion signal when active
                } else {
                    (130, 134, 140)
                };
            }

            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = (alpha * 255.0) as u8;
        }
    }

    Image::new_owned(rgba, size as u32, size as u32)
}

pub fn build_tray_menu(app: &AppHandle, state: &SharedAppState) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = state.settings.read().clone();
    let is_vi = settings.language == "vi";
    let recent_exe = state.last_scrolled_exe.read().clone();

    let toggle_label = if is_vi {
        if settings.enabled {
            format!("Đang bật làm mượt ({})", settings.hotkey)
        } else {
            format!("Đang tạm dừng ({})", settings.hotkey)
        }
    } else if settings.enabled {
        format!("Smoothing active ({})", settings.hotkey)
    } else {
        format!("Smoothing paused ({})", settings.hotkey)
    };

    let toggle_item = CheckMenuItem::with_id(app, "toggle", toggle_label, true, settings.enabled, None::<&str>)?;

    let preset_classic = CheckMenuItem::with_id(
        app,
        "preset:classic",
        "SmoothScroll Classic",
        true,
        settings.active_preset == "classic",
        None::<&str>,
    )?;
    let preset_mac = CheckMenuItem::with_id(
        app,
        "preset:macbook",
        "MacBook Trackpad",
        true,
        settings.active_preset == "macbook",
        None::<&str>,
    )?;
    let preset_coding = CheckMenuItem::with_id(
        app,
        "preset:coding",
        "Snappy Coding",
        true,
        settings.active_preset == "coding",
        None::<&str>,
    )?;
    let preset_cinema = CheckMenuItem::with_id(
        app,
        "preset:cinema",
        "Cinema Glide",
        true,
        settings.active_preset == "cinema",
        None::<&str>,
    )?;

    let open_label = if is_vi {
        "Mở bảng điều khiển CharismaScroll"
    } else {
        "Open CharismaScroll Studio"
    };
    let open_item = MenuItem::with_id(app, "open", open_label, true, None::<&str>)?;

    let quit_label = if is_vi { "Thoát hoàn toàn" } else { "Quit CharismaScroll" };
    let quit_item = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;

    let menu = Menu::new(app)?;
    menu.append(&toggle_item)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&preset_classic)?;
    menu.append(&preset_mac)?;
    menu.append(&preset_coding)?;
    menu.append(&preset_cinema)?;

    if let Some(exe) = recent_exe {
        let already_disabled = settings
            .app_rules
            .iter()
            .any(|r| r.exe_name.eq_ignore_ascii_case(&exe) && r.mode == AppRuleMode::Disabled);
        let label = if is_vi {
            if already_disabled {
                format!("Bật lại làm mượt cho {exe}")
            } else {
                format!("Tắt làm mượt cho {exe}")
            }
        } else if already_disabled {
            format!("Re-enable smoothing for {exe}")
        } else {
            format!("Disable smoothing for {exe}")
        };
        let app_item = MenuItem::with_id(app, "toggle_recent_app", label, true, None::<&str>)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&app_item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&open_item)?;
    menu.append(&quit_item)?;
    Ok(menu)
}

pub fn create_or_focus_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        apply_win11_rounding(&win);
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    if let Ok(win) = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("CharismaScroll")
        .inner_size(1020.0, 680.0)
        .min_inner_size(880.0, 580.0)
        .center()
        .resizable(true)
        .decorations(false)
        .build()
    {
        apply_win11_rounding(&win);
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
            if let Ok(menu) = build_tray_menu(&app_clone, &state) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

pub fn setup_tray(app: &AppHandle, state: &SharedAppState) -> tauri::Result<TrayIcon<tauri::Wry>> {
    let menu = build_tray_menu(app, state)?;
    let enabled = state.enabled.load(Ordering::Relaxed);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(generate_tray_icon(enabled))
        .tooltip(if enabled {
            "CharismaScroll — Active"
        } else {
            "CharismaScroll — Paused"
        })
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                create_or_focus_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| {
            let state = app.state::<SharedAppState>();
            let id = event.id.as_ref();
            match id {
                "open" => create_or_focus_main_window(app),
                "quit" => {
                    state.should_exit.store(true, Ordering::Relaxed);
                    app.exit(0);
                }
                "toggle" => {
                    let mut next = state.settings.read().clone();
                    next.enabled = !next.enabled;
                    let _ = state.apply_settings_to_runtime(next, app);
                }
                "toggle_recent_app" => {
                    if let Some(exe) = state.last_scrolled_exe.read().clone() {
                        let mut next = state.settings.read().clone();
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
                        let _ = state.apply_settings_to_runtime(next, app);
                    }
                }
                p if p.starts_with("preset:") => {
                    let preset_id = p.trim_start_matches("preset:");
                    let mut next = state.settings.read().clone();
                    next.active_preset = preset_id.to_string();
                    next.global_profile = ScrollProfile::preset(preset_id);
                    let _ = state.apply_settings_to_runtime(next, app);
                }
                _ => {}
            }
            let _ = app.emit("tray-action", id);
        })
        .build(app)
}
