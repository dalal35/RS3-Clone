# Apex Telemetry Windows Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the user's parent-led method with at most two independent workers; no nested delegation.

**Goal:** Package the existing Apex Telemetry app for Windows 10/11 x64 with native frame processing and protected macOS behavior.

**Architecture:** Keep React, IPC, telemetry, analysis, merge and synchronization logic shared. Add a Windows implementation of the current decoder, a narrow persistence helper, a Windows bundle override and a publication gate requiring both native builds.

**Tech Stack:** Existing Tauri 2 / Rust / React / TypeScript / Vite; Windows-only `windows` bindings and window-state plugin; Media Foundation; NSIS; GitHub Actions.

**Spec:** [2026-10-15-windows-support-design.md](../specs/2026-10-15-windows-support-design.md). Read it together with [the audit](../../windows-compatibility-audit.md) before execution.

**Status:** Approved. Tasks 1–4 are implemented in source with local checks; Task 5 local regression, packaging, documentation and independent source review are complete; its Windows acceptance gates remain blocked. Windows runtime/installer and GUI validation remain pending. The [validation record](../../windows-validation.md) and `.superpowers/sdd/2026-10-15-windows-support/progress.md` distinguish source completion from acceptance; unchecked execution steps below are not implied passes.

## Global Constraints

- App name: **Apex Telemetry**; version: **0.1.0**; identifier: **com.dalal35.apextelemetry**.
- Windows target: **x86_64-pc-windows-msvc**; macOS target: **aarch64-apple-darwin**, macOS minimum **13.0**.
- No product-code changes before approval of this design and its implementation plan. No commits, pushes, tags or publication without explicit authorization.
- At most two independent workers; parent owns architecture, integration and acceptance.
- Users need no Node.js, Rust, Python, compiler or separately installed FFmpeg.
- Retain parser revision, IPC contracts, library versions 1/2, workspace namespaces, original files and user preferences.
- No broad reorganization, duplicate frontend, new downloader or automatic-sync feature.

## Review Focus

1. Repeated saves and failed replacement must not report an unchanged library while having committed a new Windows primary; tested in Task 1.
2. A canonical Unicode/UNC/extended Windows path must survive authorization, serialization and actual video loading; tested in Tasks 1 and 3.
3. VFR, B-frames and initial video delay must return actual PTS consistent with the player's clock; tested in Tasks 2 and 5.
4. Padded/negative stride, asymmetric rotated images and changing media types must not corrupt owned frames or allocate without bounds; tested in Task 2.
5. A failed platform build/upload must never expose a public release missing that platform; tested in Task 4.

## Ownership and execution

Parent owns preservation, decisions, integration, final commands and acceptance. After approval, the native worker can own Task 1 then Task 2; a second worker can independently own Task 3. Parent owns Task 4 after packaging interfaces stabilize. Task 5 uses a read-only reviewer after all implementation stops. Workers may not commit, push, publish, touch private data, overwrite each other's files or create further workers. Complete the authorized mission in manageable stages with reported evidence.

Record the current diff and file hashes before starting. Use an isolated checkout only if it can preserve the full dirty baseline; do not reset/stash/drop changes to obtain a clean tree. The user already selected the execution method; approval is for these documents, not another method-selection checkpoint.

Author regression tests before fixes. Pre-fix Windows execution requires an authorized Windows environment; if unavailable, retain the pre-fix baseline/test patch for later execution there and explicitly record missing RED execution. Local implementation can proceed after document approval, but Windows validation and completion remain gated. Never substitute a macOS run, missing-symbol failure or zero-test suite for a Windows reproduction.

## File map

| Files | Responsibility |
|---|---|
| `src-tauri/src/persistence.rs` (new), `library.rs`, `lib.rs` | Atomic replacement and existing library wiring |
| `src-tauri/tests/persistence.rs` (new), existing `library.rs` integration tests | Private-fixture-independent writes/recovery plus existing real-XRK persistence |
| `src-tauri/src/video_analysis/windows.rs` (new), `windows_pixels.rs` (new if split), `mod.rs` | Media Foundation runtime/reader and owned-frame conversion; shared dispatcher |
| `src-tauri/Cargo.toml`, `Cargo.lock` | Target-specific bindings/plugin, minimum necessary features and locked resolution |
| `src-tauri/tests/video_analysis.rs`, `tests/support/video_fixtures.rs` (new), `tests/fixtures/windows_generate.rs` (new) | Existing native contract, per-OS generated media and Windows fixture generator |
| `src-tauri/tauri.windows.conf.json` (new), `icons/icon.ico` (new), `tauri.conf.json`, `capabilities/default.json`, `package.json` | NSIS, runtime policy, Windows icon, narrow drag permission if required, and build command |
| `src/bridge.ts`, `App.tsx`, `SessionSidebar.tsx`, `video/VideoWorkspace.tsx`, `AnalysisCanvas.tsx`, styles only as needed | Neutral copy, shortcut hint and demonstrated native/DPI fixes |
| `scripts/browser.mjs` (new), browser verification scripts | Portable shared browser launch helper |
| `.github/workflows/release.yml`, `scripts/verify-release-version.mjs`, `scripts/verify-release-artifacts.mjs` (new) | Native build validation, staging and complete-set publication |
| `README.md`, `docs/windows-validation.md` (new), video-analysis docs | Install/build instructions, current evidence and limitations |

