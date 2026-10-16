# Apex Telemetry Windows support — approved design

Date: 2026-10-15. Status: **approved and implemented in source; native Windows acceptance pending**. Source baseline: [compatibility audit](../../windows-compatibility-audit.md). Current evidence: [validation record](../../windows-validation.md).

## Intent and constraints

Extend the existing Apex Telemetry application to Windows 10/11 x64 with the same React UI, data formats and Rust business logic. Preserve working Apple Silicon macOS behavior, existing user libraries and all uncommitted work. The deliverable is a native Windows NSIS installer and a cross-platform tag-based release pipeline, with honest per-platform validation evidence.

- App name: **Apex Telemetry**; version: **0.1.0**; identifier: **com.dalal35.apextelemetry**.
- Windows target: **x86_64-pc-windows-msvc**; macOS target: **aarch64-apple-darwin**, macOS minimum **13.0**.
- No product-code changes before approval of this design and its implementation plan. No commits, pushes, tags or publication without explicit authorization.
- At most two independent workers; parent owns architecture, integration and acceptance.
- Users need no Node.js, Rust, Python, compiler or separately installed FFmpeg.
- Retain parser revision, IPC contracts, library versions 1/2, workspace namespaces, original files and user preferences.
- No broad reorganization, duplicate frontend, new downloader or automatic-sync feature.

## Backend options and decision

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Media Foundation Source Reader through `windows` Rust bindings | System media stack, no distributed decoder executable; fits sequential native analysis | COM/MF lifetimes, output conversion, timestamps, rotation and codec variability require explicit handling | Recommended |
| Bundled FFmpeg | Broad codec support and consistent processing across operating systems | Binary size, packaging, updates, licensing and another decoder on macOS | Reserve for a future demonstrated codec requirement |
| OpenCV or C++/WinRT bridge | Existing media/CV abstractions or familiar native tooling | More native build surface; CV engine unnecessary for current frame infrastructure | Not justified now |

Independent read-only native advice supports the Source Reader approach and identifies persistence durability, signed stride and timestamp-origin handling as important acceptance risks. This decision is subject to native Windows proof in Stage 2; if required timing/orientation semantics cannot be achieved, return with evidence before changing backend strategy.

## Narrow platform boundary

Keep `src-tauri/src/video_analysis/mod.rs` as the shared public interface, validation, interval grid, progress state, consumer/backpressure and async worker. Add `windows.rs` and focused Windows helpers for buffer conversion and runtime lifetime only as needed. Use target-specific Cargo dependencies; choose and lock the maintained `windows` version compatible with the existing toolchain, without upgrading unrelated dependencies.

Windows implements the existing private interface:

```rust
Decoder::open(path: &Path) -> Result<Decoder>
Decoder::metadata(&self) -> VideoAnalysisMetadata
Decoder::next(&mut self, minimum: f64, dimensions: (u32, u32),
              format: PixelFormat, cancel: &CancellationToken)
    -> Result<Option<SampledVideoFrame>>
```

Dispatch with `cfg(target_os = "macos")` and `cfg(target_os = "windows")`; keep the explicit unsupported backend for other targets. Leave `macos.rs`, `decoder.m` and Apple framework compilation intact. The backend is a library facility: no new pixel IPC, frontend controls or synchronization algorithm are needed to port it.

## Windows decoder contract

