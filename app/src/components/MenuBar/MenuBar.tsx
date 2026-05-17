import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";

/** A single entry in a menu. */
export type MenuEntry =
  | {
      kind: "item";
      label: string;
      accel?: string;
      checked?: boolean;
      disabled?: boolean;
      onClick: () => void | Promise<void>;
    }
  | { kind: "separator" }
  | {
      kind: "submenu";
      label: string;
      disabled?: boolean;
      items: MenuEntry[];
    };

export type TopMenu = { label: string; items: MenuEntry[] };

type Props = {
  menus: TopMenu[];
};

/**
 * A custom in-app menu bar with proper dark styling, hover-switching between
 * top-level menus, keyboard navigation, and nested submenus.
 */
export function MenuBar({ menus }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (openIndex == null) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (barRef.current?.contains(target)) return;
      // Dropdowns are rendered into document.body via a portal — exclude any
      // click that lands inside one (or its submenus).
      if (target.closest("[data-latex-studio-menu]")) return;
      setOpenIndex(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      else if (e.key === "ArrowRight") setOpenIndex((i) => (i == null ? 0 : (i + 1) % menus.length));
      else if (e.key === "ArrowLeft")
        setOpenIndex((i) => (i == null ? 0 : (i - 1 + menus.length) % menus.length));
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openIndex, menus.length]);

  return (
    <div
      ref={barRef}
      className="h-7 shrink-0 flex items-center bg-bg-elevated border-b border-border text-xs select-none"
      onMouseLeave={() => {
        /* keep dropdown open even on leave so users can move into it */
      }}
    >
      {menus.map((m, i) => (
        <MenuButton
          key={m.label}
          label={m.label}
          isOpen={openIndex === i}
          onActivate={() => setOpenIndex(openIndex === i ? null : i)}
          onHover={() => {
            if (openIndex != null) setOpenIndex(i);
          }}
          items={m.items}
          onClose={() => setOpenIndex(null)}
        />
      ))}
    </div>
  );
}

function MenuButton({
  label,
  isOpen,
  onActivate,
  onHover,
  items,
  onClose,
}: {
  label: string;
  isOpen: boolean;
  onActivate: () => void;
  onHover: () => void;
  items: MenuEntry[];
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={onActivate}
        onMouseEnter={onHover}
        className={
          "h-7 px-3 outline-none transition-colors " +
          (isOpen
            ? "bg-bg-hover text-fg"
            : "text-fg-muted hover:text-fg hover:bg-bg-hover")
        }
      >
        {renderMnemonic(label)}
      </button>
      {isOpen && (
        <Dropdown anchor={btnRef.current} items={items} onClose={onClose} />
      )}
    </div>
  );
}

