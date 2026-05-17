use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

use crate::build::engine::Engine;
use crate::build::log_parser::{self, Diagnostic};
use crate::errors::{AppError, AppResult};

#[derive(Debug, Default)]
pub struct BuildState {
    inner: Mutex<Inner>,
}

#[derive(Debug, Default)]
struct Inner {
    /// Active build (job id, cancel sender). At most one at a time.
    active: Option<(String, oneshot::Sender<()>)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildStatus {
    Started,
    Stdout,
    Stderr,
    Cancelled,
    Failed,
    Succeeded,
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildEvent {
    #[serde(rename = "jobId")]
    pub job_id: String,
    pub status: BuildStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
    #[serde(rename = "exitCode", skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    #[serde(rename = "jobId")]
    pub job_id: String,
    pub success: bool,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "pdfPath", skip_serializing_if = "Option::is_none")]
    pub pdf_path: Option<String>,
    #[serde(rename = "outputDir")]
    pub output_dir: String,
    pub diagnostics: Vec<Diagnostic>,
    pub cancelled: bool,
}

const BUILD_EVENT: &str = "build:progress";

#[tauri::command]
pub async fn compile_latex(
    app: AppHandle,
    state: State<'_, Arc<BuildState>>,
    #[allow(non_snake_case)] sourcePath: String,
    engine: Option<String>,
) -> AppResult<BuildResult> {
    let state = state.inner().clone();
    let source = PathBuf::from(&sourcePath);
    if !source.exists() {
        return Err(AppError::NotFound(sourcePath));
    }
    let project_root = source
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    // Write build outputs (PDF, .log, .aux, .synctex.gz, etc.) next to the
    // source .tex file rather than into the app data directory, so users can
    // find / share / version-control the artifacts alongside the source.
    let out_dir = project_root.clone();
    std::fs::create_dir_all(&out_dir).ok();

    let chosen = engine
        .as_deref()
        .and_then(Engine::from_str_ci)
        .unwrap_or(Engine::Tectonic);

    let job_id = uuid::Uuid::new_v4().to_string();

    // Cancel any previous build.
    {
        let mut inner = state.inner.lock();
        if let Some((_old_id, tx)) = inner.active.take() {
            let _ = tx.send(());
        }
        let (tx, _rx) = oneshot::channel::<()>();
        // Replace with fresh slot momentarily — actual rx set below.
        inner.active = Some((job_id.clone(), tx));
    }
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let mut inner = state.inner.lock();
        inner.active = Some((job_id.clone(), cancel_tx));
    }

    let _ = app.emit(
        BUILD_EVENT,
        BuildEvent {
            job_id: job_id.clone(),
            status: BuildStatus::Started,
            line: Some(format!(
                "{} {}",
                chosen.binary(),
                source.display()
            )),
            exit_code: None,
        },
    );

    let mut cmd = build_command(chosen, &source, &out_dir, &app);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    // Windows: don't pop up a separate console window for the child process.
    crate::util::apply_no_window_async(&mut cmd);

    let mut child: Child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            if matches!(chosen, Engine::Tectonic) {
                AppError::Other(
                    "Tectonic is not installed. Open the toast and click \
                     'Install Tectonic' to download it (≈20 MB)."
                        .into(),
                )
            } else {
                AppError::Other(format!(
                    "'{}' is not installed or not on PATH. Install a TeX distribution \
                     (MiKTeX, TeX Live, or Tectonic — Tectonic can be installed from the \
                     warning toast inside LaTeX Studio) and restart.",
                    chosen.binary()
                ))
            }
        } else {
            AppError::Other(format!("spawn {}: {e}", chosen.binary()))
        }
    })?;

    let app_for_stdout = app.clone();
    let app_for_stderr = app.clone();
    let job_for_stdout = job_id.clone();
    let job_for_stderr = job_id.clone();

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        if let Some(s) = stdout {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_for_stdout.emit(
                    BUILD_EVENT,
                    BuildEvent {
                        job_id: job_for_stdout.clone(),
                        status: BuildStatus::Stdout,
                        line: Some(line),
                        exit_code: None,
                    },
                );
            }
        }
    });
    let stderr_task = tokio::spawn(async move {
        if let Some(s) = stderr {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_for_stderr.emit(
                    BUILD_EVENT,
                    BuildEvent {
                        job_id: job_for_stderr.clone(),
                        status: BuildStatus::Stderr,
                        line: Some(line),
                        exit_code: None,
                    },
                );
            }
        }
    });

    // Wait OR cancel.
    let cancelled;
    let exit_status;
    tokio::select! {
        biased;
        _ = cancel_rx => {
            cancelled = true;
            let _ = child.kill().await;
            exit_status = child.wait().await.ok();
        }
        s = child.wait() => {
            cancelled = false;
            exit_status = s.ok();
        }
    }

    // Drain output tasks.
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    // Clear active slot if it's still us.
    {
        let mut inner = state.inner.lock();
        if let Some((id, _)) = &inner.active {
            if id == &job_id {
                inner.active = None;
            }
        }
    }

    let exit_code = exit_status.as_ref().and_then(|s| s.code());
    let success = !cancelled && exit_status.as_ref().map(|s| s.success()).unwrap_or(false);

    // Read .log + parse diagnostics.
    let stem = source.file_stem().map(|s| s.to_os_string()).unwrap_or_default();
    let log_path = out_dir.join(format!(
        "{}.log",
        stem.to_string_lossy()
    ));
    let log = std::fs::read_to_string(&log_path).unwrap_or_default();
    let diagnostics = log_parser::parse(&log, Some(&source));

    let pdf_path = {
        let p = out_dir.join(format!("{}.pdf", stem.to_string_lossy()));
        if p.exists() { Some(p.to_string_lossy().to_string()) } else { None }
    };

    let status = if cancelled {
        BuildStatus::Cancelled
    } else if success {
        BuildStatus::Succeeded
    } else {
        BuildStatus::Failed
    };
    let _ = app.emit(
        BUILD_EVENT,
        BuildEvent {
            job_id: job_id.clone(),
            status,
            line: None,
            exit_code,
        },
    );

    Ok(BuildResult {
        job_id,
        success,
        exit_code,
        pdf_path,
        output_dir: out_dir.to_string_lossy().to_string(),
        diagnostics,
        cancelled,
    })
}