## Task 1: Safe Windows persistence and path foundation

**Interfaces:** Add crate-private `persistence::atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String>`. Library callers, return shapes and JSON remain unchanged. Private failure injection must not become a production IPC/API.

- [ ] Add synthetic tests for repeated overwrite/reopen under a path containing spaces and Unicode, failed replacement preserving the existing bytes, interrupted temp files, primary/backup recovery and future-schema refusal. Use synthetic manifest JSON with no private XRK dependency. Exercise `Library::open` and snapshot/recovery without importing recordings where possible; keep helper unit tests internal to `persistence.rs`.
- [ ] When an authorized Windows environment is available, run those tests against the pre-fix baseline: `cargo test --locked --manifest-path src-tauri/Cargo.toml --test persistence`. Demonstrate the existing save failure in a test that reaches the old directory-sync behavior; do not count a missing-symbol compilation failure as reproducing the defect. Otherwise record RED as unexecuted and retain the baseline/test patch.
- [ ] Extract the existing atomic write into the focused helper. Preserve macOS ordering/flush behavior. On Windows use an exclusive unique same-directory temp, file sync/close, and replacement without deleting the destination; remove the unsupported directory open. Preserve original error and clean unused temps.
- [ ] Adjust Windows library commit ordering so backup preparation precedes primary replacement and no fallible file write follows the committed primary. Inject primary-replacement failure after successful backup rotation; assert the in-memory snapshot and primary both retain the old state, then retry successfully and reopen with the new state. Test recovery from a first-save backup-only interruption. Retain existing macOS path.
- [ ] Add Windows drive/UNC/extended path round-trip and case-insensitive MP4/MOV extension tests. Use accessible local Unicode paths for required native tests; clearly mark unavailable network-share cases as unverified rather than passed.
- [ ] Run Windows `--lib --test persistence --test video`; run macOS full Rust suite with existing private fixtures. Expected: new tests execute and pass, existing schema/backup/source protection remains intact.
- [ ] Review the stage diff and record the Windows durability guarantee and multi-process limitation in validation notes. Do not commit.

## Task 2: Native Windows decoder and real media contract

**Interfaces:** Implement the three private `Decoder` methods specified in the design. Keep `inspect`, `extract_frame`, `sample_frames`, `sample_frames_async`, `SamplingOptions`, error kinds and progress structs unchanged. Internal pure pixel helper consumes a validated source buffer/layout and returns owned packed pixels; it must not expose borrowed COM memory.

- [ ] Add Windows-only Cargo dependency features for COM, Media Foundation and the minimal required support APIs. Resolve current bindings against the existing Rust toolchain, inspect the Cargo diff and lockfile; preserve libxrk revision and Apple dependencies/build path.
- [ ] Refactor only fixture selection in `tests/video_analysis.rs` into `tests/support/video_fixtures.rs`. Retain the existing Objective-C macOS generator and expectations. Windows gets an MF Sink Writer test-only generator with controlled PTS/durations, color/asymmetric patterns, audio-only and corrupt variants; it is not an app dependency. For rotation/start-offset behavior the generator cannot express, add tiny generated redistributable fixtures with recorded recipe, timing expectations and provenance.
- [ ] Enable native contract tests on both supported OSes and add `native_windows_decoder_contract_runs`. Assert nonzero test execution. When an authorized Windows environment is available, run against the pre-implementation backend and observe `UnsupportedPlatform` on real media rather than a missing fixture or vacuous pass. Otherwise preserve that baseline/test patch and record RED as unexecuted.
- [ ] Implement COM/MF RAII, local UTF-16 Source Reader open, stream selection, RGB32 output, metadata validation and retained first sample. Map native failures into current structured errors with operation/HRESULT context. Keep all native objects on the blocking worker.
- [ ] Implement sequential PTS selection, stream ticks/null samples/EOF handling and media-type-change validation. Verify CFR and VFR, nonzero initial delay, strict first-at-or-after selection, end-exclusion and shared decimal-grid sampling. Add H.264 MP4 B-frame coverage; verify nominal FPS does not determine timestamps.
- [ ] Add pure layout tests for padded rows, negative stride, BGR channel order, 90/180/270-degree asymmetric rotation, gray weights, aspect-preserving bilinear resize, bad dimensions/stride, checked allocation and truncated buffers. Implement conversion to top-down tightly packed owned pixels; run helper tests before native tests.
- [ ] Test cancellation before open, between delivered frames and during long skipped-frame scanning; consumer failure emits terminal Failed; cancellation emits terminal Cancelled. Test async rational PTS and repeated open/close followed by file rename/delete to detect unreleased handles. Reject audio-only, corrupt and unsupported-codec inputs without panic.
- [ ] Run Windows `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib --test video --test video_analysis --test persistence`, `cargo check --locked --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml`, and targeted rustfmt. Run the unchanged macOS native-video suite and full regression. Expected: tests actually decode media on each OS and pass.
- [ ] Measure a representative long clip's processing time, peak memory and cancellation observation latency. Record measurements; do not promise immediate interruption or complete codec parity. Return evidence to the parent before changing the selected backend if the contract cannot be achieved.

