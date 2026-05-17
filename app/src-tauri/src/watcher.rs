use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::errors::{AppError, AppResult};

pub type Watcher = Debouncer<notify::RecommendedWatcher>;

#[derive(Debug, Default)]
pub struct WatcherState {
    inner: Mutex<Option<WatcherSlot>>,
}

struct WatcherSlot {
    _watcher: Watcher,
    root: PathBuf,
}

impl std::fmt::Debug for WatcherSlot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WatcherSlot").field("root", &self.root).finish()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FsChangeKind {
    Any,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsChangeEvent {
    pub root: String,
    pub paths: Vec<String>,
    pub kind: FsChangeKind,
}

const EVENT: &str = "fs:changed";

#[tauri::command]
pub fn start_watch(
    app: AppHandle,
    state: State<'_, Arc<WatcherState>>,
    path: String,
) -> AppResult<()> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(AppError::NotFound(path));
    }
    let canonical = root.canonicalize().unwrap_or(root.clone());

    let app_for_cb = app.clone();
    let root_for_cb = canonical.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: DebounceEventResult| match res {
            Ok(events) if !events.is_empty() => {
                let paths = events
                    .iter()
                    .map(|e| e.path.to_string_lossy().to_string())
                    .collect::<Vec<_>>();
                let _ = app_for_cb.emit(
                    EVENT,
                    FsChangeEvent {
                        root: root_for_cb.to_string_lossy().to_string(),
                        paths,
                        kind: FsChangeKind::Any,
                    },
                );
            }
            Ok(_) => {}
            Err(err) => {
                tracing::warn!("watch error: {err:?}");
            }
        },
    )
    .map_err(|e| AppError::Other(format!("watcher init: {e}")))?;

    debouncer
        .watcher()
        .watch(Path::new(&canonical), RecursiveMode::Recursive)
        .map_err(|e| AppError::Other(format!("watch: {e}")))?;

    let mut slot = state.inner.lock();
    *slot = Some(WatcherSlot {
        _watcher: debouncer,
        root: canonical,
    });
    Ok(())
}

#[tauri::command]
pub fn stop_watch(state: State<'_, Arc<WatcherState>>) -> AppResult<()> {
    let mut slot = state.inner.lock();
    *slot = None;
    Ok(())
}
