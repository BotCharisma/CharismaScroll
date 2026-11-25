# CharismaScroll

**System-wide smooth mouse wheel physics studio for Windows.**

CharismaScroll intercepts raw mouse wheel detents at the Win32 `WH_MOUSE_LL` level and transforms them into buttery, high-refresh-rate (`60–360 Hz`) eased glide curves across every Windows application. Built with **Rust**, **Tauri 2**, and **React 19**.

---

## Key Features

- **High-Refresh Wheel Physics Engine (`60–360 Hz`)**: Uses Windows high-resolution waitable timers and sub-unit remainder carry so zero scroll distance is lost at any display refresh rate.
- **4 Tuned Built-in Presets + Custom Presets**: Switch effortlessly between *Classic Flow*, *Trackpad Glide*, *Snappy Code*, and *Cinema Drift*, or save custom presets into `Documents\CharismaScroll\presets`.
- **Per-App Profiles & Fullscreen Game Guard**: Automatically bypass smoothing in fullscreen games or assign custom curves / bypass rules per `.exe` process.
- **Precision Input Guards**: Preserves native precision touchpad gestures and cuts glide momentum immediately on `Ctrl` / `Alt` so browser zoom never overshoots.
- **Adaptive Windows Icons & Styled Tray Menu**:
  - Taskbar icon automatically switches between **Ivory** (Dark taskbar) and **Dark Espresso** (Light taskbar).
  - Custom styled System Tray popup menu with quick toggle, preset switching, and per-app bypass.
- **Ultra-Low Idle Memory (~8–15 MB)**: Closing the main window releases WebView2 completely while keeping smooth scrolling active in the background.
- **Single-Instance & Built-in Auto-Updater**: Re-launching opens your existing window instead of stacking duplicate hooks, and signed updates install directly from **System → App updates**.

---

## Installation (Windows 10 / 11 x64)

1. Go to the [Latest Release](https://github.com/BotCharisma/CharismaScroll/releases/latest) page.
2. Download either Windows installer:
   - **`CharismaScroll_<version>_x64-setup.exe`** *(Recommended — NSIS installer supporting both Current User and All Users)*
   - **`CharismaScroll_<version>_x64_en-US.msi`** *(MSI installer)*
3. Run the installer and launch **CharismaScroll**.

> [!NOTE]
> **Windows SmartScreen Notice (Unsigned Beta Builds)**
> Because early beta releases are not yet signed with a commercial Authenticode certificate, Windows Defender SmartScreen may show *"Windows protected your PC"*. Click **More info** → **Run anyway** to proceed.

---

## Usage & Shortcuts

- **Global Toggle Hotkey**: `Alt + Shift + S` (customizable in **System → Toggle & sync**).
- **System Tray**:
  - **Left-click** the orange mouse icon to open or focus the studio window.
  - **Right-click** to toggle smoothing, switch presets, bypass the most recently scrolled app, or quit.
- **Interactive Test Pad**: Click the grid button in the bottom-right corner to test *Prose*, *Code*, and horizontal *Strip* scrolling against a live deceleration curve trace.
- **Settings & Presets Storage**: Stored cleanly in `%USERPROFILE%\Documents\CharismaScroll`.

---

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install) (stable MSVC toolchain)
- Visual Studio C++ Build Tools (Desktop development with C++)

### Commands

```bash
# Install dependencies
npm install

# Pure web UI preview (mock backend)
npm run dev:web

# Full Tauri desktop dev (watches both frontend and Rust)
npm run dev:app

# Frontend-focused Tauri dev (Vite HMR active, Rust changes do not restart)
npm run dev:app:no-watch

# Run Rust physics unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Build production Windows installers (MSI + NSIS)
npm run tauri:build
```

---

## Architecture

```text
src/                          React 19 + TypeScript + WebGL2 SDF Stage UI
├── components/               StageLeft, MotionStagePanel, AppsGameTab, SystemTab, TestPadDrawer, TrayMenuPopup
├── lib/tauri.ts              Centralized typed Tauri IPC & event adapter
└── styles/                   Design tokens (Lexend Variable) & styles

src-tauri/src/                Rust + Win32 Backend
├── app/
│   ├── command_registry.rs   Tauri IPC command registration
│   ├── commands.rs           App snapshot, settings persistence, updater commands
│   ├── run.rs                App lifecycle, single-instance guard, watchers
│   └── tray.rs               Adaptive taskbar icon, lazy tray popup & memory release
├── engine/
│   ├── hook.rs               Zero-allocation WH_MOUSE_LL hook thread
│   └── physics.rs            High-resolution eased scroll accumulator & SendInput emitter
├── config.rs                 Documents\CharismaScroll settings & custom presets storage
└── platform.rs               Win32 single-instance mutex, theme watcher, hotkey, monitor Hz
```

---

## License

MIT
