# Apex Telemetry · RS3-Clone

A local-first Apple Silicon macOS telemetry workspace. Import AiM XRK sessions, select laps, compare speed and RPM, and follow the racing line alongside synchronized plots. Validated GPS geometry aligns laps by physical track position; approximate corner sections expose speed, time and channel differences with explicit resolution estimates. Click a track section to focus the whole comparison. When GPS cannot support spatial alignment, delta is clearly labeled estimated or withheld.

## Install on macOS

Requires an Apple Silicon Mac (M1 or newer) running macOS 13 Ventura or later. No Node, Rust, Xcode, or development server is needed to run the app.

1. Download the `*_aarch64.dmg` installer from [GitHub Releases](https://github.com/dalal35/RS3-Clone/releases).
2. Open the DMG and drag **Apex Telemetry** into **Applications**. Eject the disk image and open the app from Applications.
3. Import your local XRK recordings and optionally select local MP4/MOV footage. Local telemetry and video work offline, subject to system codec support. YouTube requires internet access and currently has a known native playback error 153; use local footage for synchronization (see [PROGRESS.md](PROGRESS.md)).

The app uses an ad-hoc signature, without Apple notarization or a paid Developer ID. macOS Gatekeeper can block the first launch. After attempting to open it, use **System Settings → Privacy & Security → Open Anyway**, then confirm Open, only if you trust the download. See [Apple's instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac) and [Tauri's ad-hoc signing limitations](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing). Managed Macs may prohibit this override.

The existing bundle ID, `com.dalal35.apextelemetry`, is retained so upgrades keep the same library. Persistent session references and workspace settings live in `~/Library/Application Support/com.dalal35.apextelemetry/`. Keep original XRK and video files available; the app references them in place. There is no automatic updater: download a new installer and replace the app in Applications.

## Develop

Requires Node 20+ and stable Rust with Apple's Command Line Tools (`xcode-select --install`).

```sh
npm ci
npm run tauri dev
```

If using the project-local toolchain created during development:

```sh
export RUSTUP_HOME="$PWD/.toolchain/rustup"
export CARGO_HOME="$PWD/.toolchain/cargo"
export PATH="$CARGO_HOME/bin:$PATH"
npm run tauri dev
```

```sh
npm test
npm run build
npm run test:plots # uses local real XRK fixtures and Chrome (or Playwright Chromium)
npm run test:workflow # browser workflow checks with simulated IPC
npm run test:advanced # real-XRK-backed advanced workflows and async races
npm run test:canvas # histogram inspection and canvas rendering regressions
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:mac
```

`npm run build:mac` embeds the production frontend and builds only Apple Silicon, using the existing icons. Artifacts are `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Apex Telemetry.app` and `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Apex Telemetry_0.1.0_aarch64.dmg` (the filename version follows the app version). Apple's Command Line Tools are build-time dependencies only; the app uses system WebKit and AVFoundation at runtime.
Telemetry belongs in ignored `data/`; it is never committed. Importing reads files locally without changing them. The session library stores references and workspace preferences on this Mac, with atomic saves and a recoverable backup; parsed samples are cached in memory rather than duplicated on disk.

Reopening restores the active session, lap selections, channels, speed units, graph layout and compatible zoom. Missing files remain visible: use Locate to reconnect the same recording. Modified files require an explicit Refresh, which clears incompatible workspace state and corner edits. Removing a library entry never deletes its XRK file.

Use Edit boundaries on the circuit trace to adjust the automatic section boundaries, then drag a handle or use its arrow keys. Overrides belong to the selected primary lap and are stored in reference-track meters. Reset to automatic restores the detected sections; recorded telemetry and GPS alignment remain unchanged.

## Release

The [release workflow](.github/workflows/release.yml) runs only when a `v*` tag is pushed. It checks that the tag matches the versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, runs the frontend and fixture-independent native tests, then uses `tauri-apps/tauri-action` to build and publish the Apple Silicon installer as a beta pre-release to GitHub Releases. The workflow uses `GITHUB_TOKEN` with `contents: write`; no Apple certificate or updater secrets are needed. Real-XRK tests require the private recordings in ignored `data/` and must be checked locally before release.

For the first release, review and commit the intended changes (including any existing work that should ship), then explicitly publish:

```sh
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run build:mac
git push origin HEAD
git tag -a v0.1.0 -m "Apex Telemetry 0.1.0"
git push origin v0.1.0
```

Pushing the tag publishes a beta pre-release automatically after checks and packaging succeed. For later releases, update all three app versions and `package-lock.json` together before tagging. Install a downloaded release on a separate Mac to check Gatekeeper and first-run behavior before announcing it.

## Advanced analysis

Open Advanced beside Telemetry for G-G traction, shift events, RPM recovery, scatter plots, distributions, custom channels and saved analysis presets. Tools share lap selections, track sections, graph ranges and point cursors. Histogram bins describe aggregate occupancy and do not move the track cursor. Each tool retains its own channels and axis settings.

Choose accelerometer axes, signs and zero offsets before interpreting G-G plots. Logger calibration and mounting are not independently verified. Calculated gear and RPM-inferred shifts are labeled separately from measured gear changes. RPM recovery defaults to a configurable 8,200 RPM threshold; without throttle/gear evidence, low-RPM recoveries remain candidates.

Formulas use channel IDs in brackets, unit-bearing constants such as `8200{rpm}`, and explicit conversions such as `convert([channel-id], "mph")`. The Rust evaluator validates units and dependencies, rejects cycles, and leaves invalid or unsupported results as gaps. Saved formulas also appear in ordinary telemetry channels. Manage presets to save, rename, delete or choose a default; existing Milestone 4 workspaces remain compatible.

## Design

Rust owns decoding and full-precision numerical calculations; React owns presentation. The MIT-licensed libxrk core is pinned to a reviewed revision. uPlot renders synchronized channel overlays. Numerical limitations and missing data are shown in the workspace instead of inventing results. See [PROGRESS.md](PROGRESS.md) for observed validation and current limits.
