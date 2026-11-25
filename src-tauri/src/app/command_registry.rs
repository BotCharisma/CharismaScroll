use crate::app::commands;

pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::get_app_snapshot,
        commands::update_settings,
        commands::apply_preset,
        commands::save_custom_preset,
        commands::delete_custom_preset,
        commands::open_storage_folder,
        commands::toggle_engine,
        commands::get_running_apps,
        commands::elevate_to_admin,
        commands::set_telemetry_active,
        commands::tray_open_main,
        commands::tray_quit_app,
        commands::tray_hide_menu,
        commands::tray_resize_menu,
        commands::tray_toggle_recent_app,
        commands::check_for_update,
        commands::install_update,
    ]
}
