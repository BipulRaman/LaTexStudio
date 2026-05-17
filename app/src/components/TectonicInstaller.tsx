import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { tectonicApi, type TectonicProgress } from "../api/tectonic";

type Phase = "idle" | "running" | "done" | "error";

type Props = {
  open: boolean;
  /** When true the dialog cannot be dismissed until install completes. */
  required?: boolean;
  onClose: () => void;
  onInstalled: (path: string, version: string | null) => void;
};

export function TectonicInstaller({ open, required = false, onClose, onInstalled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [bytes, setBytes] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to progress events whenever the dialog is open.
  useEffect(() => {
    if (!open) return;
    let unlisten: (() => void) | undefined;
    void tectonicApi
      .onProgress((p: TectonicProgress) => {
        if (p.message) setMessage(p.message);
        if (typeof p.bytes === "number") setBytes(p.bytes);
        if (typeof p.total === "number") setTotal(p.total);
        if (p.phase === "done") setPhase("done");
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, [open]);

  async function startInstall() {
    setPhase("running");
    setError(null);
    setMessage("Contacting GitHub…");
    setBytes(0);
    setTotal(0);
    try {
      const status = await tectonicApi.install();
      setPhase("done");
      if (status.path) {
        onInstalled(status.path, status.version);
      }
    } catch (e: unknown) {
      setPhase("error");
      setError((e as Error).message);
    }
  }

  if (!open) return null;

  const pct = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  // Block dismissal while running, or whenever the dialog is required (no
  // engine installed yet). Once phase === "done" the dialog is dismissible
  // even in required mode so the user can acknowledge success.
  const canDismiss = phase !== "running" && (!required || phase === "done");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        className="w-full max-w-md bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-fg flex items-center gap-2">
            <Download className="h-4 w-4 text-accent" />
            Install Tectonic
          </h2>
          {canDismiss && (
            <button
              onClick={onClose}
              className="text-fg-subtle hover:text-fg"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="px-4 py-4 text-sm text-fg-muted space-y-3">
          {required && phase === "idle" && (
            <p className="text-red-400 text-xs">
              No LaTeX engine was found on this system. Install Tectonic to
              continue, or install MiKTeX / TeX Live system-wide and restart.
            </p>
          )}
          <p>
            Tectonic is a self-contained TeX engine (~20 MB download, ~50 MB on
            disk). It will be placed in LaTeX Studio&apos;s app data folder and used as
            the build engine.
          </p>

          {phase === "idle" && (
            <p className="text-fg-subtle text-xs">
              Latest version will be fetched from GitHub. No system-wide changes
              are made.
            </p>
          )}

          {(phase === "running" || phase === "done") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                {phase === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <span className="text-emerald-400">✓</span>
                )}
                <span className="truncate">{message || "Working…"}</span>
              </div>
              {total > 0 && (
                <>
                  <div className="h-2 bg-bg rounded overflow-hidden border border-border">
                    <div
                      className="h-full bg-accent transition-[width] duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-fg-subtle">
                    <span>
                      {mb(bytes)} / {mb(total)}
                    </span>
                    <span>{pct}%</span>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="text-red-400 text-xs break-words">{error}</div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          {phase === "idle" && (
            <>
              {!required && (
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-fg-muted hover:text-fg rounded"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={startInstall}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover"
              >
                Install Tectonic
              </button>
            </>
          )}
          {phase === "running" && (
            <span className="text-xs text-fg-subtle">Downloading…</span>
          )}
          {phase === "done" && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover"
            >
              Done
            </button>
          )}
          {phase === "error" && (
            <>
              {!required && (
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-fg-muted hover:text-fg rounded"
                >
                  Close
                </button>
              )}
              <button
                onClick={startInstall}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover"
              >
                Retry
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