- Create COM/MF guards and Source Reader on the executing blocking thread. Keep interfaces thread-confined; release samples, buffers and reader before MF shutdown/COM teardown. Balance every successful initialization, including concurrent jobs and error exits.
- Open local Unicode paths through UTF-16 APIs, including canonical Windows paths. Select the first video stream and deselect unrelated streams. Request an uncompressed format such as RGB32 using Source Reader conversion; fail with context if conversion is unavailable. Prefer software processing initially to avoid a Direct3D lifecycle.
- Report finite duration, validated display dimensions, optional nominal FPS and actual first video presentation time. Retain the first decoded frame if metadata discovery needs a read. Do not invent track start zero or lose the first frame.
- Use actual signed 100-nanosecond sample timestamps: `timestamp_value` is native ticks, `timestamp_timescale` is `10_000_000`, and seconds agree with that ratio. Preserve initial video delay on the playback timeline. Never infer PTS from FPS. Verify container edit-list/start-offset behavior against controlled fixtures and WebView2 playback.
- Decode in presentation order, returning the first available frame at or after a requested timestamp. Handle EOF, null samples, stream ticks, changed media types and error flags. Revalidate dimensions/stride after type changes; return a structured decode error if a change cannot be represented safely.
- Honor signed row stride and padding using 2D buffers where available; validate any contiguous fallback. Convert BGR channel order, orientation and rotation into owned, tightly packed, top-down sRGB RGB8 or gray8 pixels. Use the existing gray weights `(77*r + 150*g + 29*b + 128) >> 8`.
- Preserve aspect ratio, never upscale, respect shared 1–4096 resize bounds. Use bounded bilinear resizing of selected frames in a focused helper; no full-clip buffering. Validate color/order/orientation before accepting approximate cross-platform pixel equality. Color-managed/HDR fidelity beyond the current sRGB analysis contract is not promised.
- Poll cancellation before/after native reads, including skipped frames. Shared `sample_frames_async` runs blocking work away from the UI and existing library mutex. Cancellation remains cooperative; a native call already in flight may finish first.
- Preserve existing `ErrorKind` variants. Native failures include operation and HRESULT context; missing codecs/media components produce an actionable decode error. Consumer failure, cancellation and worker failure retain their existing terminal progress behavior. No silent external decoder downloads.

## Persistence and paths

Extract the existing file-save mechanism into `src-tauri/src/persistence.rs` with `pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String>`. Keep backup recovery, schema guards and serialization behavior; adjust Windows commit ordering only as described below.

Retain the macOS flush/rename/directory-sync path. For Windows, create a unique same-directory temporary file with exclusive creation, write/flush/sync it, close it and atomically replace the destination using the platform-supported rename operation. Do not delete the destination first. Do not perform an unsupported directory `File::open` after replacement. A pre-replacement failure preserves the old destination and returns an error; cleanup of an unused temp file must not obscure the original error. Windows success means flushed file content and successful replacement; do not claim Unix directory-fsync/power-loss guarantees. Test replacement behavior on real Windows NTFS.

The whole library commit rotates backup before primary and currently creates a first-save backup afterward. On Windows, prepare the required backup before replacing the primary, making primary replacement the last fallible write before advancing in-memory state. Test failures at backup preparation and primary replacement; a backup-only interrupted first save remains recoverable. Preserve the existing macOS ordering and behavior. Preserve the valid backup and refuse future schemas. Multi-process simultaneous editing is not currently guaranteed; this work must not present it as supported.

