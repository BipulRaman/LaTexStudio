use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    errors::{AppError, AppResult},
    paths,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,                // "dark" | "light" | "system"
    pub engine: String,               // "tectonic" (default) | "latexmk" | "pdflatex" | "xelatex" | "lualatex"
    #[serde(rename = "buildOnSave")]
    pub build_on_save: bool,
    #[serde(rename = "spellLang")]
    pub spell_lang: String, // e.g. "en_US"
    #[serde(rename = "fontSize")]
    pub font_size: u32,
    #[serde(rename = "tabSize")]
    pub tab_size: u32,
    #[serde(rename = "wordWrap")]
    pub word_wrap: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            engine: "tectonic".into(),
            build_on_save: true,
            spell_lang: "en_US".into(),
            font_size: 14,
            tab_size: 2,
            word_wrap: true,
        }
    }
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> AppResult<Settings> {
    let path = paths::settings_path(&app)?;
    if !path.exists() {
        let s = Settings::default();
        save_settings_internal(&app, &s)?;
        return Ok(s);
    }
    let raw = std::fs::read_to_string(&path)?;
    let parsed: Settings = serde_json::from_str(&raw).map_err(AppError::from)?;
    Ok(parsed)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> AppResult<()> {
    save_settings_internal(&app, &settings)
}

fn save_settings_internal(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    let path = paths::settings_path(app)?;
    let s = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, s)?;
    Ok(())
}
