import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  category?: string;
  keys?: string;
  run: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
};

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - (t.indexOf(q) || 0);
  // subsequence
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 1;
      qi += 1;
    }
  }
  return qi === q.length ? score : 0;
}

export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    return commands
      .map((c) => ({ c, score: fuzzyScore(query, `${c.category ?? ""} ${c.label}`) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered, active]);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-bg-elevated border border-border rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(filtered.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const c = filtered[active];
                if (c) {
                  onClose();
                  void c.run();
                }
              }
            }}
            placeholder="Type a command…"
            className="flex-1 bg-transparent outline-none text-sm text-fg placeholder:text-fg-subtle"
          />
        </div>
        <ul ref={listRef} className="max-h-80 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-fg-subtle">No matches</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onClose();
                  void c.run();
                }}
                className={
                  "px-3 py-1.5 flex items-center gap-3 cursor-pointer text-sm " +
                  (i === active ? "bg-bg-hover text-fg" : "text-fg-muted hover:bg-bg-hover")
                }
              >
                {c.category && (
                  <span className="text-[10px] uppercase text-fg-subtle tracking-wider shrink-0">
                    {c.category}
                  </span>
                )}
                <span className="truncate flex-1">{c.label}</span>
                {c.keys && (
                  <span className="text-[10px] text-fg-subtle shrink-0">{c.keys}</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
