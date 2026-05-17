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

/// Filtered directory listing optimized for the file-explorer tree.
///
/// Compared to `list_dir`:
/// * Filters by extension **inside Rust** so huge directories never have
///   their non-matching entries serialized over IPC.
/// * Uses `file_type()` (which on Windows comes from the directory
///   enumeration record itself) instead of `metadata()`, saving one
///   `stat()` syscall per entry.
/// * Skips file sizes (not used by the tree) for the same reason.
///
/// `extensions` is matched case-insensitively, with or without a leading
/// dot. Directories are always kept regardless of the filter so the user
/// can navigate into them.
#[tauri::command]
pub fn list_dir_filtered(path: String, extensions: Vec<String>) -> AppResult<Vec<DirEntry>> {
    let p = to_path(&path)?;
    if !p.exists() {
        return Err(AppError::NotFound(path));
    }
    // Normalize once: lowercase, no leading dot.
    let exts: Vec<String> = extensions
        .iter()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .collect();

    let read = std::fs::read_dir(&p)?;
    // Pre-size conservatively; many huge dirs have far more entries than we keep.
    let mut entries: Vec<DirEntry> = Vec::with_capacity(64);
    for e in read {
        let Ok(e) = e else { continue };
        let name_os = e.file_name();
        let name_cow = name_os.to_string_lossy();
        if name_cow.starts_with('.') {
            // Skip hidden entries by default.
            continue;
        }
        // file_type() avoids the extra stat() that metadata() would do.
        let Ok(ft) = e.file_type() else { continue };
        let is_dir = ft.is_dir();
        if !is_dir {
            // Cheap extension check on the bytes we already have.
            let ext_ok = Path::new(&*name_cow)
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| {
                    let s_low = s.to_ascii_lowercase();
                    exts.iter().any(|allowed| *allowed == s_low)
                })
                .unwrap_or(false);
            if !ext_ok {
                continue;
            }
        }
        entries.push(DirEntry {
            name: name_cow.into_owned(),
            path: e.path().to_string_lossy().into_owned(),
            is_dir,
            size: None,
        });
    }
    // Folders first, then case-insensitive alphabetical.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });
    Ok(entries)
}

/// Create a new empty file at `path`. Errors if the file already exists so
/// the caller never silently truncates an existing file.
#[tauri::command]
pub fn create_file(path: String) -> AppResult<()> {
    let p = to_path(&path)?;
    if p.exists() {
        return Err(AppError::Other(format!(
            "a file or folder named '{}' already exists",
            p.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(path.as_str())
        )));
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Atomic create: O_CREAT | O_EXCL via OpenOptions, so two racing callers
    // can't both think they created the file.
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&p)?;
    Ok(())
}

/// Create a new directory at `path`. Errors if a file/folder already exists
/// at that path.
#[tauri::command]
pub fn create_dir(path: String) -> AppResult<()> {
    let p = to_path(&path)?;
    if p.exists() {
        return Err(AppError::Other(format!(
            "a file or folder named '{}' already exists",
            p.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(path.as_str())
        )));
    }
    std::fs::create_dir_all(&p)?;
    Ok(())
}
