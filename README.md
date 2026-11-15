# QR Code Generator

An offline desktop QR code generator for **macOS and Windows**, built with Tauri 2, React, and TypeScript. English UI with automatic light/dark appearance.

## Features

- Encode text, URLs, multiline content, Chinese, and Emoji without changing the original content.
- Choose image size (128–2048 px), margin (0–16 QR modules), and error correction (L/M/Q/H).
- Options are remembered automatically and restored on restart. New QR code clears the content while keeping the current options; restoring history also remembers that record's options.
- Generate explicitly with **Generate QR code** or **Cmd/Ctrl + Enter** while editing text.
- Save PNG or SVG using the native save dialog; copy an actual image to the system clipboard.
- Restore, delete, or clear local generation history. Identical content and settings refresh the existing record; the newest 500 are retained.
- No accounts, uploads, external fonts, analytics, or runtime network requests.

`Size` includes the margin. A margin of 4 modules is the recommended default. QR images always use opaque black and white regardless of the app theme. Changing the draft disables export until it is generated again.

## Prerequisites

- Node.js **22.12+** and npm (Node 22 LTS recommended).
- Current stable Rust installed through rustup.
- macOS: Xcode Command Line Tools (`xcode-select --install`).
- Windows: Visual Studio Build Tools with **Desktop development with C++**, Windows SDK, Rust's MSVC toolchain, and Microsoft Edge WebView2 Runtime.

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform setup.

## Develop

```sh
npm ci
npm run tauri -- dev
```

This starts Vite at `http://127.0.0.1:1420` and opens the native app. `npm run dev` alone supports frontend layout development; native save, clipboard, and history require the Tauri window. Browser mode displays a history-unavailable message instead of pretending native integration succeeded.

## Check

```sh
npm run check
npm run check:version
npm run format:check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Tests cover independent decoding of the generated pixels with `jsQR`, exact image dimensions and margins, Unicode/multiline content, every correction level, capacity/size errors, history validation/deduplication/limits, store failures, native service calls/resource cleanup, and the React user workflow. Native APIs are mocked in frontend tests; OS integration also requires the manual checks below.

## Build installers

Build on the target operating system:

```sh
# macOS (current machine architecture)
npm run tauri -- build --bundles app,dmg

# Windows x64 (MSVC environment)
npm run tauri -- build --bundles nsis
```

Outputs are under `src-tauri/target/release/bundle/`. For a faster local application bundle on macOS, use `npm run tauri -- build --debug --bundles app` (output under `src-tauri/target/debug/bundle/`).

To remove previous build outputs and caches (works on macOS, Windows, and Linux):

```sh
npm run clean:frontend # Remove dist/ and tsconfig.tsbuildinfo
npm run clean:tauri    # Remove src-tauri/target/, including installers and Rust build caches
npm run clean          # Run both cleanup commands
```

The next native build after `clean:tauri` will recompile Rust dependencies.

GitHub Actions checks and builds macOS Apple Silicon, macOS Intel, and Windows x64 on pushes to `main`/`master`, version tags, pull requests, and manual runs. Installers are downloadable workflow artifacts. Pushing a `v*` tag automatically publishes a GitHub Release with all three installers after every build succeeds.

macOS bundles use a complete **ad-hoc signature** (`signingIdentity: "-"`). CI mounts each finished DMG read-only and checks its integrity, app version, architecture, sealed resources, and strict code-signature validity before uploading it. To run the same check locally:

```sh
bash scripts/verify-macos.sh "src-tauri/target/release/bundle/dmg/QR Code Generator_1.0.1_aarch64.dmg" arm64 1.0.1
```

The `npm run tauri` entry point prefers Apple's system tools on macOS, avoiding signing failures when an incompatible Homebrew `xattr` shadows `/usr/bin/xattr`. Other platforms keep their normal tool paths.

Ad-hoc signing fixes bundle integrity but does not establish an Apple-verified publisher or provide notarization. macOS may still require approval in Privacy & Security on first launch. Developer ID signing, Apple notarization, and store distribution require separately configured certificates and credentials. See [Tauri's signing guide](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing). Windows installers are unsigned.

To publish a new version, update `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, then refresh both lockfiles. Commit the changes and push a matching annotated tag:

```sh
npm install --package-lock-only
cargo check --manifest-path src-tauri/Cargo.toml
npm run check:version -- v1.0.0
git add .
git commit -m "Release 1.0.0"
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin main
git push origin v1.0.0
```

Replace `1.0.0` with the new version for subsequent releases. CI rejects mismatched application versions or tag names. The release job only receives write access on tag pushes and can upload assets again when rerun.

## Local data and failure handling

History is stored as versioned `history.json` in Tauri's application data directory:

- macOS: `~/Library/Application Support/com.qrcode-generator.desktop/history.json`
- Windows: `%APPDATA%\com.qrcode-generator.desktop\history.json`

Records contain the original text, generation parameters, ID, and last generation time. Images are rebuilt when restoring a record. The app explicitly saves after successful generation or deletion. Restoring does not add another record. Exported files are independent of history.

The last valid generation options are saved separately as `settings.json` in the same directory, immediately after each valid change. Empty or invalid intermediate inputs are not saved. Clearing generation history does not reset options. If options cannot be loaded, the app uses defaults; write failures are shown without blocking generation.

A Rust preflight checks the existing JSON before Tauri Store loads it; the frontend then validates records. If loading fails, history writes are disabled for that session and the original file is preserved. Generation and export remain available. Back up or repair the original file before restarting. If a save fails, the previous in-memory history remains visible and an error appears; the generated QR remains exportable.

Only the main window receives native capabilities. File writes are scoped to paths selected in the save dialog. Clipboard access is image-write only. The frontend CSP blocks remote assets and connections.

## Manual acceptance checks

On both operating systems:

1. Generate a URL, Chinese/Emoji, and multiline text. Scan the image and verify the full original content.
2. Change size, margin, and correction level; confirm exports disable until generating again. Check PNG pixel dimensions and open SVG in a browser/vector viewer.
3. Save both formats to a chosen directory, cancel a save, and attempt a write into an unwritable location.
4. Copy the code and paste into an image-aware application; confirm it is an image and scans correctly.
5. Restart and restore history. Confirm deduplication, single deletion, cancellation of clear, and confirmed clear. Exported files must remain.
6. Switch system light/dark appearance and resize down to the minimum window size; confirm the layout remains usable and the QR stays black on white.
7. With the app closed, back up the history file and replace it with invalid JSON; relaunch and confirm generation/export work while the damaged file stays unchanged. Restore the backup afterward.

## Structure

- `src/App.tsx`: editor, preview, history, feedback, and clear confirmation.
- `src/services/`: QR encoding/rendering, history persistence, native export/clipboard adapters.
- `src-tauri/`: native plugin registration, history preflight, desktop configuration, capabilities, and icons.
- `.github/workflows/build.yml`: cross-platform checks and installer builds.

The original vector app icon is `app-icon.svg`. Regenerate native icons with `npm run tauri -- icon app-icon.svg --output src-tauri/icons`.
