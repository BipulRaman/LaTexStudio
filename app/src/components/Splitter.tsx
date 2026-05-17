import type React from "react";
import { useCallback, useEffect, useRef } from "react";

type Direction = "vertical" | "horizontal";

type Props = {
  /** `vertical` = drag horizontally to resize widths;
   *  `horizontal` = drag vertically to resize heights. */
  direction: Direction;
  /** Current size in pixels. */
  size: number;
  /** Called continuously while dragging with the new size in pixels. */
  onResize: (next: number) => void;
  /** Optional clamp bounds. */
  min?: number;
  max?: number;
  /** When true, the splitter sits on the **trailing** edge of the resized
   *  pane (so dragging right grows it). When false (default), it sits on the
   *  leading edge (dragging left grows it).
   *  e.g. sidebar uses trailing=true, preview-pane-width uses trailing=false. */
  trailing?: boolean;
};

/** A 4 px draggable handle styled to match the dark theme. */
export function Splitter({
  direction,
  size,
  onResize,
  min = 80,
  max = 4000,
  trailing = true,
}: Props) {
  const startRef = useRef<{ pos: number; size: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      startRef.current = {
        pos: direction === "vertical" ? e.clientX : e.clientY,
        size,
      };
    },
    [direction, size],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const delta =
        (direction === "vertical" ? e.clientX : e.clientY) - start.pos;
      const sign = trailing ? 1 : -1;
      const next = Math.max(min, Math.min(max, start.size + sign * delta));
      onResize(next);
    },
    [direction, max, min, onResize, trailing],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      startRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Global cursor while dragging
  useEffect(() => {
    function clear() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return clear;
  }, []);

  const isVertical = direction === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      onPointerDown={(e) => {
        document.body.style.cursor = isVertical ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onPointerUp(e);
      }}
      className={
        "group relative shrink-0 transition-colors " +
        (isVertical
          ? "w-px cursor-col-resize hover:bg-accent/40"
          : "h-px cursor-row-resize hover:bg-accent/40")
      }
      style={{ background: "rgb(var(--c-border))" }}
    >
      {/* Wider invisible hit-area for easier grabbing. */}
      <div
        className={
          "absolute " +
          (isVertical
            ? "top-0 bottom-0 -left-1 -right-1"
            : "left-0 right-0 -top-1 -bottom-1")
        }
      />
    </div>
  );
}