function Dropdown({
  anchor,
  items,
  onClose,
  parentRect,
  side = "below",
}: {
  anchor: HTMLElement | null;
  items: MenuEntry[];
  onClose: () => void;
  parentRect?: DOMRect;
  side?: "below" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
  });
  const [subOpen, setSubOpen] = useState<{ index: number; rect: DOMRect } | null>(null);

  // Position after mount. For top-level menus we always drop **below** the
  // trigger and cap height to fit the available space (scrolling if needed)
  // so menu items are never hidden behind the menu strip.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const margin = 4;

    let left: number;
    let top: number;
    let maxHeight: number;

    if (side === "right" && parentRect) {
      // Submenu: try to the right of parent row; flip left if not enough room.
      const fullH = el.scrollHeight;
      const w = el.offsetWidth;
      const spaceRight = ww - parentRect.right - margin;
      const spaceLeft = parentRect.left - margin;
      left =
        spaceRight >= w || spaceRight >= spaceLeft
          ? Math.min(ww - w - margin, parentRect.right - 2)
          : Math.max(margin, parentRect.left - w + 2);
      top = parentRect.top;
      maxHeight = wh - 2 * margin;
      if (top + Math.min(fullH, maxHeight) > wh - margin) {
        top = Math.max(margin, wh - Math.min(fullH, maxHeight) - margin);
      }
    } else {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const w = el.offsetWidth;
      left = Math.min(Math.max(margin, rect.left), ww - w - margin);
      top = rect.bottom;
      maxHeight = Math.max(120, wh - rect.bottom - margin);
    }

    setStyle({
      position: "fixed",
      top,
      left,
      maxHeight,
      overflowY: "auto",
      visibility: "visible",
    });
  }, [anchor, parentRect, side]);

  const content = (
    <div
      ref={ref}
      style={style}
      role="menu"
      data-latex-studio-menu="true"
      className="z-[1000] min-w-[14rem] max-w-[26rem] bg-bg-elevated border border-border rounded-md shadow-2xl py-1 text-xs"
    >
      {items.map((item, i) => {
        if (item.kind === "separator") {
          return <div key={`sep-${i}`} className="my-1 h-px bg-border" />;
        }
        if (item.kind === "submenu") {
          const open = subOpen?.index === i;
          return (
            <SubmenuRow
              key={`sub-${i}-${item.label}`}
              label={item.label}
              disabled={item.disabled}
              open={open}
              onOpen={(rect) => setSubOpen({ index: i, rect })}
              onClose={() => setSubOpen(null)}
              items={item.items}
              dropdownClose={onClose}
            />
          );
        }
        const Disabled = item.disabled;
        return (
          <button
            key={`item-${i}-${item.label}`}
            disabled={Disabled}
            onClick={async () => {
              if (Disabled) return;
              onClose();
              try {
                await item.onClick();
              } catch {
                /* ignore */
              }
            }}
            onMouseEnter={() => setSubOpen(null)}
            className={
              "w-full flex items-center gap-2 px-2 h-7 rounded-sm text-left " +
              (Disabled
                ? "text-fg-subtle cursor-not-allowed"
                : "text-fg hover:bg-accent/15 hover:text-accent-hover")
            }
          >
            <span className="w-4 shrink-0 flex items-center justify-center">
              {item.checked ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className="flex-1 truncate">{renderMnemonic(item.label)}</span>
            {item.accel && (
              <span className="text-[10px] text-fg-subtle ml-4">{item.accel}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  return createPortal(content, document.body);
}

function SubmenuRow({
  label,
  disabled,
  open,
  onOpen,
  onClose,
  items,
  dropdownClose,
}: {
  label: string;
  disabled?: boolean;
  open: boolean;
  onOpen: (rect: DOMRect) => void;
  onClose: () => void;
  items: MenuEntry[];
  dropdownClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        disabled={disabled}
        onMouseEnter={() => !disabled && onOpen(ref.current!.getBoundingClientRect())}
        onClick={() => !disabled && onOpen(ref.current!.getBoundingClientRect())}
        className={
          "w-full flex items-center gap-2 px-2 h-7 rounded-sm text-left " +
          (disabled
            ? "text-fg-subtle cursor-not-allowed"
            : open
              ? "bg-accent/15 text-accent-hover"
              : "text-fg hover:bg-accent/15 hover:text-accent-hover")
        }
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1 truncate">{renderMnemonic(label)}</span>
        <ChevronRight className="h-3 w-3 text-fg-subtle" />
      </button>
      {open && (
        <Dropdown
          anchor={null}
          parentRect={ref.current?.getBoundingClientRect()}
          items={items}
          onClose={() => {
            onClose();
            dropdownClose();
          }}
          side="right"
        />
      )}
    </>
  );
}

/** Render a `&Label` mnemonic with the `&` removed (underline support is
 *  out-of-scope for now; we just strip the `&`). */
function renderMnemonic(label: string): ReactNode {
  if (!label.includes("&")) return label;
  const out: ReactNode[] = [];
  let i = 0;
  for (let j = 0; j < label.length; j++) {
    if (label[j] === "&" && j + 1 < label.length) {
      if (j > i) out.push(label.slice(i, j));
      out.push(
        <span key={j} className="underline underline-offset-2">
          {label[j + 1]}
        </span>,
      );
      i = j + 2;
      j++;
    }
  }
  if (i < label.length) out.push(label.slice(i));
  return out;
}
