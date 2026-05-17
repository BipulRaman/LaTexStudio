# DesktopLatex — Fresh Build Plan

A polished, cross-platform desktop LaTeX editor with live PDF preview, built from scratch in Rust.

## Problem Statement

Build a desktop LaTeX editor that feels as polished as TeXstudio / Overleaf / VS Code's LaTeX Workshop, but as a lightweight native app:

- Small binary, fast cold start, low RAM
- First-class LaTeX authoring UX: syntax highlighting, autocomplete, snippets, outline, spellcheck
- Live PDF preview with **SyncTeX** (click PDF → jump to source; Ctrl+click source → jump to PDF page)
- Single-file mode **and** project/folder workspaces
- Robust LaTeX build pipeline with a friendly log/error view
- Cross-platform: Windows, macOS, Linux

## Chosen Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Rust-backed, ~10 MB binary, native menus, system webview. Best polish-per-effort for a desktop editor. |
| Backend lang | **Rust** | Fast file I/O, safe process spawning, native SyncTeX & Hunspell bindings. |
| Frontend | **React 18 + TypeScript + Vite** | Mature, fastest path to a polished UI. |
| Editor | **CodeMirror 6** | Best-in-class web code editor; works flawlessly in system webviews (no Monaco/WebKit issues). |
| PDF rendering | **PDF.js** | Mature, supports text layer for selection, easy SyncTeX integration. |
| Styling | **Tailwind CSS + CSS variables for theming** | Fast iteration, consistent design tokens. |
| State | **Zustand** | Small, ergonomic, no boilerplate. |
| Icons | **lucide-react** | Clean, consistent icon set. |
| LaTeX engine | **latexmk** (default), with fallback to `pdflatex`/`xelatex`/`lualatex` if user prefers | latexmk auto-handles re-runs, bib, glossaries, indexes — the right default. |
| Spell check | **Hunspell (via `hunspell-rs`)** | Industry-standard dictionaries, available for every language. |
| SyncTeX | **`synctex` C lib via Rust FFI** (or pure-Rust `synctex` crate) | Forward + inverse search. |
| File watch | **`notify` crate** | Cross-platform FS watcher for external edits & auto-build. |
| Settings | **`serde_json` config in app data dir** | Simple, debuggable. |

## High-Level Architecture

```
┌───────────────────────────── Tauri Window ─────────────────────────────┐
│  React UI (Vite dev server in dev, bundled dist in prod)               │
│  ┌──────────┬─────────────────────────────┬─────────────────────────┐  │
│  │ Sidebar  │  CodeMirror 6 editor        │  PDF.js preview         │  │
│  │ (tree,   │  (LaTeX mode, snippets,     │  (page nav, zoom,       │  │
│  │ outline) │   autocomplete, spellcheck) │   SyncTeX click → src)  │  │
│  └──────────┴─────────────────────────────┴─────────────────────────┘  │
│  Log panel · Status bar · Command palette · Native menu                │
│            ▲                              │                            │
│      invoke('cmd', …)               listen('event', …)                 │
│            │                              ▼                            │
├────────────┼──────────────────────────────┬────────────────────────────┤
│  Rust backend (src-tauri/src)             │ emits: build:progress,     │
│  · fs / dialog / config                   │        fs:changed,         │
│  · build pipeline (latexmk runner)        │        menu:*, synctex:*   │
│  · log parser  · synctex  · spellcheck    │                            │
│  · file watcher  · recents / session      │                            │
└────────────────────────────────────────────────────────────────────────┘
```

## Repository Layout (after scaffold)

