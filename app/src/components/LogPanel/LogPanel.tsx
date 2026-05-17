import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { Diagnostic } from "../../api/build";
import { useBuild } from "../../state/build";

type Props = {
  onJumpToLine?: (line: number, file: string | null) => void;
};

export function LogPanel({ onJumpToLine }: Props) {
  const phase = useBuild((s) => s.phase);
  const lines = useBuild((s) => s.lines);
  const diagnostics = useBuild((s) => s.diagnostics);
  const startedAt = useBuild((s) => s.startedAt);
  const finishedAt = useBuild((s) => s.finishedAt);

  const elapsed =
    startedAt != null
      ? `${(((finishedAt ?? Date.now()) - startedAt) / 1000).toFixed(1)}s`
      : "";

  return (
    <div className="flex flex-col h-full bg-bg-elevated text-xs text-fg">
      <div className="h-9 shrink-0 border-b border-border px-3 flex items-center gap-3 text-fg-muted">
        <span className="font-medium text-fg">Build</span>
        <PhaseBadge phase={phase} />
        {elapsed && <span className="text-fg-subtle">{elapsed}</span>}
        <span className="ml-auto text-fg-subtle">
          {diagnostics.length} issue{diagnostics.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-[2fr_3fr] flex-1 min-h-0">
        {/* Diagnostics */}
        <div className="border-r border-border overflow-auto">
          {diagnostics.length === 0 ? (
            <div className="p-3 text-fg-subtle italic">No diagnostics</div>
          ) : (
            <ul className="divide-y divide-border">
              {diagnostics.map((d, i) => (
                <DiagItem key={i} diag={d} onJump={onJumpToLine} />
              ))}
            </ul>
          )}
        </div>

        {/* Raw log */}
        <pre className="overflow-auto p-2 font-mono leading-5 whitespace-pre-wrap text-fg-muted">
          {lines.length === 0
            ? "No output yet."
            : lines
                .map((l) => (l.kind === "stderr" ? `! ${l.text}` : l.text))
                .join("\n")}
        </pre>
      </div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: ReturnType<typeof useBuild.getState>["phase"] }) {
  const label = phase[0].toUpperCase() + phase.slice(1);
  const cls =
    phase === "running"
      ? "text-accent"
      : phase === "success"
        ? "text-emerald-400"
        : phase === "failed"
          ? "text-red-400"
          : phase === "cancelled"
            ? "text-amber-400"
            : "text-fg-subtle";
  return <span className={cls}>{label}</span>;
}

function DiagItem({
  diag,
  onJump,
}: {
  diag: Diagnostic;
  onJump?: (line: number, file: string | null) => void;
}) {
  const Icon =
    diag.severity === "error"
      ? AlertCircle
      : diag.severity === "warning"
        ? AlertTriangle
        : Info;
  const color =
    diag.severity === "error"
      ? "text-red-400"
      : diag.severity === "warning"
        ? "text-amber-400"
        : "text-fg-muted";
  return (
    <li
      className="px-3 py-1.5 hover:bg-bg-hover cursor-pointer flex items-start gap-2"
      onClick={() => {
        if (diag.line != null) onJump?.(diag.line, diag.file);
      }}
      title={diag.line != null ? "Jump to source line" : undefined}
    >
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <div className="truncate text-fg">{diag.message}</div>
        <div className="text-[10px] text-fg-subtle">
          {diag.file ?? "?"}
          {diag.line != null ? `:${diag.line}` : ""}
        </div>
      </div>
    </li>
  );
}
