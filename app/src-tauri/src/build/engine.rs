use std::ffi::OsString;
use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::commands::tectonic;
use crate::util::quiet_command;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Latexmk,
    Pdflatex,
    Xelatex,
    Lualatex,
    Tectonic,
}

impl Engine {
    pub fn binary(self) -> &'static str {
        match self {
            Engine::Latexmk => "latexmk",
            Engine::Pdflatex => "pdflatex",
            Engine::Xelatex => "xelatex",
            Engine::Lualatex => "lualatex",
            Engine::Tectonic => "tectonic",
        }
    }

    /// Returns the absolute path of an installed Tectonic if we have one in
    /// app-data; otherwise the bare binary name (resolved via PATH).
    pub fn resolved_command(self, app: Option<&AppHandle>) -> OsString {
        if let (Engine::Tectonic, Some(app)) = (self, app) {
            if let Ok(p) = tectonic::binary_path(app) {
                if p.exists() {
                    return p.into_os_string();
                }
            }
        }
        OsString::from(self.binary())
    }

    pub fn from_str_ci(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "latexmk" => Some(Engine::Latexmk),
            "pdflatex" => Some(Engine::Pdflatex),
            "xelatex" => Some(Engine::Xelatex),
            "lualatex" => Some(Engine::Lualatex),
            "tectonic" => Some(Engine::Tectonic),
            _ => None,
        }
    }

    pub fn all() -> [Engine; 5] {
        [
            Engine::Latexmk,
            Engine::Pdflatex,
            Engine::Xelatex,
            Engine::Lualatex,
            Engine::Tectonic,
        ]
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineInfo {
    pub engine: Engine,
    pub available: bool,
    pub version: Option<String>,
    /// Absolute path to the resolved binary, when available (mostly for
    /// app-installed Tectonic).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

fn try_version(cmd: &PathBuf) -> Option<String> {
    let out = quiet_command(cmd).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string(),
    )
}

/// Probe both PATH and our managed app-data `bin/` directory.
pub fn probe(app: Option<&AppHandle>) -> Vec<EngineInfo> {
    Engine::all()
        .into_iter()
        .map(|e| {
            // 1) Managed path (currently only for Tectonic).
            if let (Engine::Tectonic, Some(app)) = (e, app) {
                if let Ok(p) = tectonic::binary_path(app) {
                    if p.exists() {
                        if let Some(v) = try_version(&p) {
                            return EngineInfo {
                                engine: e,
                                available: true,
                                version: Some(v),
                                path: Some(p.to_string_lossy().to_string()),
                            };
                        } else {
                            // Present but unusable (missing DLL etc.) — remove
                            // so the user is prompted to re-install.
                            let _ = std::fs::remove_file(&p);
                        }
                    }
                }
            }
            // 2) PATH lookup.
            let out = quiet_command(e.binary()).arg("--version").output().ok();
            match out {
                Some(o) if o.status.success() => EngineInfo {
                    engine: e,
                    available: true,
                    version: Some(
                        String::from_utf8_lossy(&o.stdout)
                            .lines()
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string(),
                    ),
                    path: None,
                },
                _ => EngineInfo {
                    engine: e,
                    available: false,
                    version: None,
                    path: None,
                },
            }
        })
        .collect()
}

#[tauri::command]
pub fn probe_engines(app: AppHandle) -> Vec<EngineInfo> {
    probe(Some(&app))
}
