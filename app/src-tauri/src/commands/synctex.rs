use serde::Serialize;

use crate::errors::{AppError, AppResult};
use crate::util::quiet_command;

#[derive(Debug, Clone, Serialize)]
pub struct ForwardHit {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub h: f64,
    pub v: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct InverseHit {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

/// Forward search: source location → PDF page coordinates.
/// Returns the first hit (synctex may return multiple — we take the closest).
#[tauri::command]
pub fn synctex_forward(
    #[allow(non_snake_case)] sourceFile: String,
    line: u32,
    column: Option<u32>,
    #[allow(non_snake_case)] pdfPath: String,
) -> AppResult<Option<ForwardHit>> {
    let col = column.unwrap_or(0);
    let arg = format!("{}:{}:{}", line, col, sourceFile);
    let out = quiet_command("synctex")
        .arg("view")
        .arg("-i")
        .arg(&arg)
        .arg("-o")
        .arg(&pdfPath)
        .output()
        .map_err(|e| AppError::Other(format!("synctex view: {e}")))?;

    if !out.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut hit: Option<ForwardHit> = None;
    let mut cur = ForwardHit {
        page: 0,
        x: 0.0,
        y: 0.0,
        h: 0.0,
        v: 0.0,
        width: 0.0,
        height: 0.0,
    };
    let mut in_record = false;
    for raw in stdout.lines() {
        let line = raw.trim();
        if line == "SyncTeX result begin" || line.starts_with("Output:") {
            in_record = true;
            continue;
        }
        if !in_record {
            continue;
        }
        if line == "SyncTeX result end" {
            if hit.is_none() && cur.page > 0 {
                hit = Some(cur.clone());
            }
            break;
        }
        if let Some(rest) = line.strip_prefix("Page:") {
            // New record — commit previous if it had a page.
            if cur.page > 0 && hit.is_none() {
                hit = Some(cur.clone());
            }
            cur = ForwardHit {
                page: rest.trim().parse().unwrap_or(0),
                x: 0.0,
                y: 0.0,
                h: 0.0,
                v: 0.0,
                width: 0.0,
                height: 0.0,
            };
        } else if let Some(rest) = line.strip_prefix("x:") {
            cur.x = rest.trim().parse().unwrap_or(0.0);
        } else if let Some(rest) = line.strip_prefix("y:") {
            cur.y = rest.trim().parse().unwrap_or(0.0);
        } else if let Some(rest) = line.strip_prefix("h:") {
            cur.h = rest.trim().parse().unwrap_or(0.0);
        } else if let Some(rest) = line.strip_prefix("v:") {
            cur.v = rest.trim().parse().unwrap_or(0.0);
        } else if let Some(rest) = line.strip_prefix("W:") {
            cur.width = rest.trim().parse().unwrap_or(0.0);
        } else if let Some(rest) = line.strip_prefix("H:") {
            cur.height = rest.trim().parse().unwrap_or(0.0);
        }
    }
    if hit.is_none() && cur.page > 0 {
        hit = Some(cur);
    }
    Ok(hit)
}

/// Inverse search: PDF coordinates → source location.
#[tauri::command]
pub fn synctex_inverse(
    #[allow(non_snake_case)] pdfPath: String,
    page: u32,
    x: f64,
    y: f64,
) -> AppResult<Option<InverseHit>> {
    let arg = format!("{}:{}:{}:{}", page, x, y, pdfPath);
    let out = quiet_command("synctex")
        .arg("edit")
        .arg("-o")
        .arg(&arg)
        .output()
        .map_err(|e| AppError::Other(format!("synctex edit: {e}")))?;

    if !out.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut file: Option<String> = None;
    let mut line: Option<u32> = None;
    let mut column: u32 = 0;
    for raw in stdout.lines() {
        let l = raw.trim();
        if let Some(rest) = l.strip_prefix("Input:") {
            if file.is_none() {
                file = Some(rest.trim().to_string());
            }
        } else if let Some(rest) = l.strip_prefix("Line:") {
            if line.is_none() {
                line = rest.trim().parse().ok();
            }
        } else if let Some(rest) = l.strip_prefix("Column:") {
            column = rest.trim().parse().unwrap_or(0);
        }
    }
    match (file, line) {
        (Some(f), Some(l)) => Ok(Some(InverseHit { file: f, line: l, column })),
        _ => Ok(None),
    }
}
