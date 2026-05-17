//! On-demand Tectonic installer.
//!
//! Downloads the latest Tectonic single-binary release from GitHub and
//! installs it under `<app_data>/bin/tectonic[.exe]`. Emits progress
//! events on `tectonic:progress` so the UI can show a download bar.

use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::errors::{AppError, AppResult};
use crate::paths;

const GITHUB_LATEST: &str =
    "https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest";
const USER_AGENT: &str = "LatApp-Installer";
const PROGRESS_EVENT: &str = "tectonic:progress";

#[derive(Debug, Clone, Serialize)]
struct ProgressEvent<'a> {
    phase: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TectonicStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

/// Path where a user-managed Tectonic binary lives.
pub fn binary_path(app: &AppHandle) -> AppResult<PathBuf> {
    let mut p = paths::app_data_dir(app)?;
    p.push("bin");
    fs::create_dir_all(&p)?;
    p.push(if cfg!(windows) { "tectonic.exe" } else { "tectonic" });
    Ok(p)
}

#[tauri::command]
pub fn tectonic_status(app: AppHandle) -> AppResult<TectonicStatus> {
    let path = match binary_path(&app) {
        Ok(p) => p,
        Err(_) => {
            return Ok(TectonicStatus {
                installed: false,
                path: None,
                version: None,
            })
        }
    };
    if !path.exists() {
        return Ok(TectonicStatus {
            installed: false,
            path: None,
            version: None,
        });
    }
    let version = crate::util::quiet_command(&path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string(),
                )
            } else {
                None
            }
        });
    if version.is_none() {
        // Binary is present but can't be executed — most likely the wrong build
        // (e.g. the GNU build with libfreetype-6.dll missing). Remove it so the
        // user gets re-prompted to install a working one.
        let _ = std::fs::remove_file(&path);
        return Ok(TectonicStatus {
            installed: false,
            path: None,
            version: None,
        });
    }
    Ok(TectonicStatus {
        installed: true,
        path: Some(path.to_string_lossy().to_string()),
        version,
    })
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
}

fn target_asset_match() -> AppResult<&'static [&'static str]> {
    // Tectonic publishes one asset per target triple. We match a few patterns
    // per platform so future renames don't break us.
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok(&["x86_64-pc-windows-msvc.zip", "x86_64-pc-windows-gnu.zip"])
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Ok(&["x86_64-apple-darwin.tar.gz"])
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok(&["aarch64-apple-darwin.tar.gz"])
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok(&["x86_64-unknown-linux-musl.tar.gz", "x86_64-unknown-linux-gnu.tar.gz"])
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Ok(&["aarch64-unknown-linux-musl.tar.gz", "aarch64-unknown-linux-gnu.tar.gz"])
    } else {
        Err(AppError::Other(
            "no Tectonic prebuilt binary for this platform".into(),
        ))
    }
}

fn emit(app: &AppHandle, evt: ProgressEvent<'_>) {
    let _ = app.emit(PROGRESS_EVENT, evt);
}

/// Download the latest Tectonic and install it into app data.
/// Returns the absolute path to the installed binary.
#[tauri::command]
pub async fn install_tectonic(app: AppHandle) -> AppResult<TectonicStatus> {
    let app_clone = app.clone();
    let path =
        tokio::task::spawn_blocking(move || install_tectonic_blocking(&app_clone))
            .await
            .map_err(|e| AppError::Other(format!("join: {e}")))??;

    Ok(TectonicStatus {
        installed: true,
        version: crate::util::quiet_command(&path)
            .arg("--version")
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()),
        path: Some(path.to_string_lossy().to_string()),
    })
}

