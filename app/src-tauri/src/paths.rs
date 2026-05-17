use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::errors::{AppError, AppResult};

/// Returns the per-app data directory (creates it if missing).
pub fn app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("app_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Per-project build directory under `<app_data>/builds/<hash>`.
#[allow(dead_code)] // wired up in Phase 4
pub fn build_dir(app: &AppHandle, project_root: &Path) -> AppResult<PathBuf> {
    let canonical = project_root
        .canonicalize()
        .unwrap_or_else(|_| project_root.to_path_buf());
    let mut hasher = Sha256::new();
    hasher.update(canonical.to_string_lossy().as_bytes());
    let hash = hex::encode(&hasher.finalize()[..8]);
    let dir = app_data_dir(app)?.join("builds").join(hash);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Path to settings JSON.
pub fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

/// Path to the rolling per-session build log. Truncated on every app start
/// and appended to after every build.
pub fn session_log_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join("last-session.log"))
}

/// Reset the per-session log to empty. Called once at app startup.
pub fn reset_session_log(app: &AppHandle) -> AppResult<PathBuf> {
    let p = session_log_path(app)?;
    std::fs::write(&p, b"")?;
    Ok(p)
}

/// Path to recents JSON.
pub fn recents_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join("recents.json"))
}

/// Path to log directory.
#[allow(dead_code)] // wired up in Phase 11
pub fn logs_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app_data_dir(app)?.join("logs");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
