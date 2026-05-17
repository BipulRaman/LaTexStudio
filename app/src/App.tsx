import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Cog,
  FileText,
  FolderOpen,
  FilePlus2,
  FileUp,
  Hammer,
  Keyboard,
  Loader2,
  PanelLeft,
  PanelBottom,
  Sparkles,
  X,
} from "lucide-react";
import { fsApi } from "./api/fs";
import { dialogApi } from "./api/dialog";
import { recentsApi } from "./api/recents";
import { buildApi, type Engine } from "./api/build";
import { watcherApi, workspaceApi } from "./api/watcher";
import { indexApi } from "./api/index";
import { synctexApi } from "./api/synctex";
import { spellApi } from "./api/spell";
import { settingsApi, type Settings } from "./api/settings";
import { useWorkspace } from "./state/workspace";
import { useBuild } from "./state/build";
import { useIndex } from "./state/index";
import { LatexEditor, type LatexEditorHandle } from "./editor/LatexEditor";
import { LogPanel } from "./components/LogPanel/LogPanel";
import { type SyncTarget } from "./components/PdfViewer/Viewer";
import { Tree } from "./components/Sidebar/Tree";
import { Outline } from "./components/Sidebar/Outline";

// Heavy: pulls in PDF.js (~415 KB). Lazy-loaded so the initial paint stays fast.
const PdfViewer = lazy(() =>
  import("./components/PdfViewer/Viewer").then((m) => ({ default: m.PdfViewer })),
);
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ToastHost } from "./components/Toast/ToastHost";
import { TectonicInstaller } from "./components/TectonicInstaller";
import { MenuBar, type TopMenu } from "./components/MenuBar/MenuBar";
import type { MenuEntry as MenuEntryAlias } from "./components/MenuBar/MenuBar";
import { Splitter } from "./components/Splitter";
import type { RecentItem } from "./api/recents";
import { toast } from "./state/toasts";
import { useThemeEffect, type ThemeMode } from "./state/theme";

const STARTER_DOC = `\\documentclass{article}
\\usepackage[utf8]{inputenc}

\\title{Untitled}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}

\\end{document}
`;

