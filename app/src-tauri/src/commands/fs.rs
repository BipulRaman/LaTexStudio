use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub size: Option<u64>,
}

fn to_path(p: &str) -> AppResult<PathBuf> {
    if p.is_empty() {
        return Err(AppError::InvalidPath("empty path".into()));
    }
    Ok(PathBuf::from(p))
}

#[tauri::command]
pub fn read_file(path: String) -> AppResult<String> {
    let p = to_path(&path)?;
    Ok(std::fs::read_to_string(p)?)
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> AppResult<()> {
    let p = to_path(&path)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Atomic-ish: write to temp + rename
    let tmp = p.with_extension(format!(
        "{}.tmp",
        p.extension().and_then(|s| s.to_str()).unwrap_or("")
    ));
    std::fs::write(&tmp, contents.as_bytes())?;
    std::fs::rename(&tmp, &p)?;
    Ok(())
}

#[tauri::command]
pub fn list_dir(path: String) -> AppResult<Vec<DirEntry>> {
    let p = to_path(&path)?;
    if !p.exists() {
        return Err(AppError::NotFound(path));
    }
    let mut entries = Vec::new();
    for e in std::fs::read_dir(&p)? {
        let e = e?;
        let meta = e.metadata()?;
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            // Skip hidden entries by default; the UI can opt-in later.
            continue;
        }
        entries.push(DirEntry {
            name,
            path: e.path().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_file() { Some(meta.len()) } else { None },
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}
