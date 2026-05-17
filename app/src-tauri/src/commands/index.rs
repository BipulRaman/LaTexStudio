use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct LabelRef {
    pub name: String,
    pub file: String,
    pub line: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CiteKey {
    pub key: String,
    pub file: String,
    /// First non-empty field that looks like a title, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct WorkspaceIndex {
    pub labels: Vec<LabelRef>,
    #[serde(rename = "citeKeys")]
    pub cite_keys: Vec<CiteKey>,
    #[serde(rename = "texFiles")]
    pub tex_files: Vec<String>,
    #[serde(rename = "bibFiles")]
    pub bib_files: Vec<String>,
}

static RE_LABEL: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\label\{([^}]+)\}").unwrap());
static RE_BIB_ENTRY: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?m)^\s*@\w+\s*\{\s*([^,\s]+)\s*,").unwrap());
static RE_BIB_TITLE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)title\s*=\s*[{"]([^}"\n]+)[}"]"#).unwrap());

const MAX_FILES: usize = 5000;
const MAX_DEPTH: usize = 12;

#[tauri::command]
pub fn scan_workspace(root: String) -> WorkspaceIndex {
    let root_path = PathBuf::from(&root);
    let mut index = WorkspaceIndex::default();
    if !root_path.exists() {
        return index;
    }
    let mut files: Vec<PathBuf> = Vec::new();
    walk(&root_path, 0, &mut files);

    for file in files.iter().take(MAX_FILES) {
        let ext = file.extension().and_then(|s| s.to_str()).unwrap_or("");
        let lower = ext.to_ascii_lowercase();
        if lower == "tex" || lower == "ltx" || lower == "latex" {
            index.tex_files.push(file.to_string_lossy().to_string());
            if let Ok(content) = std::fs::read_to_string(file) {
                scan_labels(&content, file, &mut index.labels);
            }
        } else if lower == "bib" {
            index.bib_files.push(file.to_string_lossy().to_string());
            if let Ok(content) = std::fs::read_to_string(file) {
                scan_bib(&content, file, &mut index.cite_keys);
            }
        }
    }
    index.labels.sort_by(|a, b| a.name.cmp(&b.name));
    index.cite_keys.sort_by(|a, b| a.key.cmp(&b.key));
    index
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > MAX_DEPTH || out.len() >= MAX_FILES {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in rd.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        // Skip common heavy directories.
        if path.is_dir() {
            if matches!(
                name.as_ref(),
                "node_modules" | "target" | "build" | "out" | "dist" | ".git"
            ) {
                continue;
            }
            walk(&path, depth + 1, out);
        } else {
            out.push(path);
        }
    }
}

fn scan_labels(text: &str, path: &Path, out: &mut Vec<LabelRef>) {
    let file = path.to_string_lossy().to_string();
    for (idx, line) in text.lines().enumerate() {
        for cap in RE_LABEL.captures_iter(line) {
            out.push(LabelRef {
                name: cap[1].to_string(),
                file: file.clone(),
                line: (idx as u32) + 1,
            });
        }
    }
}

fn scan_bib(text: &str, path: &Path, out: &mut Vec<CiteKey>) {
    let file = path.to_string_lossy().to_string();
    // Split into entries on `@`.
    for entry in text.split('@').skip(1) {
        let entry_with_at = format!("@{entry}");
        if let Some(c) = RE_BIB_ENTRY.captures(&entry_with_at) {
            let key = c[1].to_string();
            let title = RE_BIB_TITLE.captures(&entry_with_at).map(|c| c[1].to_string());
            out.push(CiteKey { key, file: file.clone(), title });
        }
    }
}