## Task 3: Desktop integration and Windows installer

**Interfaces:** Existing frontend IPC and video adapters unchanged. `build:windows` runs the design's explicit target/NSIS command. Windows config preserves identity/version; no Apple bundle changes. Coordinate Cargo/lib.rs edits with the native owner before writing shared files.

- [ ] Add a shared `scripts/browser.mjs` launcher: optional existing macOS Chrome path, otherwise Playwright-managed Chromium; update all hardcoded browser verifiers to use it. Install Playwright Chromium for CI. Run workflow, canvas and video checks; run plots/advanced where private fixtures exist. A native player test is still separate.
- [ ] Add tests for neutral platform copy/shortcut labels, Windows source paths and existing source-isolated video mappings. Preserve Command/Ctrl handling. Make the small shared copy/hint changes and retain current explorer/layout work.
- [ ] Add Windows-only window-state plugin initialization for position/size/maximized state. Test restore after restart and disconnected display; clamp invalid/offscreen restore to usable bounds. Preserve macOS behavior. Review `capabilities/default.json` and test actual header dragging; grant only `core:window:allow-start-dragging` if necessary. Do not add window-state frontend permissions for Rust-only initialization. Make targeted canvas/uPlot DPR repairs only if scaling checks reproduce a defect.
- [ ] Create the Windows config override with `currentUser` NSIS and `downloadBootstrapper` WebView2 policy. Generate a multi-resolution ICO from existing artwork using Tauri's icon tooling in a temporary output directory, copying only the needed ICO and referencing it in Windows `bundle.icon`. Preserve all Apple icons/config. Add `build:windows` to the already modified package scripts.
- [ ] On Windows run `npm ci`, `npm test`, `npm run build`, and `npm run build:windows`. Inspect the actual setup EXE in `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`: x64 binary, icon/version/product identity, notices/resources, no console, correct runtime bootstrap settings. Record filename, size and SHA-256. Never invoke the macOS bundler to claim a Windows installer.
- [ ] In disposable standard-user Windows 10/11 environments test install, first launch, Start Menu, optional desktop shortcut, reinstall/upgrade, and uninstall retaining app data. Test runtime-already-present and runtime-missing cases; record the internet requirement rather than claiming offline bootstrap.
- [ ] Run packaged native GUI checks: file dialog cancel/select, XRK drop, Locate, local MP4/MOV asset playback/seek/rate, saved video offsets, source switches, and actual YouTube origin/error. Test large-file seeking and Unicode/canonical Windows paths. Do not weaken asset scope/CSP to pass.
- [ ] Test 100/125/150/200% scaling and monitor transitions: charts/maps/canvas hit tests, sidebar collapse, panel/video resize, window drag/restore and retained workspace state. Browser emulation supplements the actual desktop results.

## Task 4: Cross-platform release staging and publication gate

**Interfaces:** Version script reads existing package/Tauri/Cargo versions, requiring equality and matching `v<version>` for tag pushes. Artifact verifier takes staged directories and requires the Apple Silicon DMG/app artifact plus x64 NSIS installer from the same run; emits hashes. Validation dispatch must never create a release.

