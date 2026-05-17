// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod build;
mod commands;
mod errors;
mod menu;
mod paths;
mod util;
mod watcher;

use std::sync::Arc;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Returns the absolute path of the rolling per-session build log so the
/// frontend can open it (via the opener plugin) in the OS default editor.
#[tauri::command]
fn last_session_log_path(app: tauri::AppHandle) -> Result<String, String> {
    paths::session_log_path(&app)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,latex_studio=debug")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Arc::new(build::runner::BuildState::default()))
        .manage(Arc::new(watcher::WatcherState::default()))
        .manage(Arc::new(commands::spellcheck::SpellState::default()))
        .setup(|app| {
            // Reset the rolling build log on every app start so it only ever
            // holds the current session's builds.
            let handle = app.handle().clone();
            if let Err(e) = paths::reset_session_log(&handle) {
                tracing::warn!("failed to reset session log: {e}");
            }
            menu::setup(app)
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            last_session_log_path,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::list_dir,
            commands::fs::path_exists,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::recents::list_recents,
            commands::recents::push_recent,
            commands::recents::clear_recents,
            commands::workspace::detect_root,
            commands::index::scan_workspace,
            commands::synctex::synctex_forward,
            commands::synctex::synctex_inverse,
            commands::spellcheck::spell_available,
            commands::spellcheck::check_words,
            commands::spellcheck::suggest,
            commands::spellcheck::add_to_dict,
            commands::tectonic::tectonic_status,
            commands::tectonic::install_tectonic,
            build::engine::probe_engines,
            build::runner::compile_latex,
            build::runner::cancel_build,
            build::runner::current_build,
            watcher::start_watch,
            watcher::stop_watch,
            menu::rebuild_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
