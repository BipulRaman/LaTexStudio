# LaTeX Studio — Desktop

The Tauri 2 + React + Rust desktop application for LaTeX Studio. This folder contains
everything needed to develop, build, and package the desktop client. For
high-level vision and the full roadmap, see [../Plan.md](../Plan.md).

## Contents

```
Desktop/
├─ src/                  # React + TypeScript frontend
│  ├─ api/               # Thin wrappers over Tauri invoke / event listeners
│  ├─ state/             # Zustand stores (workspace, build, theme, toasts)
│  ├─ editor/            # CodeMirror 6 setup (language, theme, snippets, spellcheck)
│  ├─ components/        # UI building blocks (sidebar, log panel, PDF viewer, palette)
│  └─ styles/            # Tailwind + globals
├─ src-tauri/            # Rust backend
│  ├─ src/commands/      # #[tauri::command] handlers (fs, build, synctex, …)
│  ├─ src/build/         # latexmk runner, engine probe, log parser
│  ├─ src/watcher.rs     # notify-based FS watcher
│  ├─ resources/         # Bundled assets (Hunspell dictionaries, etc.)
│  ├─ icons/             # App + installer icons
│  ├─ capabilities/      # Tauri capability manifests
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ public/               # Static assets served by Vite
├─ index.html
├─ vite.config.ts
├─ tailwind.config.js
├─ tsconfig.json
└─ package.json
```

## Prerequisites

To **build from source** you need:

- Node.js ≥ 20 and npm ≥ 10
- Rust stable (1.80+) — install via [rustup](https://rustup.rs/)
- Tauri 2 platform prerequisites —
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
  - Windows: Visual Studio Build Tools (C++ workload) + WebView2 Runtime
  - macOS: Xcode Command Line Tools
  - Linux: `webkit2gtk-4.1`, `libayatana-appindicator3`, `librsvg2`, etc.

To **run** the resulting app (LaTeX features), you also need a TeX
distribution providing `latexmk` (or `pdflatex` / `xelatex` / `lualatex`) on
`PATH`:

- Windows — [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/)
- macOS — [MacTeX](https://www.tug.org/mactex/)
- Linux — `sudo apt install texlive-full` (Debian/Ubuntu) or equivalent

The editor and PDF viewer work without TeX; only build/preview need it.

## Develop

```bash
cd Desktop
npm install
npm run tauri dev
```

`npm run tauri dev` launches the Tauri shell with the Vite dev server
hot-reloading the React frontend and `cargo` watching the Rust backend.

Useful npm scripts:

| Script              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Frontend-only Vite dev server (no Tauri)      |
| `npm run build`     | `tsc` + `vite build` → `dist/`                |
| `npm run tauri dev` | Full desktop app with hot reload              |
| `npm run tauri build` | Release build + platform installers         |
| `npm run lint`      | ESLint over `src/**/*.{ts,tsx}`               |
| `npm run format`    | Prettier write over `src/**`                  |

## Build installers

```bash
cd Desktop
npm run tauri build
```

Bundler outputs land under `src-tauri/target/release/bundle/`:

| Platform | Artifact                                       |
| -------- | ---------------------------------------------- |
| Windows  | `msi/LaTeX Studio_<ver>_x64_en-US.msi`, `nsis/LaTeX Studio_<ver>_x64-setup.exe` |
| macOS    | `dmg/*.dmg`, `macos/*.app`                     |
| Linux    | `appimage/*.AppImage`, `deb/*.deb`             |

The unpacked release binary (no installer needed for local testing) is at
`src-tauri/target/release/latex_studio.exe` on Windows (or `latex_studio` on
macOS/Linux).

Last verified Windows build: MSI ≈ 9.4 MB, NSIS ≈ 6.4 MB, standalone exe
≈ 26 MB.

## Enable spellcheck

LaTeX Studio ships without dictionaries by default. Drop a matching pair of
Hunspell files into `src-tauri/resources/dictionaries/`:

```
src-tauri/resources/dictionaries/en_US.aff
src-tauri/resources/dictionaries/en_US.dic
```

Public-domain dictionaries are available from
[wooorm/dictionaries](https://github.com/wooorm/dictionaries). Rebuild the
app afterwards — spellcheck enables automatically on next launch.

## Keyboard shortcuts

| Shortcut              | Action                              |
| --------------------- | ----------------------------------- |
| Ctrl/Cmd + S          | Save (and build if "on save" is on) |
| F5                    | Build                               |
| Ctrl/Cmd + Shift + P  | Command palette                     |
| Ctrl/Cmd + Alt + J    | SyncTeX forward (source → PDF)      |
| Ctrl/Cmd + click      | SyncTeX forward (source → PDF)      |
| Shift + click in PDF  | SyncTeX inverse (PDF → source)      |
| Ctrl + wheel in PDF   | Zoom                                |
| Ctrl/Cmd + Space      | Trigger autocomplete                |

## Troubleshooting

- **`tauri` command not found** — run via `npm run tauri …` (uses the local
  `@tauri-apps/cli`), or install globally with `npm i -g @tauri-apps/cli`.
- **Rust build is very slow on first compile** — expected; subsequent
  incremental builds take seconds. Artifacts cache in `src-tauri/target/`.
- **WebView2 missing on Windows** — install the Evergreen runtime from
  Microsoft, then re-run.
- **`latexmk` not found at runtime** — install MiKTeX/TeX Live and ensure
  it is on `PATH`; restart the app.
- **PDF preview is blank** — check the build log panel for compile errors;
  the viewer refuses to load a stale PDF while a build is in progress.

## Where to look next

- High-level vision, phases, and risks → [../Plan.md](../Plan.md)
- Repository-level overview & license → [../README.md](../README.md)