- [ ] Add portable Node version/artifact validation scripts and focused tests: version mismatch, tag mismatch, missing/empty installer, wrong target naming, and partial platform set all fail. Use the actual generated filenames from Task 3; inspect binary architecture in native jobs instead of relying on filename alone.
- [ ] Extend existing `release.yml` with separate Apple Silicon and `windows-latest` build jobs, stable Rust/MSVC target, Node 22, `npm ci`, Cargo `--locked`, target-aware Rust cache and portable validation steps. Preserve Apple ad-hoc signing and minimum version. Build jobs have only `contents: read`.
- [ ] Execute frontend and browser suites plus `--lib --test video --test video_analysis --test persistence` in both jobs. Assert Windows decoder tests execute. Run fixture-independent synthetic persistence tests, not private-data suites that are unavailable. Do not silently mark omitted private-XRK tests successful.
- [ ] Build/stage platform installers using Tauri without per-job release publication. Upload Actions artifacts with fail-on-missing-file. Keep independent platform failures visible; use `fail-fast: false` if using a matrix.
- [ ] Add `workflow_dispatch` as build-only validation and a tag-push-only publisher needing both build jobs. Publisher alone has `contents: write`; download the exact run's artifacts, validate all, create a draft, upload all, then publish prerelease. Safely reject an existing public release for the tag. Do not overwrite release artifacts automatically.
- [ ] Validate workflow syntax and simulate platform-build failure, missing artifacts and upload failure using mocked release operations in a temporary directory. Assert publication is not called before complete upload; errors retain only a draft. Do not create test public releases.
- [ ] If an authorized remote ref is available, dispatch validation and inspect both job results/artifacts. Otherwise finish local changes/review and present the exact proposed remote action for separate authorization. Do not push a ref or create a version tag to obtain test evidence without permission.

## Task 5: Full regression, documentation and independent acceptance

**Files:** README and `docs/windows-validation.md`; update video-analysis documentation's macOS-only statements to the actual implemented/verified status. This is the integration/acceptance task, not another feature implementation.

- [ ] On macOS run `npm test`, `npm run build`, browser suites `test:plots`, `test:sidebar`, `test:workflow`, `test:advanced`, `test:canvas`, `test:video`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml` with local XRKs. If sandbox native services/loopback access are denied, rerun the affected existing check in an authorized environment; record both outcomes without altering assertions.
- [ ] Build `npm run build:mac`; inspect the `.app` and `.dmg`, identity, bundled notices, native decoding and restart in a disposable library. Preserve the actual user library and source recordings. Record build hash/architecture; investigate any pre-existing formatting failures without unrelated cleanup.
- [ ] On Windows run full Rust integration suites with an authorized local copy of the existing private XRKs. Compare imports, laps, channels/samples, GPS, deltas, corners, formulas, advanced events, presets, merges and reopening against macOS. Use synthetic shared analytical contracts for exact/tolerance comparisons, not brittle absolute-path equality. Never upload private data by default.
- [ ] Complete the native/GUI/installer matrix from Tasks 2–3 on Windows 10 and 11. Record OS versions, scaling, codec/media samples, setup hash and actual pass/fail/unverified results. Required gaps prevent a full-completion claim even when CI builds pass.
- [ ] Update README with Windows x64 download/install, SmartScreen/unsigned status, first-install WebView2 internet policy, media/codec limitations, Visual Studio C++ Build Tools/Windows SDK/Rust MSVC/Node source prerequisites, build commands/output paths, app-data behavior, and the cross-platform release process. Clearly label YouTube status, absent downloads/automatic sync and any untested GUI paths.
- [ ] Stop implementation workers and confirm they are idle before assigning a separate read-only acceptance review of the integrated diff, original request, tests and artifacts. Reviewer returns `ship`, `fix-first` or `rethink` with evidence and residual risks. Parent resolves blocking findings using affected checks and targeted re-review; no repeated full suites without a reason.
- [ ] Verify only intended files changed and no private recordings/user libraries/unrelated work was lost. Deliver support summary, architecture, actual installer artifact location/download link if it exists, workflow changes, separate macOS/Windows results, limitations and review verdict. If artifacts are unavailable, say so and provide expected paths only as expectations. No commit or push.

## Plan self-review

Coverage: compatibility audit precedes implementation; native video requirements map to Task 2; persistence to Task 1; shared UI/scaling/dialogs/window state/installer to Task 3; release and partial-publication protection to Task 4; full feature parity, macOS packaging, docs and independent review to Task 5. Review Focus cases are assigned tests above. Existing working but uncommitted explorer changes remain part of the baseline. No Windows or full GUI pass is inferred from frontend tests, an empty native suite, historical notes or a hosted build alone.

The initial approval authorizes local implementation according to these documents. It does not authorize committing, pushing, tagging, publishing, uploading private recordings or changing the selected backend without evidence and a material-decision review.
