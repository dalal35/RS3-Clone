# Apex Telemetry · RS3-Clone

A local-first Apple Silicon macOS telemetry workspace. Import AiM XRK sessions, select laps, compare speed and RPM, and follow the racing line alongside synchronized plots.

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
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

The native application bundle is generated under `src-tauri/target/release/bundle/macos/`.
Telemetry belongs in ignored `data/`; it is never committed. Importing reads files locally without changing them. Sessions remain in memory for the current app launch.

## Design

Rust owns decoding and full-precision numerical calculations; React owns presentation. The MIT-licensed libxrk core is pinned to a reviewed revision. uPlot renders synchronized channel overlays. Numerical limitations and missing data are shown in the workspace instead of inventing results. See [PROGRESS.md](PROGRESS.md) for observed validation and current limits.
