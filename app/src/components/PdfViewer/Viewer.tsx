import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Minus, Plus, ZoomIn, FileX, Loader2 } from "lucide-react";

// PDF.js worker setup — Vite resolves this to a hashed URL.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

export type SyncTarget = {
  page: number;
  /** SyncTeX `h` (x) in PDF points. */
  x: number;
  /** SyncTeX `v` (y) in PDF points. */
  y: number;
  /** Bump to retrigger scroll even when target is unchanged. */
  token: number;
};

type Props = {
  pdfPath: string | null;
  /** Bump this whenever the file on disk was rewritten. */
  reloadToken?: number;
  /** Show a "build in progress" overlay (PDF on disk may be stale). */
  busy?: boolean;
  /** Scroll + flash to this position. */
  syncTarget?: SyncTarget | null;
  /** Shift-click on a page → (page, xPt, yPt). */
  onInverseSync?: (page: number, x: number, y: number) => void;
};

export function PdfViewer({
  pdfPath,
  reloadToken = 0,
  busy = false,
  syncTarget,
  onInverseSync,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<number | "fit-width" | "fit-page">("fit-width");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Remember scroll fraction across reloads so the user doesn't lose place.
  const scrollFractionRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      scrollFractionRef.current = max > 0 ? el.scrollTop / max : 0;
      // Update current page indicator based on which page top is closest.
      const pageEls = el.querySelectorAll<HTMLDivElement>("[data-pdf-page]");
      let best = 1;
      let bestDist = Infinity;
      pageEls.forEach((p) => {
        const top = p.offsetTop - el.scrollTop;
        const dist = Math.abs(top);
        if (dist < bestDist) {
          bestDist = dist;
          best = Number(p.dataset.pdfPage);
        }
      });
      setCurrentPage(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [doc]);

  // Load document.
  useEffect(() => {
    let cancelled = false;
    if (!pdfPath) {
      setDoc(null);
      setNumPages(0);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const url = convertFileSrc(pdfPath) + `?t=${reloadToken}`; // bust webview cache
    const task = pdfjsLib.getDocument({ url, withCredentials: false });

    task.promise
      .then((d) => {
        if (cancelled) {
          d.destroy();
          return;
        }
        setDoc((prev) => {
          prev?.destroy();
          return d;
        });
        setNumPages(d.numPages);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [pdfPath, reloadToken]);

  // Restore scroll fraction after re-render of pages.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = scrollFractionRef.current * max;
  }, [doc, numPages, zoom]);

  // Ctrl+wheel to zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => {
        const cur = typeof z === "number" ? z : 1;
        const dir = e.deltaY < 0 ? 1 : -1;
        const next = Math.max(0.25, Math.min(5, cur * (dir > 0 ? 1.1 : 1 / 1.1)));
        return Math.round(next * 100) / 100;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Scroll to & flash SyncTeX target.
  useEffect(() => {
    if (!syncTarget) return;
    const container = containerRef.current;
    if (!container) return;
    // Defer to allow pages to render at current zoom.
    const id = window.setTimeout(() => {
      const pageEl = container.querySelector<HTMLDivElement>(
        `[data-pdf-page="${syncTarget.page}"]`,
      );
      if (!pageEl) return;
      const pageScale = Number(pageEl.dataset.pdfScale ?? "1");
      // SyncTeX y is the baseline from page top in points; convert with scale.
      const targetY = pageEl.offsetTop + syncTarget.y * pageScale;
      container.scrollTo({ top: targetY - container.clientHeight / 3, behavior: "smooth" });

      // Flash overlay
      const flash = document.createElement("div");
      flash.className = "pdf-sync-flash";
      flash.style.position = "absolute";
      flash.style.left = `${Math.max(0, syncTarget.x * pageScale - 4)}px`;
      flash.style.top = `${Math.max(0, syncTarget.y * pageScale - 20)}px`;
      flash.style.width = "120px";
      flash.style.height = "24px";
      flash.style.background = "rgba(122,162,255,0.45)";
      flash.style.borderRadius = "3px";
      flash.style.pointerEvents = "none";
      flash.style.transition = "opacity 1.2s ease-out";
      pageEl.appendChild(flash);
      requestAnimationFrame(() => (flash.style.opacity = "0"));
      window.setTimeout(() => flash.remove(), 1300);
    }, 50);
    return () => window.clearTimeout(id);
  }, [syncTarget]);

  const onPageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onInverseSync) return;
      if (!e.shiftKey) return;
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const pageScale = Number(target.dataset.pdfScale ?? "1");
      const px = (e.clientX - rect.left) / pageScale;
      const py = (e.clientY - rect.top) / pageScale;
      const pageNum = Number(target.dataset.pdfPage ?? "1");
      onInverseSync(pageNum, px, py);
      e.preventDefault();
    },
    [onInverseSync],
  );

  const setZoomPreset = useCallback((mode: typeof zoom) => setZoom(mode), []);
  const zoomIn = () =>
    setZoom((z) => {
      const cur = typeof z === "number" ? z : 1;
      return Math.min(5, Math.round(cur * 1.2 * 100) / 100);
    });
  const zoomOut = () =>
    setZoom((z) => {
      const cur = typeof z === "number" ? z : 1;
      return Math.max(0.25, Math.round((cur / 1.2) * 100) / 100);
    });

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Toolbar */}
      <div className="h-9 shrink-0 border-b border-border bg-bg-elevated px-3 flex items-center gap-2 text-xs text-fg-muted">
        <span className="font-medium text-fg">Preview</span>
        {pdfPath && (
          <>
            <span className="text-fg-subtle">·</span>
            <span>
              Page {currentPage} / {numPages || "—"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <IconBtn onClick={zoomOut} title="Zoom out (Ctrl+−)">
                <Minus className="h-3.5 w-3.5" />
              </IconBtn>
              <span className="w-12 text-center">
                {typeof zoom === "number" ? `${Math.round(zoom * 100)}%` : zoom === "fit-width" ? "Fit W" : "Fit"}
              </span>
              <IconBtn onClick={zoomIn} title="Zoom in (Ctrl++)">
                <Plus className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn onClick={() => setZoomPreset("fit-width")} title="Fit width">
                <ZoomIn className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </>
        )}
      </div>

      {/* Pages */}
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        {!pdfPath && (
          <EmptyState icon={<FileX className="h-5 w-5" />} text="No PDF yet — build to preview" />
        )}
        {error && <EmptyState text={`Failed to load PDF: ${error}`} />}
        {doc && numPages > 0 && (
          <div className="flex flex-col items-center py-3 gap-3">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={`${reloadToken}-${n}`}
                doc={doc}
                pageNumber={n}
                zoom={zoom}
                onPageClick={onPageClick}
              />
            ))}
          </div>
        )}
        {(loading || busy) && (
          <div className="absolute inset-x-0 top-0 flex justify-center pointer-events-none">
            <div className="mt-3 px-3 py-1.5 rounded-full bg-bg-elevated/90 border border-border text-xs text-fg-muted flex items-center gap-2 shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy ? "Build in progress…" : "Loading PDF…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  doc,
  pageNumber,
  zoom,
  onPageClick,
}: {
  doc: PdfDoc;
  pageNumber: number;
  zoom: number | "fit-width" | "fit-page";
  onPageClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const viewport0 = page.getViewport({ scale: 1 });

      // Determine target scale.
      let scale: number;
      if (typeof zoom === "number") {
        scale = zoom;
      } else {
        const container = wrapper.parentElement!;
        const cw = container.clientWidth - 32;
        const ch = container.clientHeight - 32;
        if (zoom === "fit-width") {
          scale = cw / viewport0.width;
        } else {
          scale = Math.min(cw / viewport0.width, ch / viewport0.height);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });

      // Remember the rendered scale on the DOM so the parent can convert
      // SyncTeX point coordinates → CSS px for scroll + flash.
      wrapper.dataset.pdfScale = String(scale);

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (cancelled) return;

      // Text layer (selection / copy).
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.innerHTML = "";
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        const textContent = await page.getTextContent();
        // TextLayer was added in pdfjs 4+.
        const TextLayerCtor = (pdfjsLib as unknown as { TextLayer?: new (...args: unknown[]) => { render: () => Promise<void> } }).TextLayer;
        if (TextLayerCtor) {
          const tl = new TextLayerCtor({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          try {
            await tl.render();
          } catch {
            /* selection is a nice-to-have; ignore failures */
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, zoom]);

  return (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className="relative bg-white shadow-md"
      style={{ lineHeight: 0 }}
      onClick={onPageClick}
      title="Shift-click to jump to source"
    >
      <canvas ref={canvasRef} />
      <div
        ref={textLayerRef}
        className="pdf-text-layer absolute inset-0"
        style={{ pointerEvents: "auto" }}
      />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center p-1 rounded text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
    >
      {children}
    </button>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-fg-subtle text-sm">
      <div className="flex items-center gap-2">
        {icon}
        {text}
      </div>
    </div>
  );
}
