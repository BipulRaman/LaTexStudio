use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    errors::{AppError, AppResult},
    paths,
};

const MAX_ITEMS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentItem {
    pub path: String,
    pub kind: String, // "file" | "workspace"
    #[serde(rename = "openedAt")]
    pub opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Recents {
    pub items: Vec<RecentItem>,
}

fn load(app: &AppHandle) -> AppResult<Recents> {
    let p = paths::recents_path(app)?;
    if !p.exists() {
        return Ok(Recents::default());
    }
    let raw = std::fs::read_to_string(&p)?;
    let r = serde_json::from_str::<Recents>(&raw).unwrap_or_default();
    Ok(r)
}

fn save(app: &AppHandle, r: &Recents) -> AppResult<()> {
    let p = paths::recents_path(app)?;
    let s = serde_json::to_string_pretty(r)?;
    std::fs::write(p, s)?;
    Ok(())
}

#[tauri::command]
pub fn list_recents(app: AppHandle) -> AppResult<Vec<RecentItem>> {
    Ok(load(&app)?.items)
}

#[tauri::command]
pub fn push_recent(app: AppHandle, path: String, kind: String) -> AppResult<Vec<RecentItem>> {
    if path.is_empty() {
        return Err(AppError::InvalidPath("empty path".into()));
    }
    let mut r = load(&app)?;
    r.items.retain(|i| i.path != path);
    r.items.insert(
        0,
        RecentItem {
            path,
            kind,
            opened_at: Utc::now().to_rfc3339(),
        },
    );
    r.items.truncate(MAX_ITEMS);
    save(&app, &r)?;
    Ok(r.items)
}

#[tauri::command]
pub fn clear_recents(app: AppHandle) -> AppResult<()> {
    save(&app, &Recents::default())
}
