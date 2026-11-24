use crate::app::commands::{self, SharedAppState};
use crate::app::tray::{create_or_focus_main_window, refresh_tray_state, setup_tray};
use crate::config::AppSettings;
use crate::engine::hook::{spawn_mouse_hook_thread, HookContext};
use crate::engine::physics::spawn_animator_thread;
use crate::platform::spawn_hotkey_thread;
use crossbeam_channel::bounded;
use parking_lot::RwLock;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_minimized = std::env::args().any(|a| a == "--minimized");
    let initial_settings = AppSettings::load();
    let initial_enabled = initial_settings.enabled;
    let initial_passthrough = initial_settings.passthrough_ctrl_alt;
    let initial_fps = initial_settings.target_fps;
    let initial_hotkey = initial_settings.hotkey.clone();

    let settings_arc = Arc::new(RwLock::new(initial_settings));
    let enabled_arc = Arc::new(AtomicBool::new(initial_enabled));
    let passthrough_arc = Arc::new(AtomicBool::new(initial_passthrough));
    let target_fps_arc = Arc::new(AtomicU32::new(initial_fps));
    let telemetry_arc = Arc::new(AtomicBool::new(!start_minimized));
    let last_exe_arc = Arc::new(RwLock::new(None));
    let should_exit_arc = Arc::new(AtomicBool::new(false));

    let (tx, rx) = bounded(512);

    let shared_state = SharedAppState {
        settings: settings_arc.clone(),
        enabled: enabled_arc.clone(),
        passthrough_ctrl_alt: passthrough_arc.clone(),
        target_fps: target_fps_arc.clone(),
        telemetry_active: telemetry_arc.clone(),
        last_scrolled_exe: last_exe_arc.clone(),
        should_exit: should_exit_arc.clone(),
    };

    let app = tauri::Builder::default()
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_app_snapshot,
            commands::update_settings,
            commands::apply_preset,
            commands::toggle_engine,
            commands::get_running_apps,
            commands::elevate_to_admin,
            commands::set_telemetry_active,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            if start_minimized {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.close();
                }
            } else {
                create_or_focus_main_window(&handle);
            }

            {
                let state = handle.state::<SharedAppState>();
                let _ = setup_tray(&handle, &state)?;
            }

            // Spawn Win32 High-Res Physics Animator Thread
            let telemetry_handle = handle.clone();
            spawn_animator_thread(
                rx,
                passthrough_arc,
                target_fps_arc,
                telemetry_arc,
                move |sample| {
                    let _ = telemetry_handle.emit("scroll-telemetry", &sample);
                },
            );

            // Spawn Win32 WH_MOUSE_LL Hook Thread
            let tray_handle = handle.clone();
            let hook_ctx = Arc::new(HookContext {
                settings: settings_arc,
                tx,
                enabled: enabled_arc,
                last_scrolled_exe: last_exe_arc,
                on_recent_app_changed: Box::new(move || {
                    refresh_tray_state(&tray_handle);
                }),
            });
            spawn_mouse_hook_thread(hook_ctx);

            // Spawn Global Hotkey Listener Thread
            let hotkey_handle = handle.clone();
            spawn_hotkey_thread(initial_hotkey, move || {
                let state = hotkey_handle.state::<SharedAppState>();
                let mut next = state.settings.read().clone();
                next.enabled = !next.enabled;
                let _ = state.apply_settings_to_runtime(next, &hotkey_handle);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build CharismaScroll Tauri application");

    app.run(move |app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } if label == "main" => {
            // WebView2 process released completely; pause UI telemetry to keep ~5-8MB idle RAM
            let state = app_handle.state::<SharedAppState>();
            state.telemetry_active.store(false, Ordering::Relaxed);
        }
        RunEvent::ExitRequested { api, .. } => {
            let state = app_handle.state::<SharedAppState>();
            if !state.should_exit.load(Ordering::Relaxed) {
                api.prevent_exit();
            }
        }
        _ => {}
    });
}
