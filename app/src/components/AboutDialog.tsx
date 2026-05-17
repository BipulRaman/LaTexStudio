import { useEffect } from "react";
import { FileText, Globe, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  version: string;
};

/** Where to send users for the source / issues / latest release. Kept here
 *  so it's trivial to update in one spot if the repo ever moves. */
const PROJECT_URL = "https://bipul.in/LaTexStudio";
const CREATOR_NAME = "Bipul Raman";
const CREATOR_URL = "https://bipul.in";

async function openExternal(url: string): Promise<void> {
  try {
    // Tauri runtime: open in the user's default browser.
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // Fallback for non-Tauri (vite dev in browser) environments.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function AboutDialog({ open, onClose, version }: Props) {
  // Close on Escape, like the command palette.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-elevated text-fg border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="h-10 w-10 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="about-dialog-title" className="text-base font-semibold leading-tight">
              LaTeX Studio
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">Version {version}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="p-1 rounded text-fg-subtle hover:text-fg hover:bg-bg-hover"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-fg-muted leading-relaxed">
          A simple, fast desktop app for writing LaTeX documents. Edit your
          source on one side, see the polished PDF on the other, and jump
          between the two with a single click.
        </div>

        <div className="px-5 pb-3 text-sm space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-fg-subtle w-20 shrink-0">Created by</span>
            <a
              href={CREATOR_URL}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(CREATOR_URL);
              }}
              className="text-accent hover:underline truncate"
              title={CREATOR_URL}
            >
              {CREATOR_NAME}
            </a>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-fg-subtle w-20 shrink-0">Website</span>
            <a
              href={PROJECT_URL}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(PROJECT_URL);
              }}
              className="text-accent hover:underline truncate inline-flex items-center gap-1"
              title={PROJECT_URL}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{PROJECT_URL.replace(/^https?:\/\//, "")}</span>
            </a>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border bg-bg-panel flex items-center justify-between text-[11px] text-fg-subtle">
          <span>© {new Date().getFullYear()} {CREATOR_NAME}</span>
          <button
            type="button"
            className="px-3 py-1 rounded text-fg hover:bg-bg-hover border border-border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
