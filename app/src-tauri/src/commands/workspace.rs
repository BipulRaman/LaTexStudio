use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;

use crate::errors::{AppError, AppResult};

// `% !TEX root = main.tex` (also `!TEX root=`, `!tex root :`) — typically near the top.
static RE_MAGIC_ROOT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^\s*%+\s*!T[eE]X\s+root\s*[=:]\s*(.+)\s*$").unwrap());

#[tauri::command]
pub fn detect_root(path: String) -> AppResult<Option<String>> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::NotFound(path));
    }
    let content = std::fs::read_to_string(&p).unwrap_or_default();
    // Only scan the first ~30 lines — the magic comment lives near the top.
    let head: String = content.lines().take(30).collect::<Vec<_>>().join("\n");
    if let Some(c) = RE_MAGIC_ROOT.captures(&head) {
        let raw = c.get(1).unwrap().as_str().trim();
        // Resolve relative to the current file's directory.
        let base = p.parent().unwrap_or(Path::new("."));
        let resolved = base.join(raw);
        if resolved.exists() {
            return Ok(Some(resolved.to_string_lossy().to_string()));
        }
        return Ok(Some(raw.to_string()));
    }
    Ok(None)
}