fn install_tectonic_blocking(app: &AppHandle) -> AppResult<PathBuf> {
    let patterns = target_asset_match()?;

    emit(
        app,
        ProgressEvent {
            phase: "resolving",
            message: Some("Looking up latest Tectonic release…".into()),
            bytes: None,
            total: None,
        },
    );

    let agent = ureq::AgentBuilder::new()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(60))
        .build();

    let release: Release = agent
        .get(GITHUB_LATEST)
        .call()
        .map_err(|e| AppError::Other(format!("github api: {e}")))?
        .into_json()
        .map_err(|e| AppError::Other(format!("github api json: {e}")))?;

    // Prefer the first pattern, fall back to later ones. On Windows we want
    // the MSVC build (statically linked) and never the GNU build (depends on
    // libfreetype-6.dll and friends).
    let asset = patterns
        .iter()
        .find_map(|pat| release.assets.iter().find(|a| a.name.ends_with(pat)))
        .ok_or_else(|| {
            AppError::Other(format!(
                "no matching Tectonic asset for this platform in {} (looked for {:?})",
                release.tag_name, patterns
            ))
        })?;

    emit(
        app,
        ProgressEvent {
            phase: "downloading",
            message: Some(format!("Downloading {} ({})", asset.name, release.tag_name)),
            bytes: Some(0),
            total: Some(asset.size),
        },
    );

    // Download with progress.
    let resp = agent
        .get(&asset.browser_download_url)
        .call()
        .map_err(|e| AppError::Other(format!("download: {e}")))?;
    let total: u64 = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(asset.size);

    let mut reader = resp.into_reader();
    let mut buf = Vec::with_capacity(total.min(64 * 1024 * 1024) as usize);
    let mut chunk = [0u8; 64 * 1024];
    let mut last_emit = std::time::Instant::now();
    loop {
        let n = reader
            .read(&mut chunk)
            .map_err(|e| AppError::Other(format!("read: {e}")))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if last_emit.elapsed().as_millis() > 120 {
            emit(
                app,
                ProgressEvent {
                    phase: "downloading",
                    message: None,
                    bytes: Some(buf.len() as u64),
                    total: Some(total),
                },
            );
            last_emit = std::time::Instant::now();
        }
    }
    emit(
        app,
        ProgressEvent {
            phase: "extracting",
            message: Some("Extracting…".into()),
            bytes: Some(buf.len() as u64),
            total: Some(buf.len() as u64),
        },
    );

    let target = binary_path(app)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }

    if asset.name.ends_with(".zip") {
        extract_tectonic_from_zip(&buf, &target)?;
    } else if asset.name.ends_with(".tar.gz") || asset.name.ends_with(".tgz") {
        extract_tectonic_from_tar_gz(&buf, &target)?;
    } else {
        return Err(AppError::Other(format!(
            "unsupported archive format: {}",
            asset.name
        )));
    }

    // chmod +x on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&target)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&target, perms)?;
    }

    emit(
        app,
        ProgressEvent {
            phase: "done",
            message: Some(format!("Installed Tectonic {}", release.tag_name)),
            bytes: None,
            total: None,
        },
    );

    Ok(target)
}

fn extract_tectonic_from_zip(bytes: &[u8], dest: &std::path::Path) -> AppResult<()> {
    let reader = Cursor::new(bytes);
    let mut zip =
        zip::ZipArchive::new(reader).map_err(|e| AppError::Other(format!("zip: {e}")))?;
    for i in 0..zip.len() {
        let mut file = zip
            .by_index(i)
            .map_err(|e| AppError::Other(format!("zip entry: {e}")))?;
        let name = file.name().to_string();
        let basename = std::path::Path::new(&name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if basename.eq_ignore_ascii_case("tectonic.exe") || basename == "tectonic" {
            let mut out = fs::File::create(dest)?;
            std::io::copy(&mut file, &mut out)?;
            return Ok(());
        }
    }
    Err(AppError::Other(
        "tectonic binary not found in downloaded zip".into(),
    ))
}

fn extract_tectonic_from_tar_gz(bytes: &[u8], dest: &std::path::Path) -> AppResult<()> {
    let gz = flate2::read::GzDecoder::new(Cursor::new(bytes));
    let mut archive = tar::Archive::new(gz);
    for entry in archive
        .entries()
        .map_err(|e| AppError::Other(format!("tar: {e}")))?
    {
        let mut entry = entry.map_err(|e| AppError::Other(format!("tar entry: {e}")))?;
        let path = entry
            .path()
            .map_err(|e| AppError::Other(format!("tar path: {e}")))?
            .into_owned();
        let basename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if basename == "tectonic" || basename.eq_ignore_ascii_case("tectonic.exe") {
            let mut out = fs::File::create(dest)?;
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| AppError::Other(format!("tar read: {e}")))?;
            out.write_all(&buf)?;
            return Ok(());
        }
    }
    Err(AppError::Other(
        "tectonic binary not found in downloaded tar".into(),
    ))
}
