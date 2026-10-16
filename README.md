# Apex Telemetry · RS3-Clone

A local-first telemetry workspace targeting Apple Silicon macOS and Windows 10/11 x64. Import AiM XRK sessions, select laps, compare speed and RPM, and follow the racing line alongside synchronized plots. Validated GPS geometry aligns laps by physical track position; approximate corner sections expose speed, time and channel differences with explicit resolution estimates. Click a track section to focus the whole comparison. When GPS cannot support spatial alignment, delta is clearly labeled estimated or withheld.

**Windows status:** the native backend, installer configuration and cross-platform release pipeline are implemented in source. A Windows runner has not yet compiled/linked the complete application or generated an installer. Windows runtime/desktop acceptance is pending; see the [validation record](docs/windows-validation.md). Source typechecking and frontend passes are not Windows runtime evidence.

## Install on macOS

Requires an Apple Silicon Mac (M1 or newer) running macOS 13 Ventura or later. No Node, Rust, Xcode, or development server is needed to run the app.

1. Download the `*_aarch64.dmg` installer from [GitHub Releases](https://github.com/dalal35/RS3-Clone/releases).
2. Open the DMG and drag **Apex Telemetry** into **Applications**. Eject the disk image and open the app from Applications.
3. Import your local XRK recordings and optionally select local MP4/MOV footage. Local telemetry and video work offline, subject to system codec support. YouTube requires internet access and currently has a known native playback error 153; use local footage for synchronization (see [PROGRESS.md](PROGRESS.md)).

The app uses an ad-hoc signature, without Apple notarization or a paid Developer ID. macOS Gatekeeper can block the first launch. After attempting to open it, use **System Settings → Privacy & Security → Open Anyway**, then confirm Open, only if you trust the download. See [Apple's instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac) and [Tauri's ad-hoc signing limitations](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing). Managed Macs may prohibit this override.

The existing bundle ID, `com.dalal35.apextelemetry`, is retained so upgrades keep the same library. Persistent session references and workspace settings live in `~/Library/Application Support/com.dalal35.apextelemetry/`. Keep original XRK and video files available; the app references them in place. There is no automatic updater: download a new installer and replace the app in Applications.

## Install on Windows

The Windows build targets **Windows 10/11, x64**, using WebView2 and Media Foundation. Windows ARM64 and 32-bit builds are not provided. On Windows N, install Microsoft's [Media Feature Pack](https://support.microsoft.com/en-us/windows/experience/platform-variants/media-feature-pack-for-windows-10-11-n-february-2023) before launching: missing Media Foundation DLLs can prevent process startup. Available codecs still determine which MP4/MOV files can play or decode; an extension does not guarantee support.

Once a Windows build has passed native validation and its artifact is available:

1. Download `Apex Telemetry_0.1.0_x64-setup.exe` from [GitHub Releases](https://github.com/dalal35/RS3-Clone/releases), or obtain the `apex-windows` artifact from an authorized build-only Actions run. No Windows installer is claimed to exist by this source change; the filename follows the app version.
2. Run the setup program for your current user. The NSIS installer is configured for per-user installation, Start Menu integration and the standard desktop-shortcut option. Installed behavior still needs the acceptance checks below.
3. If WebView2 is absent, setup downloads its bootstrapper and installs the runtime silently. That first installation requires internet; local telemetry and supported local video can operate offline afterward. End users do not need Node, Rust, Python, Visual Studio or FFmpeg.
4. Launch Apex Telemetry and select your existing XRK files and local video. Keep original files available; importing does not move or duplicate them.

Windows releases are **unsigned**. SmartScreen may show “Windows protected your PC” or an unknown-publisher prompt. If you trust the source and verified the download, use **More info → Run anyway** when Windows offers it. Organization policy may prevent that override. This project does not claim Windows code signing.

The application resolves its library through Tauri's app-data API, normally `%APPDATA%\com.dalal35.apextelemetry\`, including `library.json` and its recoverable backup. Writable data is separate from the install directory. Standard upgrades are intended to preserve it; installation, upgrade and uninstall retention still need native acceptance. Workspace formats and identifiers are unchanged. Moving a workspace between operating systems can require **Locate** because stored source paths are absolute. Simultaneous editing by multiple app processes is not guaranteed.

## Develop

Requires Node 20+ and stable Rust. macOS development also requires Apple's Command Line Tools (`xcode-select --install`).

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
npm run test:release # artifact/version checks and publication failure simulations; no network writes
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:mac
```

`npm run build:mac` embeds the production frontend and builds only Apple Silicon, using the existing icons. Artifacts are `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Apex Telemetry.app` and `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Apex Telemetry_0.1.0_aarch64.dmg` (the filename version follows the app version). Apple's Command Line Tools are build-time dependencies only; the app uses system WebKit and AVFoundation at runtime.
Telemetry belongs in ignored `data/`; it is never committed. Importing reads files locally without changing them. The session library stores references and workspace preferences on this computer, with atomic saves and a recoverable backup; parsed samples are cached in memory rather than duplicated on disk.

### Windows development and production builds

Use a native Windows x64 environment with stable Rust's **MSVC** toolchain, Node 20+ (CI uses Node 22), Microsoft C++ Build Tools with **Desktop development with C++** and a Windows SDK, plus the Evergreen WebView2 runtime. Windows N also requires Media Feature Pack. Follow [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) for source builds. No Python or externally installed FFmpeg is used.

```powershell
npm ci
npm run tauri dev
# In a separate terminal, or after stopping dev:
npm test
npm run test:release
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib --test persistence --test video --test video_analysis
npm run build:windows
```

`build:windows` selects `x86_64-pc-windows-msvc` and NSIS explicitly; `tauri.windows.conf.json` supplies the Windows-only bundle settings and ICO. Expected installer output is `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Apex Telemetry_0.1.0_x64-setup.exe`. The app executable is `src-tauri/target/x86_64-pc-windows-msvc/release/apex-telemetry.exe`. Build these on Windows; the macOS bundler is not used to produce a Windows installer.

Browser verifiers use existing local Chrome on macOS or Playwright Chromium elsewhere. Run `npx playwright install chromium` before those checks. Real-XRK Rust integration suites and `test:plots`/`test:advanced` require the private ignored recordings in `data/`; do not upload those recordings to public CI. The Windows decoder tests generate original H.264/AAC fixtures using system encoders, and must execute on Windows rather than being counted as passing when compiled out.

Reopening restores the active session, lap selections, channels, speed units, graph layout and compatible zoom. Missing files remain visible: use Locate to reconnect the same recording. Modified files require an explicit Refresh, which clears incompatible workspace state and corner edits. Removing a library entry never deletes its XRK file.

Use Edit boundaries on the circuit trace to adjust the automatic section boundaries, then drag a handle or use its arrow keys. Overrides belong to the selected primary lap and are stored in reference-track meters. Reset to automatic restores the detected sections; recorded telemetry and GPS alignment remain unchanged.

## Release

The [release workflow](.github/workflows/release.yml) publishes only for a `v*` tag push. It checks matching package, lockfile, Tauri and Cargo versions. Separate `macos-15` Apple Silicon and `windows-latest` x64 MSVC jobs run shared frontend/browser and fixture-independent native tests, build native installers, inspect architecture/resources, and stage artifacts with SHA-256 manifests. The Windows job verifies its native decoder suite is actually enabled. Both builds must succeed before publication.

The publisher verifies both platforms came from the same revision/workflow run, creates a draft beta, uploads the complete set and checks remote asset names/sizes before making it public. A failed build publishes nothing; a failed upload leaves a draft. Existing releases, including stale drafts, cause safe failure and require deliberate resolution; assets are not clobbered. Build jobs have `contents: read`; only the publisher has `contents: write` using `GITHUB_TOKEN`. Apple ad-hoc signing is retained; no signing certificate, updater secret or Windows signing secret is added.

`workflow_dispatch` is **build/test/artifacts only** and cannot publish. Once the updated workflow is available on an authorized remote ref and registered for dispatch, select **Actions → Release macOS and Windows → Run workflow**, then download `apex-windows` and `apex-macos` from that run. Dispatch cannot test an unpushed local working tree. The current implementation has not been pushed or remotely validated.

Before an authorized release, run native checks on both operating systems, including the private-XRK suites locally, and complete installed-app acceptance. Useful local preflight commands are:

```sh
npm test
npm run test:release
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run build:mac
# On Windows:
npm run build:windows
```

Commit/push/tag only with explicit authorization. A matching new tag publishes a beta after both platform jobs and complete upload checks succeed. Never overwrite an existing release/tag to reuse its version. For later releases, update all three app versions and `package-lock.json` together before tagging. A hosted build is not installed-app acceptance: check Gatekeeper/SmartScreen, real dialogs/video, standard-user install/upgrade/uninstall and 100/125/150/200% Windows display scaling separately. See [the validation record](docs/windows-validation.md) for completed checks and remaining gaps.

## Advanced analysis

Open Advanced beside Telemetry for G-G traction, shift events, RPM recovery, scatter plots, distributions, custom channels and saved analysis presets. Tools share lap selections, track sections, graph ranges and point cursors. Histogram bins describe aggregate occupancy and do not move the track cursor. Each tool retains its own channels and axis settings.

Choose accelerometer axes, signs and zero offsets before interpreting G-G plots. Logger calibration and mounting are not independently verified. Calculated gear and RPM-inferred shifts are labeled separately from measured gear changes. RPM recovery defaults to a configurable 8,200 RPM threshold; without throttle/gear evidence, low-RPM recoveries remain candidates.

Formulas use channel IDs in brackets, unit-bearing constants such as `8200{rpm}`, and explicit conversions such as `convert([channel-id], "mph")`. The Rust evaluator validates units and dependencies, rejects cycles, and leaves invalid or unsupported results as gaps. Saved formulas also appear in ordinary telemetry channels. Manage presets to save, rename, delete or choose a default; existing Milestone 4 workspaces remain compatible.

## Design

Rust owns decoding and full-precision numerical calculations; React owns presentation. The MIT-licensed libxrk core is pinned to a reviewed revision. uPlot renders synchronized channel overlays. Numerical limitations and missing data are shown in the workspace instead of inventing results. See [PROGRESS.md](PROGRESS.md) for observed validation and current limits.

Local frame analysis shares one Rust API: macOS retains AVFoundation/Core Image and its Objective-C bridge; Windows uses Media Foundation Source Reader through Windows-only Rust bindings. Frames retain actual presentation timestamps, with bounded RGB/gray output, resize, progress and cooperative cancellation on a blocking worker. Codec and color behavior depend on the system stack. Windows reports the first actual video-sample PTS as track start; macOS track metadata can include a leading empty edit. Both frame timelines must match playback; Windows timing/rotation remains a native validation gate.

Manual video synchronization and persisted segment mappings remain shared. YouTube playback is implemented but has a known macOS packaged error 153; packaged Windows availability is unverified. YouTube downloading and automatic visual synchronization are not implemented. The frame-processing backend is infrastructure for later visual analysis, not a claim that automatic crossing detection or synchronization is available.