function App() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<string>("Ready");
  const [engine, setEngine] = useState<Engine>("tectonic");
  const [availableEngines, setAvailableEngines] = useState<Engine[]>([]);
  const [buildOnSave, setBuildOnSave] = useState<boolean>(true);
  const [spellLang, setSpellLang] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  useThemeEffect(theme);

  const rootDir = useWorkspace((s) => s.rootDir);
  const rootDoc = useWorkspace((s) => s.rootDoc);
  const activeDoc = useWorkspace((s) => s.activeDoc);
  const setRoot = useWorkspace((s) => s.setRoot);
  const setRootDoc = useWorkspace((s) => s.setRootDoc);
  const setDoc = useWorkspace((s) => s.setDoc);
  const updateContents = useWorkspace((s) => s.updateContents);

  const buildPhase = useBuild((s) => s.phase);
  const buildPdfPath = useBuild((s) => s.pdfPath);
  const startBuild = useBuild((s) => s.start);
  const appendLine = useBuild((s) => s.appendLine);
  const finishBuild = useBuild((s) => s.finish);

  const editorRef = useRef<LatexEditorHandle>(null);
  const [pdfReloadToken, setPdfReloadToken] = useState(0);
  const [treeRefreshToken, setTreeRefreshToken] = useState(0);
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null);
  const syncTokenRef = useRef(0);
  const [sidebarTab, setSidebarTab] = useState<"files" | "outline">("files");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    const v = localStorage.getItem("layout:showSidebar");
    return v === null ? true : v === "1";
  });
  const [showLogPanel, setShowLogPanel] = useState<boolean>(false);
  useEffect(() => {
    localStorage.setItem("layout:showSidebar", showSidebar ? "1" : "0");
  }, [showSidebar]);
  const [tectonicOpen, setTectonicOpen] = useState(false);
  // When true, the installer cannot be dismissed — used when boot probe finds
  // no LaTeX engine on the system. Cleared once Tectonic is installed.
  const [tectonicRequired, setTectonicRequired] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);

  // Resizable layout sizes (pixels), persisted to localStorage.
  const [sidebarW, setSidebarW] = useState<number>(() => {
    const v = Number(localStorage.getItem("layout:sidebar"));
    return Number.isFinite(v) && v > 0 ? v : 256;
  });
  const [previewW, setPreviewW] = useState<number>(() => {
    const v = Number(localStorage.getItem("layout:preview"));
    return Number.isFinite(v) && v > 0 ? v : 560;
  });
  const [logH, setLogH] = useState<number>(() => {
    const v = Number(localStorage.getItem("layout:log"));
    return Number.isFinite(v) && v > 0 ? v : 192;
  });
  useEffect(() => {
    localStorage.setItem("layout:sidebar", String(sidebarW));
  }, [sidebarW]);
  useEffect(() => {
    localStorage.setItem("layout:preview", String(previewW));
  }, [previewW]);
  useEffect(() => {
    localStorage.setItem("layout:log", String(logH));
  }, [logH]);
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const handleBuildRef = useRef<() => Promise<void>>(async () => {});
  const menuActionsRef = useRef<Record<string, (arg?: string) => void | Promise<void>>>({});

  useEffect(() => {
    invoke<string>("app_version")
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  // Probe TeX engines on boot — if none are installed, open the Tectonic
  // installer dialog in required (non-dismissible) mode. No toast is shown
  // because the modal itself surfaces the problem.
  const probeAndRecord = useCallback(async () => {
    try {
      const infos = await buildApi.probeEngines();
      const available = infos.filter((i) => i.available).map((i) => i.engine);
      setAvailableEngines(available);
      if (available.length === 0) {
        setTectonicRequired(true);
        setTectonicOpen(true);
        setStatus("No LaTeX engine — install Tectonic to get started");
      }
      return available;
    } catch {
      return [] as Engine[];
    }
  }, []);

  useEffect(() => {
    void probeAndRecord();
  }, [probeAndRecord]);

  // Track the latest engine value so the probe effect can read it without re-running.
  const useEngineRef = useRef(engine);
  useEngineRef.current = engine;

  // Load settings on boot.
  useEffect(() => {
    let cancelled = false;
    settingsApi
      .load()
      .then((s) => {
        if (cancelled) return;
        setEngine(s.engine);
        setBuildOnSave(s.buildOnSave);
        if (s.theme === "dark" || s.theme === "light" || s.theme === "system") {
          setTheme(s.theme);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist a subset of settings whenever they change (debounced).
  useEffect(() => {
    const t = window.setTimeout(() => {
      settingsApi
        .load()
        .catch((): Settings => ({
          theme,
          engine,
          buildOnSave,
          spellLang: spellLang ?? "en_US",
          fontSize: 14,
          tabSize: 2,
          wordWrap: true,
        }))
        .then((current) =>
          settingsApi.save({
            ...current,
            theme,
            engine,
            buildOnSave,
            spellLang: spellLang ?? current.spellLang,
          }),
        )
        .catch(() => {});
    }, 300);
    return () => window.clearTimeout(t);
  }, [engine, buildOnSave, spellLang, theme]);

  // Rebuild the native menu whenever check-mark / enable state changes.
  useEffect(() => {
    invoke("rebuild_menu", {
      state: {
        theme,
        engine,
        buildOnSave,
        showSidebar,
        showLogPanel,
        hasDoc: !!activeDoc,
        hasWorkspace: !!rootDir,
        buildRunning: buildPhase === "running",
      },
    }).catch(() => {});
  }, [
    theme,
    engine,
    buildOnSave,
    showSidebar,
    showLogPanel,
    activeDoc,
    rootDir,
    buildPhase,
  ]);

  // Probe whether the en_US dictionary is bundled; enable spellcheck only if so.
  useEffect(() => {
    spellApi
      .available("en_US")
      .then((ok) => {
        if (ok) setSpellLang("en_US");
      })
      .catch(() => {});
  }, []);

  // Load recents on boot.
  useEffect(() => {
    recentsApi
      .list()
      .then(setRecents)
      .catch(() => {});
  }, []);

  // Subscribe to build progress events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void buildApi
      .onProgress((evt) => {
        if (evt.status === "stdout" || evt.status === "stderr") {
          if (evt.line) appendLine({ kind: evt.status, text: evt.line });
        } else if (evt.status === "started" && evt.line) {
          appendLine({ kind: "info", text: `→ ${evt.line}` });
        }
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, [appendLine]);

  // Subscribe to fs change events — refresh the tree.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void watcherApi
      .onChange(() => {
        setTreeRefreshToken((t) => t + 1);
        scheduleReindex();
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setIndex = useIndex((s) => s.setIndex);
  const reindexTimerRef = useRef<number | null>(null);
  const scheduleReindex = useCallback(() => {
    if (reindexTimerRef.current != null) window.clearTimeout(reindexTimerRef.current);
    reindexTimerRef.current = window.setTimeout(() => {
      const root = useWorkspace.getState().rootDir;
      if (!root) return;
      indexApi
        .scan(root)
        .then(setIndex)
        .catch(() => {});
    }, 400);
  }, [setIndex]);

  // Re-index on rootDir change.
  useEffect(() => {
    if (!rootDir) {
      setIndex({ labels: [], citeKeys: [], texFiles: [], bibFiles: [] });
      return;
    }
    indexApi
      .scan(rootDir)
      .then(setIndex)
      .catch(() => {});
  }, [rootDir, setIndex]);

  // Start/stop watcher when rootDir changes.
  useEffect(() => {
    if (!rootDir) {
      void watcherApi.stop();
      return;
    }
    void watcherApi.start(rootDir).catch(() => {});
    return () => {
      void watcherApi.stop();
    };
  }, [rootDir]);

  const openFileByPath = useCallback(
    async (path: string) => {
      try {
        const contents = await fsApi.readFile(path);
        setDoc({ path, contents, dirty: false });
        const updated = await recentsApi.push(path, "file");
        setRecents(updated);
        setStatus(`Opened ${path}`);
        // Detect `% !TEX root = ...` magic comment.
        try {
          const detected = await workspaceApi.detectRoot(path);
          if (detected) setRootDoc(detected);
          else if (/\.(tex|ltx|latex)$/i.test(path)) setRootDoc(path);
        } catch {
          /* root detection is best-effort */
        }
      } catch (e: unknown) {
        setStatus(`Open failed: ${(e as Error).message}`);
      }
    },
    [setDoc, setRootDoc],
  );

  async function handleOpenFile() {
    const path = await dialogApi.openFile();
    if (!path) return;
    await openFileByPath(path);
  }

  function handleNewFile() {
    setDoc({ path: null, contents: STARTER_DOC, dirty: true });
    setStatus("New file");
  }

  function handleCloseDoc() {
    if (!activeDoc) return;
    if (activeDoc.dirty) {
      const ok = window.confirm(
        "This file has unsaved changes. Close without saving?",
      );
      if (!ok) return;
    }
    setDoc(null);
    setStatus("Closed");
  }

  async function handleOpenFolder() {
    try {
      const path = await dialogApi.openFolder();
      if (!path) return;
      setRoot(path);
      const updated = await recentsApi.push(path, "workspace");
      setRecents(updated);
      setStatus(`Workspace: ${path}`);
    } catch (e: unknown) {
      setStatus(`Open folder failed: ${(e as Error).message}`);
    }
  }

  async function handleSave() {
    if (!activeDoc) return;
    try {
      let path = activeDoc.path;
      if (!path) {
        path = await dialogApi.saveAs("untitled.tex");
        if (!path) return;
      }
      await fsApi.writeFile(path, activeDoc.contents);
      setDoc({ ...activeDoc, path, dirty: false });
      setStatus(`Saved ${path}`);
      if (buildOnSave) {
        const target = rootDoc ?? path;
        void runBuild(target);
      }
    } catch (e: unknown) {
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  }

  async function runBuild(path: string) {
    try {
      startBuild("pending", `Build ${path} (${engine})`);
      const result = await buildApi.compile(path, engine);
      finishBuild(
        result.cancelled
          ? "cancelled"
          : result.success
            ? "success"
            : "failed",
        result.diagnostics,
        result.pdfPath,
      );
      if (result.success) setPdfReloadToken((t) => t + 1);
      if (result.cancelled) {
        setStatus("Build cancelled");
        toast.warning("Build cancelled");
      } else if (result.success) {
        setStatus(`Build succeeded → ${result.pdfPath ?? "(no PDF)"}`);
        toast.success(`Build succeeded${result.diagnostics.length ? ` with ${result.diagnostics.length} warning(s)` : ""}`);
      } else {
        setStatus(`Build failed (exit ${result.exitCode ?? "?"})`);
        toast.error(`Build failed${result.diagnostics.length ? ` — ${result.diagnostics.length} issue(s)` : ""}`);
      }
    } catch (e: unknown) {
      finishBuild("failed", [], null);
      const msg = (e as Error).message;
      setStatus(`Build error: ${msg}`);
      toast.error(`Build error: ${msg}`);
    }
  }

  async function handleBuild() {
    const target = rootDoc ?? activeDoc?.path;
    if (!target) {
      setStatus("Save the file before building");
      return;
    }
    await runBuild(target);
  }

  handleBuildRef.current = handleBuild;

  async function handleCancelBuild() {
    await buildApi.cancel();
  }

  // Forward SyncTeX: source → PDF.
  const handleForwardSync = useCallback(
    async (line: number, column: number) => {
      const buildState = useBuild.getState();
      const pdfPath = buildState.pdfPath;
      const source = activeDoc?.path;
      if (!pdfPath || !source) {
        setStatus("Build before SyncTeX");
        return;
      }
      try {
        const hit = await synctexApi.forward(source, line, column, pdfPath);
        if (!hit) {
          setStatus("SyncTeX: no match");
          return;
        }
        syncTokenRef.current += 1;
        setSyncTarget({
          page: hit.page,
          x: hit.h,
          y: hit.v,
          token: syncTokenRef.current,
        });
      } catch (e: unknown) {
        setStatus(`SyncTeX failed: ${(e as Error).message}`);
      }
    },
    [activeDoc?.path],
  );

  // Inverse SyncTeX: PDF → source.
  const handleInverseSync = useCallback(
    async (page: number, x: number, y: number) => {
      const buildState = useBuild.getState();
      const pdfPath = buildState.pdfPath;
      if (!pdfPath) return;
      try {
        const hit = await synctexApi.inverse(pdfPath, page, x, y);
        if (!hit) {
          setStatus("SyncTeX: no source mapping");
          return;
        }
        // Open the file if not already.
        if (activeDoc?.path !== hit.file) {
          await openFileByPath(hit.file);
        }
        // Wait a tick so editor has the new doc, then jump.
        setTimeout(() => editorRef.current?.gotoLine(hit.line), 50);
        setStatus(`Jumped to ${hit.file}:${hit.line}`);
      } catch (e: unknown) {
        setStatus(`Inverse SyncTeX failed: ${(e as Error).message}`);
      }
    },
    [activeDoc?.path, openFileByPath],
  );

  handleSaveRef.current = handleSave;
  const onEditorSave = useCallback(() => {
    void handleSaveRef.current();
  }, []);

  // Global Ctrl/Cmd+S as a safety net when the editor isn't focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSaveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "F5") {
        e.preventDefault();
        void handleBuildRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setShowSidebar((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setShowLogPanel((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        handleCloseDoc();
      } else if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  // Keep the menu-action map fresh; the native-menu listener reads through this ref.
  menuActionsRef.current = {
    "file:new": handleNewFile,
    "file:open": handleOpenFile,
    "file:openFolder": handleOpenFolder,
    "file:save": handleSave,
    "file:saveAs": async () => {
      if (!activeDoc) return;
      const path = await dialogApi.saveAs(activeDoc.path ?? "untitled.tex");
      if (!path) return;
      await fsApi.writeFile(path, activeDoc.contents);
      setDoc({ ...activeDoc, path, dirty: false });
      setStatus(`Saved ${path}`);
      toast.success("Saved");
    },
    "file:reload": async () => {
      if (!activeDoc?.path) return;
      try {
        const contents = await fsApi.readFile(activeDoc.path);
        setDoc({ path: activeDoc.path, contents, dirty: false });
        toast.info("Reloaded from disk");
      } catch (e: unknown) {
        toast.error(`Reload failed: ${(e as Error).message}`);
      }
    },
    "file:close": () => {
      setDoc(null);
      setStatus("Closed");
    },
    "edit:find": () => editorRef.current?.focus(),
    "edit:gotoLine": () => {
      const ans = window.prompt("Go to line:");
      const n = ans ? parseInt(ans, 10) : NaN;
      if (Number.isFinite(n) && n > 0) editorRef.current?.gotoLine(n);
    },
    "view:commandPalette": () => setPaletteOpen(true),
    "view:files": () => {
      setShowSidebar(true);
      setSidebarTab("files");
    },
    "view:outline": () => {
      setShowSidebar(true);
      setSidebarTab("outline");
    },
    "view:toggleSidebar": () => setShowSidebar((v) => !v),
    "view:toggleLog": () => setShowLogPanel((v) => !v),
    "view:themeDark": () => setTheme("dark"),
    "view:themeLight": () => setTheme("light"),
    "view:themeSystem": () => setTheme("system"),
    "build:run": handleBuild,
    "build:cancel": handleCancelBuild,
    "build:toggleOnSave": () => setBuildOnSave((v) => !v),
    "build:probe": async () => {
      const infos = await buildApi.probeEngines();
      const available = infos.filter((i) => i.available);
      if (available.length === 0) {
        toast.error("No LaTeX engines found on PATH", null);
      } else {
        toast.success(
          `Found: ${available.map((i) => `${i.engine}${i.version ? ` (${i.version.split(/\s+/)[0]})` : ""}`).join(", ")}`,
          6000,
        );
      }
    },
    "engine:latexmk": () => setEngine("latexmk"),
    "engine:pdflatex": () => setEngine("pdflatex"),
    "engine:xelatex": () => setEngine("xelatex"),
    "engine:lualatex": () => setEngine("lualatex"),
    "engine:tectonic": () => setEngine("tectonic"),
    "tectonic:install": () => setTectonicOpen(true),
    "recent:clear": async () => {
      await recentsApi.clear();
      setRecents([]);
      toast.info("Recent items cleared");
    },
    "help:docs": () => {
      window.open("https://tauri.app/", "_blank");
    },
    "help:shortcuts": () => {
      toast.info(
        "Ctrl/Cmd+S Save · F5 Build · Ctrl+Shift+P Palette · Ctrl+B Sidebar · Ctrl+J Log · Ctrl+Alt+J SyncTeX forward",
        7000,
      );
    },
  };

  // One-time subscription to native-menu events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("menu", (e) => {
      const id = e.payload;
      // Dynamic ids: `recent:<path>` → open that file.
      if (id.startsWith("recent:") && id !== "recent:clear" && id !== "recent:none") {
        const path = id.slice("recent:".length);
        void openFileByPath(path);
        return;
      }
      const fn = menuActionsRef.current[id];
      if (fn) void fn();
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const docLabel = activeDoc
    ? `${activeDoc.path ?? "untitled.tex"}${activeDoc.dirty ? " •" : ""}`
    : "No file open";

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      { id: "file.new", category: "File", label: "New file", keys: "Ctrl+N", run: handleNewFile },
      { id: "file.open", category: "File", label: "Open file…", keys: "Ctrl+O", run: handleOpenFile },
      { id: "file.openFolder", category: "File", label: "Open folder…", run: handleOpenFolder },
      { id: "file.save", category: "File", label: "Save", keys: "Ctrl+S", run: handleSave },
      { id: "build.run", category: "Build", label: "Build", keys: "F5", run: handleBuild },
      { id: "build.cancel", category: "Build", label: "Cancel build", run: handleCancelBuild },
      {
        id: "build.toggleOnSave",
        category: "Build",
        label: `${buildOnSave ? "Disable" : "Enable"} build on save`,
        run: () => setBuildOnSave((v) => !v),
      },
      ...(["latexmk", "pdflatex", "xelatex", "lualatex", "tectonic"] as const).map((e) => ({
        id: `engine.${e}`,
        category: "Engine",
        label: `Use ${e}${availableEngines.includes(e) ? "" : " (not installed)"}`,
        run: () => setEngine(e),
      })),
      {
        id: "tectonic.install",
        category: "Engine",
        label: "Install Tectonic…",
        run: () => setTectonicOpen(true),
      },
      {
        id: "view.outline",
        category: "View",
        label: "Show outline",
        run: () => setSidebarTab("outline"),
      },
      {
        id: "view.files",
        category: "View",
        label: "Show files",
        run: () => setSidebarTab("files"),
      },
      ...(["dark", "light", "system"] as const).map((t) => ({
        id: `theme.${t}`,
        category: "Theme",
        label: `Theme: ${t}`,
        run: () => setTheme(t),
      })),
    ],
    [buildOnSave, availableEngines],
  );

  const menus: TopMenu[] = useMemo(() => {
    const shortName = (p: string) => p.split(/[\\/]/).pop() ?? p;
    return [
      {
        label: "&File",
        items: [
          { kind: "item", label: "&New File", accel: "Ctrl+N", onClick: handleNewFile },
          { kind: "item", label: "&Open File…", accel: "Ctrl+O", onClick: handleOpenFile },
          {
            kind: "item",
            label: "Open &Folder…",
            accel: "Ctrl+Shift+O",
            onClick: handleOpenFolder,
          },
          {
            kind: "submenu",
            label: "Open &Recent",
            items:
              recents.length === 0
                ? [{ kind: "item", label: "(no recent items)", disabled: true, onClick: () => {} }]
                : [
                    ...recents.slice(0, 10).map<MenuEntryAlias>((r) => ({
                      kind: "item" as const,
                      label: shortName(r.path),
                      accel: r.path,
                      onClick: () => void openFileByPath(r.path),
                    })),
                    { kind: "separator" },
                    {
                      kind: "item",
                      label: "&Clear Recent",
                      onClick: async () => {
                        await recentsApi.clear();
                        setRecents([]);
                      },
                    },
                  ],
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "&Save",
            accel: "Ctrl+S",
            disabled: !activeDoc,
            onClick: handleSave,
          },
          {
            kind: "item",
            label: "Save &As…",
            accel: "Ctrl+Shift+S",
            disabled: !activeDoc,
            onClick: async () => {
              if (!activeDoc) return;
              const path = await dialogApi.saveAs(activeDoc.path ?? "untitled.tex");
              if (!path) return;
              await fsApi.writeFile(path, activeDoc.contents);
              setDoc({ ...activeDoc, path, dirty: false });
              toast.success("Saved");
            },
          },
          {
            kind: "item",
            label: "&Reload from Disk",
            disabled: !activeDoc?.path,
            onClick: async () => {
              if (!activeDoc?.path) return;
              const contents = await fsApi.readFile(activeDoc.path);
              setDoc({ path: activeDoc.path, contents, dirty: false });
              toast.info("Reloaded from disk");
            },
          },
          {
            kind: "item",
            label: "&Close File",
            accel: "Ctrl+W",
            disabled: !activeDoc,
            onClick: () => setDoc(null),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "E&xit",
            onClick: () => window.close(),
          },
        ],
      },
      {
        label: "&Edit",
        items: [
          { kind: "item", label: "&Undo", accel: "Ctrl+Z", onClick: () => document.execCommand("undo") },
          { kind: "item", label: "&Redo", accel: "Ctrl+Y", onClick: () => document.execCommand("redo") },
          { kind: "separator" },
          { kind: "item", label: "Cu&t", accel: "Ctrl+X", onClick: () => document.execCommand("cut") },
          { kind: "item", label: "&Copy", accel: "Ctrl+C", onClick: () => document.execCommand("copy") },
          {
            kind: "item",
            label: "&Paste",
            accel: "Ctrl+V",
            onClick: () => document.execCommand("paste"),
          },
          {
            kind: "item",
            label: "Select &All",
            accel: "Ctrl+A",
            onClick: () => document.execCommand("selectAll"),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "&Find…",
            accel: "Ctrl+F",
            disabled: !activeDoc,
            onClick: () => editorRef.current?.focus(),
          },
          {
            kind: "item",
            label: "&Go to Line…",
            accel: "Ctrl+G",
            disabled: !activeDoc,
            onClick: () => {
              const ans = window.prompt("Go to line:");
              const n = ans ? parseInt(ans, 10) : NaN;
              if (Number.isFinite(n) && n > 0) editorRef.current?.gotoLine(n);
            },
          },
        ],
      },
      {
        label: "&View",
        items: [
          {
            kind: "item",
            label: "&Command Palette…",
            accel: "Ctrl+Shift+P",
            onClick: () => setPaletteOpen(true),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Show &Sidebar",
            accel: "Ctrl+B",
            checked: showSidebar,
            onClick: () => setShowSidebar((v) => !v),
          },
          {
            kind: "item",
            label: "Show &Log Panel",
            accel: "Ctrl+J",
            checked: showLogPanel,
            onClick: () => setShowLogPanel((v) => !v),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Show &Files",
            accel: "Ctrl+1",
            onClick: () => {
              setShowSidebar(true);
              setSidebarTab("files");
            },
          },
          {
            kind: "item",
            label: "Show &Outline",
            accel: "Ctrl+2",
            onClick: () => {
              setShowSidebar(true);
              setSidebarTab("outline");
            },
          },
          { kind: "separator" },
          {
            kind: "submenu",
            label: "&Theme",
            items: (["dark", "light", "system"] as const).map((t) => ({
              kind: "item" as const,
              label: t[0].toUpperCase() + t.slice(1),
              checked: theme === t,
              onClick: () => setTheme(t),
            })),
          },
        ],
      },
      {
        label: "&Build",
        items: [
          {
            kind: "item",
            label: buildPhase === "running" ? "&Building…" : "&Build",
            accel: "F5",
            disabled: !activeDoc || buildPhase === "running",
            onClick: handleBuild,
          },
          {
            kind: "item",
            label: "&Cancel Build",
            accel: "Shift+F5",
            disabled: buildPhase !== "running",
            onClick: handleCancelBuild,
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Build &on Save",
            checked: buildOnSave,
            onClick: () => setBuildOnSave((v) => !v),
          },
          { kind: "separator" },
          {
            kind: "submenu",
            label: "&Engine",
            items: [
              ...(["latexmk", "pdflatex", "xelatex", "lualatex", "tectonic"] as const).map<MenuEntryAlias>((e) => ({
                kind: "item" as const,
                label: `${e}${availableEngines.includes(e) ? "" : " (not installed)"}`,
                checked: engine === e,
                onClick: () => setEngine(e),
              })),
              { kind: "separator" },
              {
                kind: "item",
                label: "&Install Tectonic…",
                onClick: () => setTectonicOpen(true),
              },
            ],
          },
          {
            kind: "item",
            label: "&Probe Engines…",
            onClick: async () => {
              const av = await probeAndRecord();
              if (av.length === 0) toast.error("No LaTeX engines found", null);
              else
                toast.success(
                  `Found: ${av.join(", ")}`,
                  6000,
                );
            },
          },
        ],
      },
      {
        label: "&Help",
        items: [
          {
            kind: "item",
            label: "&Documentation",
            accel: "F1",
            onClick: () => window.open("https://tauri.app/", "_blank"),
          },
          {
            kind: "item",
            label: "&Keyboard Shortcuts",
            onClick: () =>
              toast.info(
                "Ctrl/Cmd+S Save · F5 Build · Ctrl+Shift+P Palette · Ctrl+B Sidebar · Ctrl+J Log · Ctrl+Alt+J SyncTeX forward",
                7000,
              ),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "&About LaTeX Studio",
            onClick: () => toast.info(`LaTeX Studio v${version}`, 4000),
          },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDoc,
    recents,
    showSidebar,
    showLogPanel,
    theme,
    engine,
    buildOnSave,
    buildPhase,
    version,
    availableEngines,
  ]);

  return (
    <div className="h-full w-full flex flex-col bg-bg text-fg overflow-hidden">
      <MenuBar menus={menus} />
      {/* Body — overflow-hidden so its content cannot push the footer
          off-screen when the user shrinks the window. */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <main className="flex-1 flex min-h-0 overflow-hidden">
          {(() => {
            // The sidebar is only useful when there is something to show in it:
            // a folder enables the Files tree, an open file enables the Outline.
            const showFilesTab = !!rootDir;
            const showOutlineTab = !!activeDoc;
            const sidebarAvailable = showFilesTab || showOutlineTab;
            // If the currently selected tab isn't available, fall back to the
            // one that is so the content area is never empty.
            const effectiveTab =
              sidebarTab === "files" && !showFilesTab
                ? "outline"
                : sidebarTab === "outline" && !showOutlineTab
                ? "files"
                : sidebarTab;
            const sidebarVisible = sidebarAvailable && showSidebar;
            return (
              <>
                {/* Floating "expand sidebar" affordance when collapsed (only
                    if there is something to show). */}
                {sidebarAvailable && !showSidebar && (
                  <button
                    onClick={() => setShowSidebar(true)}
                    title="Show sidebar (Ctrl+B)"
                    className="absolute z-10 mt-10 ml-0 w-4 h-12 bg-bg-elevated border border-l-0 border-border rounded-r text-fg-muted hover:text-fg hover:bg-bg-hover flex items-center justify-center"
                    style={{ position: "fixed", left: 0, top: 36 }}
                  >
                    <PanelLeft className="h-3 w-3" />
                  </button>
                )}
                {/* Sidebar */}
                {sidebarVisible && (
                  <aside
                    style={{ width: sidebarW }}
                    className="shrink-0 bg-bg-panel flex flex-col text-sm overflow-hidden"
                  >
                    <div
                      className="flex items-stretch border-b border-border text-[11px] select-none"
                      style={{ flex: "0 0 36px", height: 36 }}
                    >
                      {showFilesTab && (
                        <SidebarTab
                          active={effectiveTab === "files"}
                          onClick={() => setSidebarTab("files")}
                        >
                          Files
                        </SidebarTab>
                      )}
                      {showOutlineTab && (
                        <SidebarTab
                          active={effectiveTab === "outline"}
                          onClick={() => setSidebarTab("outline")}
                        >
                          Outline
                        </SidebarTab>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto px-1 py-2">
                      {effectiveTab === "files" && rootDir ? (
                        <Tree
                          root={rootDir}
                          refreshToken={treeRefreshToken}
                          onOpenFile={(p) => void openFileByPath(p)}
                          onSetRootDoc={(p) => {
                            setRootDoc(p);
                            setStatus(`Build root set to ${p}`);
                          }}
                          selectedPath={activeDoc?.path ?? null}
                          rootDocPath={rootDoc}
                        />
                      ) : effectiveTab === "outline" && activeDoc ? (
                        <Outline
                          text={activeDoc.contents}
                          onJump={(line) => editorRef.current?.gotoLine(line)}
                        />
                      ) : null}
                    </div>
                    {rootDoc && (
                      <div
                        className="h-7 shrink-0 border-t border-border px-3 flex items-center text-[11px] text-fg-muted truncate"
                        title={rootDoc}
                      >
                        <span className="text-fg-subtle">root:</span>
                        <span className="text-accent ml-1 truncate">{rootDoc.split(/[\\/]/).pop()}</span>
                      </div>
                    )}
                  </aside>
                )}
                {sidebarVisible && (
                  <Splitter
                    direction="vertical"
                    size={sidebarW}
                    onResize={setSidebarW}
                    min={160}
                    max={560}
                    trailing
                  />
                )}
              </>
            );
          })()}

          {/* Editor */}
          <section className="flex-1 min-w-0 bg-bg flex flex-col">
            <DocHeader
              docLabel={docLabel}
              buildPhase={buildPhase}
              onBuild={handleBuild}
              onCancel={handleCancelBuild}
              canBuild={!!activeDoc}
              canClose={!!activeDoc}
              onClose={handleCloseDoc}
            />
            {activeDoc ? (
              <LatexEditor
                ref={editorRef}
                value={activeDoc.contents}
                onChange={updateContents}
                onSave={onEditorSave}
                onSyncRequest={handleForwardSync}
                spellLang={spellLang}
              />
            ) : (
              <EmptyState
                onNewFile={handleNewFile}
                onOpenFile={handleOpenFile}
                onOpenFolder={handleOpenFolder}
                onPalette={() => setPaletteOpen(true)}
                availableEngines={availableEngines}
                currentEngine={engine}
                onInstallTectonic={() => setTectonicOpen(true)}
              />
            )}
          </section>

          <Splitter
            direction="vertical"
            size={previewW}
            onResize={setPreviewW}
            min={260}
            max={1600}
            trailing={false}
          />

          {/* PDF preview */}
          <section
            style={{ width: previewW }}
            className="shrink-0 bg-bg flex flex-col min-h-0"
          >
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-fg-subtle text-sm">
                  Loading PDF viewer…
                </div>
              }
            >
              <PdfViewer
                pdfPath={buildPdfPath}
                reloadToken={pdfReloadToken}
                busy={buildPhase === "running"}
                syncTarget={syncTarget}
                onInverseSync={handleInverseSync}
              />
            </Suspense>
          </section>
        </main>

        {/* Log / problem panel */}
        {showLogPanel && (
          <Splitter
            direction="horizontal"
            size={logH}
            onResize={setLogH}
            min={80}
            max={800}
            trailing={false}
          />
        )}
        {showLogPanel && (
          <div
            style={{ height: logH }}
            className="shrink-0 min-h-0"
          >
            <LogPanel onJumpToLine={(line) => editorRef.current?.gotoLine(line)} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <footer className="h-7 shrink-0 border-t border-border bg-bg-elevated px-2 flex items-center gap-1 text-[11px] text-fg-muted select-none">
        <StatusBtn
          onClick={() => setShowSidebar((v) => !v)}
          title={showSidebar ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
          active={showSidebar}
        >
          <PanelLeft className="h-3 w-3" />
        </StatusBtn>
        <StatusBtn
          onClick={() => setShowLogPanel((v) => !v)}
          title={showLogPanel ? "Hide log panel (Ctrl+J)" : "Show log panel (Ctrl+J)"}
          active={showLogPanel}
        >
          <PanelBottom className="h-3 w-3" />
        </StatusBtn>
        <span className="w-px h-3 bg-border mx-1" />
        <span className="truncate flex-1 min-w-0" title={status}>
          {status}
        </span>
        <BuildPill phase={buildPhase} onClick={handleBuild} />
        <span className="w-px h-3 bg-border mx-1" />
        <StatusBtn onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+Shift+P)">
          <Keyboard className="h-3 w-3" />
          <span className="hidden md:inline ml-1">⌘P</span>
        </StatusBtn>
        <span className="px-2" title="Spellcheck">{spellLang ? `spell: ${spellLang}` : "spell: off"}</span>
        <span className="px-2" title="App version">v{version}</span>
      </footer>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
      <TectonicInstaller
        open={tectonicOpen}
        required={tectonicRequired}
        onClose={() => setTectonicOpen(false)}
        onInstalled={(path, version) => {
          setEngine("tectonic");
          setTectonicRequired(false);
          toast.success(`Tectonic ${version ?? ""} installed → ${path}`, 6000);
          setStatus("Tectonic ready");
        }}
      />
      <ToastHost />
    </div>
  );
}

function SidebarTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(ev) => {
        // Prevent dblclick-induced text selection that bleeds across siblings.
        if (ev.detail > 1) ev.preventDefault();
      }}
      className={
        "flex-1 px-3 text-center transition-colors select-none " +
        (active
          ? "text-fg bg-bg shadow-[inset_0_-2px_0_0_rgb(var(--c-accent))]"
          : "text-fg-muted hover:text-fg hover:bg-bg-hover")
      }
    >
      {children}
    </button>
  );
}

function StatusBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        "h-6 px-1.5 rounded flex items-center transition-colors " +
        (active
          ? "text-accent bg-accent/10 hover:bg-accent/20"
          : "text-fg-muted hover:text-fg hover:bg-bg-hover")
      }
    >
      {children}
    </button>
  );
}

function DocHeader({
  docLabel,
  buildPhase,
  onBuild,
  onCancel,
  canBuild,
  canClose,
  onClose,
}: {
  docLabel: string;
  buildPhase: "idle" | "running" | "success" | "failed" | "cancelled";
  onBuild: () => void;
  onCancel: () => void;
  canBuild: boolean;
  canClose: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="border-b border-border bg-bg-elevated px-3 flex items-center gap-2 text-xs"
      style={{ flex: "0 0 36px", height: 36 }}
    >
      <FileText className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
      <span className="truncate text-fg min-w-0" title={docLabel}>
        {docLabel}
      </span>
      {canClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-1 -ml-0.5 rounded text-fg-subtle hover:text-fg hover:bg-bg-hover transition-colors"
          title="Close file (Ctrl+W)"
          aria-label="Close file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="ml-auto flex items-center gap-1">
        {buildPhase === "running" ? (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors"
            title="Cancel build (Shift+F5)"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cancel
          </button>
        ) : (
          <button
            onClick={onBuild}
            disabled={!canBuild}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Build (F5)"
          >
            <Hammer className="h-3.5 w-3.5" />
            Build
          </button>
        )}
      </div>
    </div>
  );
}

function BuildPill({
  phase,
  onClick,
}: {
  phase: "idle" | "running" | "success" | "failed" | "cancelled";
  onClick: () => void;
}) {
  const map = {
    idle: { Icon: CircleDot, color: "text-fg-subtle", spin: false, label: "idle" },
    running: { Icon: Loader2, color: "text-accent", spin: true, label: "building" },
    success: { Icon: CheckCircle2, color: "text-emerald-400", spin: false, label: "ok" },
    failed: { Icon: AlertCircle, color: "text-red-400", spin: false, label: "failed" },
    cancelled: { Icon: CircleDot, color: "text-amber-400", spin: false, label: "cancelled" },
  } as const;
  const { Icon, color, spin, label } = map[phase];
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded hover:bg-bg-hover flex items-center gap-1"
      title={`Build: ${label} — click to rebuild`}
    >
      <Icon className={`h-3 w-3 ${color} ${spin ? "animate-spin" : ""}`} />
      <span className={color}>{label}</span>
    </button>
  );
}

function EmptyState({
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onPalette,
  availableEngines,
  currentEngine,
  onInstallTectonic,
}: {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onPalette: () => void;
  availableEngines: Engine[];
  currentEngine: Engine;
  onInstallTectonic: () => void;
}) {
  const Item = ({
    icon,
    label,
    keys,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    keys: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 rounded border border-border bg-bg-panel hover:border-accent/50 hover:bg-bg-hover transition-colors"
    >
      <span className="text-accent">{icon}</span>
      <span className="flex-1 text-fg">{label}</span>
      <span className="text-[10px] text-fg-subtle group-hover:text-fg-muted">{keys}</span>
    </button>
  );
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-4 text-fg-muted">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm">Get started</span>
        </div>
        <div className="space-y-2">
          <Item
            icon={<FilePlus2 className="h-4 w-4" />}
            label="New file"
            keys="Ctrl+N"
            onClick={onNewFile}
          />
          <Item
            icon={<FileUp className="h-4 w-4" />}
            label="Open file…"
            keys="Ctrl+O"
            onClick={onOpenFile}
          />
          <Item
            icon={<FolderOpen className="h-4 w-4" />}
            label="Open folder…"
            keys="Ctrl+Shift+O"
            onClick={onOpenFolder}
          />
          <Item
            icon={<Cog className="h-4 w-4" />}
            label="Command palette…"
            keys="Ctrl+Shift+P"
            onClick={onPalette}
          />
        </div>
        <div className="mt-6 text-[11px] text-fg-subtle leading-relaxed space-y-1">
          {availableEngines.length > 0 ? (
            <>
              <p>
                Installed LaTeX engines:{" "}
                {availableEngines.map((e, i) => (
                  <span key={e}>
                    <span
                      className={e === currentEngine ? "text-accent" : "text-fg-muted"}
                    >
                      {e}
                      {e === currentEngine ? " (active)" : ""}
                    </span>
                    {i < availableEngines.length - 1 ? ", " : ""}
                  </span>
                ))}
                .
              </p>
              <p>
                Switch the engine any time from
                <span className="text-fg-muted"> Build › Engine</span>.
              </p>
            </>
          ) : (
            <p>
              No LaTeX engine detected on this system. Install a TeX distribution
              (MiKTeX, TeX Live) so the
              <span className="text-fg-muted"> Build </span>
              command can compile your document, or{" "}
              <button
                type="button"
                onClick={onInstallTectonic}
                className="text-accent hover:underline"
              >
                install Tectonic now
              </button>
              . Engines are selectable from
              <span className="text-fg-muted"> Build › Engine</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
