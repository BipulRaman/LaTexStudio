use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use spellbook::Dictionary;
use tauri::{AppHandle, Manager, State};

use crate::errors::{AppError, AppResult};
use crate::paths;

#[derive(Default)]
pub struct SpellState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    current_lang: Option<String>,
    dict: Option<Dictionary>,
    /// User words (in-memory + flushed to disk).
    user: std::collections::HashSet<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CheckResult {
    pub word: String,
    pub ok: bool,
}

fn user_dict_path(app: &AppHandle, lang: &str) -> AppResult<PathBuf> {
    let mut p = paths::app_data_dir(app)?;
    p.push("user-dict");
    std::fs::create_dir_all(&p)?;
    p.push(format!("{lang}.txt"));
    Ok(p)
}

fn resource_dict_paths(app: &AppHandle, lang: &str) -> Option<(PathBuf, PathBuf)> {
    let res = app
        .path()
        .resolve(
            format!("dictionaries/{lang}.aff"),
            tauri::path::BaseDirectory::Resource,
        )
        .ok()?;
    let dic = res.with_extension("dic");
    Some((res, dic))
}

fn ensure_loaded(app: &AppHandle, state: &SpellState, lang: &str) -> AppResult<bool> {
    let mut inner = state.inner.lock();
    if inner.current_lang.as_deref() == Some(lang) && inner.dict.is_some() {
        return Ok(true);
    }
    let Some((aff_path, dic_path)) = resource_dict_paths(app, lang) else {
        // No dictionary bundled — spellcheck silently disabled.
        inner.current_lang = Some(lang.to_string());
        inner.dict = None;
        return Ok(false);
    };
    if !aff_path.exists() || !dic_path.exists() {
        inner.current_lang = Some(lang.to_string());
        inner.dict = None;
        return Ok(false);
    }
    let aff = std::fs::read_to_string(&aff_path)?;
    let dic = std::fs::read_to_string(&dic_path)?;
    let dict = Dictionary::new(&aff, &dic)
        .map_err(|e| AppError::Other(format!("dict parse: {e}")))?;
    inner.current_lang = Some(lang.to_string());
    inner.dict = Some(dict);

    // Load persisted user words.
    if let Ok(path) = user_dict_path(app, lang) {
        if path.exists() {
            if let Ok(text) = std::fs::read_to_string(&path) {
                for line in text.lines() {
                    let w = line.trim();
                    if !w.is_empty() {
                        inner.user.insert(w.to_string());
                    }
                }
            }
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn spell_available(
    app: AppHandle,
    state: State<'_, Arc<SpellState>>,
    lang: String,
) -> AppResult<bool> {
    ensure_loaded(&app, &state, &lang)
}

#[tauri::command]
pub fn check_words(
    app: AppHandle,
    state: State<'_, Arc<SpellState>>,
    lang: String,
    words: Vec<String>,
) -> AppResult<Vec<CheckResult>> {
    if !ensure_loaded(&app, &state, &lang)? {
        // Dictionary missing — pretend everything is fine.
        return Ok(words.into_iter().map(|w| CheckResult { word: w, ok: true }).collect());
    }
    let inner = state.inner.lock();
    let dict = inner.dict.as_ref().unwrap();
    let mut out = Vec::with_capacity(words.len());
    for w in words {
        let ok = inner.user.contains(&w) || dict.check(&w);
        out.push(CheckResult { word: w, ok });
    }
    Ok(out)
}

#[tauri::command]
pub fn suggest(
    app: AppHandle,
    state: State<'_, Arc<SpellState>>,
    lang: String,
    word: String,
) -> AppResult<Vec<String>> {
    if !ensure_loaded(&app, &state, &lang)? {
        return Ok(vec![]);
    }
    let inner = state.inner.lock();
    let dict = inner.dict.as_ref().unwrap();
    let mut s: Vec<String> = Vec::new();
    dict.suggest(&word, &mut s);
    s.truncate(8);
    Ok(s)
}

#[tauri::command]
pub fn add_to_dict(
    app: AppHandle,
    state: State<'_, Arc<SpellState>>,
    lang: String,
    word: String,
) -> AppResult<()> {
    if word.trim().is_empty() {
        return Err(AppError::InvalidPath("empty word".into()));
    }
    ensure_loaded(&app, &state, &lang)?;
    let mut inner = state.inner.lock();
    inner.user.insert(word.clone());
    let path = user_dict_path(&app, &lang)?;
    let mut text = std::fs::read_to_string(&path).unwrap_or_default();
    if !text.ends_with('\n') && !text.is_empty() {
        text.push('\n');
    }
    text.push_str(&word);
    text.push('\n');
    std::fs::write(path, text)?;
    Ok(())
}
