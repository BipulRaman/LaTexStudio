use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{Manager, Wry};

use crate::errors::AppResult;

/// Cached UI state — kept for backward compatibility with the frontend
/// `rebuild_menu` invoke. The actual menu is rendered inside the React app
/// for full theme control, so this state is currently only stored.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MenuState {
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub engine: String,
    #[serde(rename = "buildOnSave", default)]
    pub build_on_save: bool,
    #[serde(rename = "showSidebar", default)]
    pub show_sidebar: bool,
    #[serde(rename = "showLogPanel", default)]
    pub show_log_panel: bool,
    #[serde(rename = "hasDoc", default)]
    pub has_doc: bool,
    #[serde(rename = "hasWorkspace", default)]
    pub has_workspace: bool,
    #[serde(rename = "buildRunning", default)]
    pub build_running: bool,
}

#[derive(Default)]
pub struct MenuStateCache {
    pub inner: Mutex<MenuState>,
}

pub fn setup(app: &mut tauri::App<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    // No OS-level menu — the app renders its own dark-themed menu bar.
    let cache: Arc<MenuStateCache> = Arc::new(MenuStateCache::default());
    app.manage(cache);
    Ok(())
}

#[tauri::command]
pub fn rebuild_menu(
    cache: tauri::State<'_, Arc<MenuStateCache>>,
    state: MenuState,
) -> AppResult<()> {
    *cache.inner.lock() = state;
    Ok(())
}
