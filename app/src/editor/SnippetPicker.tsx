import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { SnippetKind } from "./EditorToolbar";

type Props = {
  /** `null` when closed. The kind drives which form is rendered. */
  kind: SnippetKind | null;
  onClose: () => void;
  /** Receives the fully-formatted LaTeX snippet to insert at the caret. */
  onInsert: (snippet: string) => void;
};

/** Modal that collects parameters for the snippets that take inputs (link,
 *  image/figure, table) and then emits clean, opinionated LaTeX. The toolbar
 *  uses this for anything fiddlier than a one-shot wrap/insert. */
export function SnippetPicker({ kind, onClose, onInsert }: Props) {
  useEffect(() => {
    if (!kind) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, onClose]);

  if (!kind) return null;

  const title =
    kind === "link" ? "Insert link" : kind === "image" ? "Insert image" : "Insert table";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-bg-elevated text-fg border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="p-1 rounded text-fg-subtle hover:text-fg hover:bg-bg-hover"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {kind === "link" && <LinkForm onInsert={onInsert} onCancel={onClose} />}
          {kind === "image" && <ImageForm onInsert={onInsert} onCancel={onClose} />}
          {kind === "table" && <TableForm onInsert={onInsert} onCancel={onClose} />}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 *  Forms
 * ------------------------------------------------------------------------ */

function LinkForm({
  onInsert,
  onCancel,
}: {
  onInsert: (s: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("https://");
  const [text, setText] = useState("");
  const canSubmit = url.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const label = text.trim() || url.trim();
        onInsert(`\\href{${url.trim()}}{${label}}`);
      }}
      className="space-y-3"
    >
      <Field label="URL" autoFocus value={url} onChange={setUrl} placeholder="https://…" />
      <Field
        label="Link text"
        value={text}
        onChange={setText}
        placeholder="Defaults to the URL"
      />
      <p className="text-[11px] text-fg-subtle">
        Requires{" "}
        <code className="text-fg-muted">\usepackage{"{hyperref}"}</code> in your preamble.
      </p>
      <Actions canSubmit={canSubmit} onCancel={onCancel} submitLabel="Insert link" />
    </form>
  );
}

function ImageForm({
  onInsert,
  onCancel,
}: {
  onInsert: (s: string) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState("");
  const [width, setWidth] = useState("0.8");
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const canSubmit = path.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const w = width.trim() || "0.8";
        const lab = label.trim() || "fig:placeholder";
        const cap = caption.trim() || "Caption";
        onInsert(
          [
            "\\begin{figure}[htbp]",
            "\t\\centering",
            `\t\\includegraphics[width=${w}\\linewidth]{${path.trim()}}`,
            `\t\\caption{${cap}}`,
            `\t\\label{${lab}}`,
            "\\end{figure}",
            "",
          ].join("\n"),
        );
      }}
      className="space-y-3"
    >
      <Field
        label="Image file"
        autoFocus
        value={path}
        onChange={setPath}
        placeholder="figures/diagram.png"
      />
      <Field
        label="Width (× line width)"
        value={width}
        onChange={setWidth}
        placeholder="0.8"
      />
      <Field label="Caption" value={caption} onChange={setCaption} />
      <Field label="Label" value={label} onChange={setLabel} placeholder="fig:diagram" />
      <p className="text-[11px] text-fg-subtle">
        Requires <code className="text-fg-muted">\usepackage{"{graphicx}"}</code>.
      </p>
      <Actions canSubmit={canSubmit} onCancel={onCancel} submitLabel="Insert image" />
    </form>
  );
}

function TableForm({
  onInsert,
  onCancel,
}: {
  onInsert: (s: string) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const [hasHeader, setHasHeader] = useState(true);

  // Clamp so the user can't accidentally generate a 1000×1000 table.
  const safeRows = Math.max(1, Math.min(20, Math.floor(rows) || 1));
  const safeCols = Math.max(1, Math.min(10, Math.floor(cols) || 1));

  const preview = useMemo(
    () => buildTable(safeRows, safeCols, hasHeader, caption.trim(), label.trim()),
    [safeRows, safeCols, hasHeader, caption, label],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onInsert(preview);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Rows" value={rows} onChange={setRows} min={1} max={20} autoFocus />
        <NumberField label="Columns" value={cols} onChange={setCols} min={1} max={10} />
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={hasHeader}
          onChange={(e) => setHasHeader(e.target.checked)}
        />
        First row is a header
      </label>
      <Field label="Caption" value={caption} onChange={setCaption} />
      <Field label="Label" value={label} onChange={setLabel} placeholder="tab:summary" />
      <Actions canSubmit onCancel={onCancel} submitLabel="Insert table" />
    </form>
  );
}

function buildTable(
  rows: number,
  cols: number,
  header: boolean,
  caption: string,
  label: string,
): string {
  const colSpec = Array(cols).fill("l").join(" ");
  const lines: string[] = [];
  lines.push("\\begin{table}[htbp]");
  lines.push("\t\\centering");
  lines.push(`\t\\begin{tabular}{${colSpec}}`);
  lines.push("\t\t\\hline");
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      if (header && r === 0) cells.push(`\\textbf{Header ${c + 1}}`);
      else cells.push(`Cell ${r + 1}-${c + 1}`);
    }
    lines.push(`\t\t${cells.join(" & ")} \\\\`);
    if (header && r === 0) lines.push("\t\t\\hline");
  }
  lines.push("\t\t\\hline");
  lines.push("\t\\end{tabular}");
  lines.push(`\t\\caption{${caption || "Caption"}}`);
  lines.push(`\t\\label{${label || "tab:placeholder"}}`);
  lines.push("\\end{table}");
  lines.push("");
  return lines.join("\n");
}

/* --------------------------------------------------------------------------
 *  Small shared form bits
 * ------------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-fg-subtle mb-1">{label}</span>
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="w-full bg-bg border border-border rounded px-2 py-1 text-sm text-fg outline-none focus:border-accent"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  autoFocus,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-fg-subtle mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.currentTarget.value, 10);
          onChange(Number.isFinite(n) ? n : min);
        }}
        className="w-full bg-bg border border-border rounded px-2 py-1 text-sm text-fg outline-none focus:border-accent"
      />
    </label>
  );
}

function Actions({
  canSubmit,
  onCancel,
  submitLabel,
}: {
  canSubmit: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1 rounded text-sm text-fg-muted hover:text-fg hover:bg-bg-hover border border-transparent"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit}
        className="px-3 py-1 rounded text-sm bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </div>
  );
}