#[tauri::command]
pub fn cancel_build(state: State<'_, Arc<BuildState>>) -> AppResult<bool> {
    let mut inner = state.inner.lock();
    if let Some((_id, tx)) = inner.active.take() {
        let _ = tx.send(());
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn current_build(state: State<'_, Arc<BuildState>>) -> AppResult<Option<String>> {
    Ok(state.inner.lock().active.as_ref().map(|(id, _)| id.clone()))
}

fn build_command(engine: Engine, source: &Path, out_dir: &Path, app: &AppHandle) -> Command {
    let resolved = engine.resolved_command(Some(app));
    let mut cmd = Command::new(&resolved);
    match engine {
        Engine::Latexmk => {
            // -pdf forces PDF output via pdflatex; users can override via TeX magic.
            cmd.arg("-pdf")
                .arg("-interaction=nonstopmode")
                .arg("-halt-on-error")
                .arg("-file-line-error")
                .arg("-synctex=1")
                .arg(format!("-output-directory={}", out_dir.display()))
                .arg(source);
        }
        Engine::Pdflatex | Engine::Xelatex | Engine::Lualatex => {
            cmd.arg("-interaction=nonstopmode")
                .arg("-halt-on-error")
                .arg("-file-line-error")
                .arg("-synctex=1")
                .arg(format!("-output-directory={}", out_dir.display()))
                .arg(source);
        }
        Engine::Tectonic => {
            // Tectonic v2 CLI: `tectonic -X compile <file>` with synctex + outdir.
            cmd.arg("-X")
                .arg("compile")
                .arg("--synctex")
                .arg("--keep-logs")
                .arg("--keep-intermediates")
                .arg("--outdir")
                .arg(out_dir)
                .arg(source);
        }
    }
    if let Some(parent) = source.parent() {
        cmd.current_dir(parent);
    }
    cmd
}