```
LaTeX Studio/
├─ src/                         # React frontend
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ api/                      # Thin wrappers over Tauri invoke / listen
│  │  ├─ fs.ts
│  │  ├─ build.ts
│  │  ├─ synctex.ts
│  │  └─ settings.ts
│  ├─ state/                    # Zustand stores
│  │  ├─ workspace.ts
│  │  ├─ editor.ts
│  │  ├─ build.ts
│  │  └─ ui.ts
│  ├─ editor/                   # CodeMirror setup
│  │  ├─ LatexEditor.tsx
│  │  ├─ latex-language.ts      # StreamLanguage / Lezer LaTeX grammar
│  │  ├─ latex-theme.ts
│  │  ├─ snippets.ts
│  │  ├─ autocomplete.ts        # commands, environments, refs/cites
│  │  ├─ spellcheck.ts          # decoration plugin → Rust invoke
│  │  └─ synctex-bridge.ts
│  ├─ components/
│  │  ├─ Sidebar/{Tree.tsx, Outline.tsx}
│  │  ├─ PdfViewer/{Viewer.tsx, Toolbar.tsx, Thumbnails.tsx}
│  │  ├─ LogPanel/{LogPanel.tsx, ProblemList.tsx}
│  │  ├─ Toolbar.tsx
│  │  ├─ StatusBar.tsx
│  │  ├─ CommandPalette.tsx
│  │  └─ SettingsDialog.tsx
│  ├─ styles/{globals.css, tailwind.css}
│  └─ types.ts
│
├─ src-tauri/                   # Rust backend
│  ├─ Cargo.toml
│  ├─ tauri.conf.json
│  ├─ build.rs
│  ├─ icons/
│  └─ src/
│     ├─ main.rs                # Tauri setup, menu, window
│     ├─ commands/              # #[tauri::command] handlers
│     │  ├─ mod.rs
│     │  ├─ fs.rs               # read/write/list/dialogs
│     │  ├─ build.rs            # compile_latex, cancel_build
│     │  ├─ synctex.rs          # forward/inverse sync
│     │  ├─ spellcheck.rs       # check_word, suggest, add_to_dict
│     │  ├─ settings.rs
│     │  └─ recents.rs
│     ├─ build/                 # Build pipeline
│     │  ├─ runner.rs           # spawn latexmk, stream stdout
│     │  ├─ engine.rs           # detect & probe TeX install
│     │  └─ log_parser.rs       # parse .log → structured diagnostics
│     ├─ watcher.rs             # notify-based FS watcher
│     ├─ paths.rs               # app data, build dir, tempfiles
│     └─ errors.rs
│
├─ resources/
│  └─ dictionaries/             # bundled Hunspell dicts (en_US, etc.)
│
├─ vite.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ package.json
├─ README.md
└─ plan.md
```

## Build Phases

Each phase produces a runnable app at the end (no broken intermediate states). Numbers map to todo IDs in SQL.

### Phase 1 — Scaffold & infrastructure
- `npm create tauri-app@latest` (React + TS + Vite template), Tauri 2
- Tailwind, ESLint + Prettier, Zustand, lucide-react
- App window config: 1440×900, minSize 1000×600, dark `#0f1115`, native menu placeholder
- Smoke test: app launches, shows "Hello" panel; `npm run tauri build` succeeds on host OS

### Phase 2 — Rust backend foundation
- `commands::fs` — `read_file`, `write_file`, `list_dir`, dialogs (open file, open folder, save as)
- `commands::settings` — load/save JSON config in `app_data_dir`
- `commands::recents` — recent files / recent workspaces (capped list)
- `paths` — resolve app data, per-project build dir under `app_data_dir/builds/<hash>`
- `errors` — typed `Error` with `serde::Serialize` for clean frontend handling

### Phase 3 — Editor MVP (CodeMirror 6)
- `LatexEditor.tsx` with `@uiw/react-codemirror`
- LaTeX language: start with `@codemirror/legacy-modes/mode/stex`, plan migration to a Lezer grammar later
- Custom dark theme matching app palette
- Editor handle exposed via ref: `wrapSelection`, `replaceLine`, `insert`, `focus`, `gotoLine`
- Open / Save / Save As wired to backend dialogs
- Dirty-state tracking, "modified" indicator in title bar

### Phase 4 — LaTeX build pipeline
- `build::engine::probe()` — detect installed engines on PATH (`latexmk`, `pdflatex`, `xelatex`, `lualatex`)
- `build::runner` — spawn `latexmk -interaction=nonstopmode -synctex=1 -output-directory=<build>` with chosen engine, stream stdout line-by-line as `build:progress` events
- Cancellation: keep `Child` handle in app state, expose `cancel_build` command
- Concurrency guard: only one build per document at a time, queue subsequent triggers
- `build::log_parser` — parse `.log` into `Vec<Diagnostic { severity, file, line, message }>`
- Frontend: build button, build-on-save toggle, log panel with structured problem list, jump-to-error on click

### Phase 5 — PDF preview (PDF.js)
- Worker bootstrapped via Vite (`pdfjs-dist/build/pdf.worker?worker`)
- Continuous scroll viewer with text layer (selection + copy)
- Zoom: fit-width, fit-page, %, ctrl+wheel
- Page nav: keyboard, scroll, thumbnail strip
- Reload PDF efficiently after each successful build (preserve scroll position & zoom)
- Refuse to display stale PDF — show "Build in progress…" overlay

### Phase 6 — Project / workspace mode
- "Open folder" creates a workspace; sidebar shows file tree (lazy-load directories)
- `notify`-based watcher → emit `fs:changed` events; sidebar & editor react
- Root document selection (auto-detect via `% !TEX root = …` magic comment, or user-set)
- Build always targets the root document, not the active file
- Multi-file: support `\input` / `\include` for outline & jump-to-definition

### Phase 7 — Autocomplete & snippets
- Static dictionary of common LaTeX commands + environments (seeded from CTAN package list)
- Context-aware completions:
  - Inside `\cite{|}` → suggest bib keys (scan `.bib` files)
  - Inside `\ref{|}` / `\eqref{|}` → suggest labels (scan workspace for `\label{…}`)
  - Inside `\begin{|}` → environments, auto-insert matching `\end{…}`
