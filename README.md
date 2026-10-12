# Apex Telemetry · RS3-Clone

A local-first Apple Silicon macOS telemetry workspace. Import AiM XRK sessions, select laps, compare speed and RPM, and follow the racing line alongside synchronized plots. Validated GPS geometry aligns laps by physical track position; approximate corner sections expose speed, time and channel differences with explicit resolution estimates. Click a track section to focus the whole comparison. When GPS cannot support spatial alignment, delta is clearly labeled estimated or withheld.

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
npm run tauri build
```

The native application bundle is generated under `src-tauri/target/release/bundle/macos/`.
Telemetry belongs in ignored `data/`; it is never committed. Importing reads files locally without changing them. The session library stores references and workspace preferences on this Mac, with atomic saves and a recoverable backup; parsed samples are cached in memory rather than duplicated on disk.

Reopening restores the active session, lap selections, channels, speed units, graph layout and compatible zoom. Missing files remain visible: use Locate to reconnect the same recording. Modified files require an explicit Refresh, which clears incompatible workspace state and corner edits. Removing a library entry never deletes its XRK file.

Use Edit boundaries on the circuit trace to adjust the automatic section boundaries, then drag a handle or use its arrow keys. Overrides belong to the selected primary lap and are stored in reference-track meters. Reset to automatic restores the detected sections; recorded telemetry and GPS alignment remain unchanged.

## Advanced analysis

Open Advanced beside Telemetry for G-G traction, shift events, RPM recovery, scatter plots, distributions, custom channels and saved analysis presets. Tools share lap selections, track sections, graph ranges and point cursors. Histogram bins describe aggregate occupancy and do not move the track cursor. Each tool retains its own channels and axis settings.

Choose accelerometer axes, signs and zero offsets before interpreting G-G plots. Logger calibration and mounting are not independently verified. Calculated gear and RPM-inferred shifts are labeled separately from measured gear changes. RPM recovery defaults to a configurable 8,200 RPM threshold; without throttle/gear evidence, low-RPM recoveries remain candidates.

Formulas use channel IDs in brackets, unit-bearing constants such as `8200{rpm}`, and explicit conversions such as `convert([channel-id], "mph")`. The Rust evaluator validates units and dependencies, rejects cycles, and leaves invalid or unsupported results as gaps. Saved formulas also appear in ordinary telemetry channels. Manage presets to save, rename, delete or choose a default; existing Milestone 4 workspaces remain compatible.

## Design

Rust owns decoding and full-precision numerical calculations; React owns presentation. The MIT-licensed libxrk core is pinned to a reviewed revision. uPlot renders synchronized channel overlays. Numerical limitations and missing data are shown in the workspace instead of inventing results. See [PROGRESS.md](PROGRESS.md) for observed validation and current limits.