Continue resolving app data through Tauri. Verify `%APPDATA%\com.dalal35.apextelemetry\` against the actual API result instead of hardcoding it. Recordings/videos remain referenced in place; cross-OS copied workspaces may need Locate because absolute paths differ. Do not rewrite serialized paths by replacing separators. Support Unicode/spaces, drive paths and accessible UNC paths; retain extended canonical paths through file authorization and asset URLs.

## Shared UI and windows

Preserve the current working-tree explorer, merge and video layout. Correct Mac-only copy to neutral desktop wording and show Ctrl+O on Windows while retaining Command+O on macOS. Reuse the same shortcut handler and components. Keep native decorations and existing drag-region boundaries. Validate header dragging against actual capabilities; add only `core:window:allow-start-dragging` if required, without granting unrelated window operations. Rust-only plugin initialization does not justify adding frontend permissions.

Workspace preferences and video panel height already persist; OS window geometry does not. Add Windows-only initialization of the maintained Tauri window-state plugin for size/position/maximized state, leaving macOS launch behavior unchanged. Restore to a visible usable rectangle after display changes. This small backend-specific addition satisfies the Windows state-preservation requirement without a frontend fork.

Test 100%, 125%, 150% and 200% scaling, mixed-monitor movement and small logical windows. Ensure canvas/uPlot resize on DPR-only changes as well as size changes; make only demonstrated targeted repairs. Verify panel hit targets, chart cursors and state during resize. Browser DPR emulation is useful but does not establish native scaling acceptance.

YouTube uses the official adapter and actual packaged origin. Do not spoof identity, relax CSP or claim the macOS error 153 is fixed by Windows. Downloading and automatic visual synchronization remain unimplemented, explicitly documented features rather than Windows omissions.

## Installer

Add a Windows config override `src-tauri/tauri.windows.conf.json`: NSIS only, `installMode: "currentUser"`, preserved identity/version and WebView2 `downloadBootstrapper` with silent installation. This keeps installer size small; first installation requires internet only when the runtime is missing. Local telemetry/video can work offline after prerequisites are installed. Media Foundation availability and OS codec coverage remain runtime constraints, including Windows editions without media components.

Generate `icons/icon.ico` with multiple resolutions from existing artwork, preserving PNG/ICNS. Reference it through `bundle.icon` in the Windows override so both executable and installer use the icon. Retain Start Menu integration and optional desktop shortcut using NSIS defaults/options; inspect generated behavior before claiming it. Normal app installation/use must not require administrator rights. Do not add uninstall hooks that remove application data. Test same-version reinstall/repair and upgrade behavior in a disposable environment, including future-version fixture packages when necessary without changing repository version.

Add `npm run build:windows` using `tauri build --target x86_64-pc-windows-msvc --bundles nsis -- --locked`. Build on Windows, never with the macOS Tauri bundler. Expected output directory is `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`; discover the actual `*-setup.exe` filename. No Windows signing is configured; document unsigned publisher/SmartScreen prompts without claiming a certificate or guaranteed bypass on managed machines.

## Release pipeline

Extend `.github/workflows/release.yml`, keeping the existing `v*` push trigger, beta/pre-release status and Apple Silicon build behavior. Add `workflow_dispatch` for build/test/artifact validation only; guard all release operations with the tag-push event. This gives an authorized remote ref a Windows validation path without publishing a new version.

Use separate macOS and `windows-latest` jobs with stable target toolchains, `npm ci`, Cargo `--locked`, per-OS Rust cache, shared/frontend tests, selected fixture-independent native tests and native installers. Factor version checks into a portable Node script; validate tag equality only for tag pushes. Fail on missing/wrong architecture artifacts. Retain both job logs and upload installers with failure-on-missing-file checks.

A final publish job depends on both successful builds, downloads exact artifacts from that run, verifies the complete set and hashes, creates a draft, uploads everything, and only then publishes the beta release. Existing public releases for the tag must cause a safe failure rather than overwrite. Failed builds publish nothing; failed upload leaves a draft, not a partial public release. Set workflow/build permissions to `contents: read` and grant `contents: write` only to the publisher. No certificates, secrets or private fixture uploads are added.

Native CI coverage must include a nonzero Windows decoder test count and fixture-independent persistence tests. Private XRK suites remain explicitly separate unless authorized fixture provisioning exists. A successful release job cannot be advertised as full GUI acceptance.

## Validation and acceptance

Stages: persistence/platform foundation, native Windows decoding, desktop/installer integration, CI staging/publication, full regression and independent acceptance. Run meaningful checks after each stage. The detailed [plan](../plans/2026-10-15-windows-support.md) owns exact commands and acceptance records.

Acceptance requires Windows native compile, actual NSIS generation/inspection, private-XRK parity on Windows, persistence/recovery, real media timing/frame tests, installed Windows 10/11 GUI checks, macOS full native regression and app/DMG build, and an independent read-only review. Record each as pass/fail/unverified with OS, command, revision and artifact hashes. A failed or unavailable required check blocks a claim of complete support; report partial delivery honestly.

This Mac cannot establish Windows results. Remote execution requires an authorized pushed ref or an accessible Windows checkout; current authorization does not permit pushing/tagging. Complete local implementation and review before asking for that additional action. No installer location in this proposal is an existing artifact.

## References

- [Microsoft Source Reader](https://learn.microsoft.com/en-us/windows/win32/medfound/processing-media-data-with-the-source-reader).
- [Official Rust IMFSourceReader bindings](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/Media/MediaFoundation/struct.IMFSourceReader.html).
- [Microsoft Lock2D stride contract](https://learn.microsoft.com/en-us/windows/win32/api/mfobjects/nf-mfobjects-imf2dbuffer-lock2d).
- [Microsoft directory handles](https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-a-handle-to-a-directory).
- [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/) and [GitHub pipelines](https://v2.tauri.app/distribute/pipelines/github/), checked through current documentation during the audit.
- Existing `docs/video-auto-sync/architecture.md` and `validation.md` define the shared frame contract and its historical validation limits.