- Snippet engine (tabstops, mirrored placeholders) for `figure`, `table`, `equation`, etc.
- User-defined snippets in settings

### Phase 8 — SyncTeX (forward + inverse)
- Rust `commands::synctex` calling synctex parser to produce mapping
- Forward: Ctrl+click in editor → emit `synctex:goto_pdf { page, x, y }` → PDF viewer scrolls + flashes overlay
- Inverse: Shift+click in PDF text layer → invoke `synctex_inverse` → editor jumps to file/line + flashes line

### Phase 9 — Outline panel
- Parse workspace for `\part / \chapter / \section / \subsection / \subsubsection`
- Render collapsible tree in sidebar
- Click → jump to source line
- Re-parses on save (debounced)

### Phase 10 — Spellcheck
- Bundle Hunspell dictionaries in `resources/dictionaries/`, user can add more
- Rust spellchecker keeps loaded dict in `Mutex<Hunspell>` app state
- CodeMirror plugin: walks visible doc, batches words to `check_words` invoke, decorates misspellings with underline
- Right-click misspelling → context menu with suggestions + "Add to dictionary"
- Ignore LaTeX commands, math environments, and comments

### Phase 11 — Polish & UX
- Native menus (File, Edit, View, Build, Help) with platform-correct accelerators
- Command palette (Ctrl/Cmd+Shift+P) over all commands
- Status bar: cursor pos, file encoding, line endings, engine, build status, word count
- Recent files / recent workspaces in File menu
- Light & dark themes with system-preference detection
- Toasts for non-blocking notifications (build success/fail, file changed externally)
- Crash-safe autosave to `app_data_dir/sessions/<id>/`; offer to recover on launch

### Phase 12 — Packaging & distribution
- Tauri bundler: `.msi` (Windows), `.dmg` (macOS), `.AppImage` + `.deb` (Linux)
- Icons + window/installer metadata
- Code signing pipeline (notes for Windows EV cert / Apple notarization — set up later)
- Auto-update via Tauri updater (signed JSON manifest hosted on GitHub Releases)
- README with install instructions and TeX prerequisite note (or recommend bundling Tectonic later)

## Cross-Cutting Concerns

- **Errors**: Single `AppError` enum on Rust side, serialized as `{ code, message, details }`. Frontend `invokeSafe()` wrapper normalizes errors into a `Result`-like type and surfaces them via toasts.
- **Logging**: `tracing` + `tracing-subscriber` in Rust, log file under `app_data_dir/logs/`. Frontend forwards window errors to backend via dedicated command.
- **Performance budgets**: cold start <800 ms, keystroke→paint <16 ms in a 5k-line doc, build trigger→stdout first line <50 ms.
- **Testing**:
  - Rust: unit tests for `log_parser`, `synctex`, `paths`, `engine::probe`; integration tests for build runner using a tiny fixture doc.
  - Frontend: Vitest + React Testing Library for `LatexEditor` (handle API), `LogPanel`, autocomplete logic.
  - End-to-end smoke test via `tauri-driver` + WebDriver for "open → edit → build → preview" path.
- **Accessibility**: keyboard-navigable sidebar, command palette, menus; sufficient contrast in both themes; respect `prefers-reduced-motion`.
- **Security**: Tauri allowlist scoped tightly (only needed fs paths, no shell scope beyond build commands), CSP locked down.

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LaTeX install missing on user machine | Detect at startup, show actionable dialog with platform-specific install instructions. Future: optional Tectonic bundling. |
| SyncTeX C lib FFI complexity | Start with pure-Rust `synctex` crate; fall back to FFI only if needed. |
| PDF.js bundle size & worker setup in Tauri | Use Vite worker plugin pattern; verify in both `tauri dev` and bundled `tauri build`. |
| CodeMirror autocomplete latency in big docs | Debounce; precompute label/bib indexes in Rust and cache per workspace. |
| Hunspell dictionary size | Ship only `en_US` by default (~1 MB), download others on demand. |
| File watcher noise on save (own writes trigger reload) | Tag writes with an in-flight token; ignore events that match the most recent self-write. |
| Cross-platform menu accelerators | Use Tauri menu builder's per-OS accelerator helpers; centralized command registry. |

## Out of Scope (v1)

- Real-time collaboration / cloud sync
- Git integration (use system git for now)
- BibTeX entry editor (textual editing only; nice-to-have for v2)
- Bundled TeX distribution / Tectonic embedding (v2)
- Mobile or web targets

## Definition of Done (v1)

- All Phase 1–12 todos green
- Cold start <800 ms on a mid-range laptop
- Open a 50-page sample project → edit → Ctrl+S → builds → preview updates → SyncTeX forward & inverse both work
- Installer builds successfully on Windows, macOS, Linux in CI
- README covers: install, prerequisites, first build, troubleshooting
