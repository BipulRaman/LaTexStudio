# LaTeX Studio — Desktop

A modern, native desktop LaTeX editor for Windows, macOS and Linux —
built on Tauri 2, React and Rust. Local-first, MIT licensed, no telemetry.

**🌐 Website & downloads:** <https://bipul.in/LaTexStudio/>

The website auto-detects your OS and architecture and points you straight
at the right installer. For all variants (Windows MSI/NSIS, macOS Apple
Silicon/Intel `.dmg`, Linux `.deb`/`.rpm`/AppImage), see the
[Download section](https://bipul.in/LaTexStudio/#download)
or the [latest GitHub Release](https://github.com/BipulRaman/LaTexStudio/releases/latest).

---

This repository contains everything needed to develop, build, and package
the desktop client. For high-level vision and the full roadmap, see
[app/Plan.md](app/Plan.md).

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

## macOS: "app is damaged and can't be opened"

The macOS builds are ad-hoc signed but **not** notarized (we don't have a
paid Apple Developer account). On first launch:

- **Apple Silicon (M1/M2/M3/M4)** — if you downloaded a build older than
  the ad-hoc signing fix, macOS will refuse to launch it with
  *"LaTeX Studio.app is damaged and can't be opened. You should move it
  to the Trash."* Clear the quarantine attribute that Safari/Chrome
  attached during download:

  ```bash
  xattr -dr com.apple.quarantine "/Applications/LaTeX Studio.app"
  ```

  Then open the app normally. Newer builds (with ad-hoc signing) only
  need the right-click workaround below.

- **All Macs** — for any unsigned/ad-hoc build, the very first launch
  must be done by **right-click → Open → Open** so Gatekeeper records
  your approval. Double-clicking shows only a "cannot be opened" dialog
  with no Open button.

## Windows: SmartScreen "Windows protected your PC"

Windows installers (`.msi` and `setup.exe`) are **not** code-signed — we
don't have an EV code-signing certificate. On first run, Microsoft
Defender SmartScreen will show:

> Windows protected your PC
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

Click the small **More info** link, then the **Run anyway** button that
appears. After the first successful install, SmartScreen learns to trust
the binary and won't prompt again for that version. This is expected for
any unsigned app and does not mean the installer is corrupted.

## Linux: AppImage won't launch

Two common gotchas on a fresh download:

1. **Mark it executable.** Browsers strip the executable bit on download:

   ```bash
   chmod +x "LaTeX Studio_*.AppImage"
   ```

2. **Install FUSE 2.** Ubuntu 22.04+, Debian 12+, and Fedora 38+ no
   longer ship `libfuse2` by default. Without it AppImages fail with
   `dlopen(): error loading libfuse.so.2`:

   ```bash
   # Debian / Ubuntu
   sudo apt install libfuse2
   # Fedora
   sudo dnf install fuse-libs
   ```

If you prefer to avoid both issues, install the `.deb` package on
Debian/Ubuntu instead — it integrates with the system package manager
and has no FUSE requirement.

## Auto-update

Tagged GitHub releases automatically reach existing installs through Tauri's
built-in updater. The release pipeline signs every installer with an
Ed25519 key so the in-app updater can verify the source.

One-time setup of the signing keypair is required on a fresh fork — see
[docs/auto-update-setup.md](docs/auto-update-setup.md).

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
