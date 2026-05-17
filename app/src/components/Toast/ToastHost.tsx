import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToasts } from "../../state/toasts";

const palette = {
  info: { bg: "bg-bg-elevated", border: "border-border", icon: Info, color: "text-accent" },
  success: {
    bg: "bg-bg-elevated",
    border: "border-emerald-700/50",
    icon: CheckCircle2,
    color: "text-emerald-400",
  },
  warning: {
    bg: "bg-bg-elevated",
    border: "border-amber-700/50",
    icon: AlertTriangle,
    color: "text-amber-400",
  },
  error: {
    bg: "bg-bg-elevated",
    border: "border-red-700/50",
    icon: XCircle,
    color: "text-red-400",
  },
} as const;

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const { bg, border, icon: Icon, color } = palette[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto ${bg} ${border} border rounded shadow-lg px-3 py-2 flex items-start gap-2 text-xs text-fg`}
          >
            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
            <div className="flex-1 break-words">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-fg-subtle hover:text-fg shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
