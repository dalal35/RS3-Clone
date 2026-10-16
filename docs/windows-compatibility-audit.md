# Windows compatibility audit

Date: 2026-10-15. Repository baseline: `fc25121` plus the existing working-tree changes. This is a source audit and baseline validation, not a claim of Windows support. No Windows binary or installer has been built.

This matrix records the **pre-implementation** state. The design was subsequently approved and implemented in source. See [current validation](windows-validation.md) for post-implementation evidence and the remaining Windows acceptance gates.

## Scope and preservation

Reviewed the tracked application, native modules, dependencies, build/configuration files, release workflow, tests, verification scripts, notices and development documentation, including current uncommitted session-explorer work. Ignored toolchains, compiled output and media were not treated as source. Private XRKs were exercised by the existing integration tests, not changed or uploaded. No repository `AGENTS.md` was found.

Existing modified files: `README.md`, `package.json`, `scripts/verify-video-integration.mjs`, `scripts/verify-workflow.mjs`, `src-tauri/tauri.conf.json`, `src/App.tsx`, `src/main.tsx`, `src/merging.ts`, `src/video/VideoWorkspace.tsx`, `tests/advanced.tsx`, `tests/video-integration.tsx`. Existing untracked work: the session-explorer plan, sidebar verifier, `SessionSidebar.tsx`, `explorer.css`, and session-explorer implementation/tests. Preserve all of it; any isolation strategy must carry this working baseline, not just HEAD.

## Compatibility matrix

“Shared” means no identified platform-specific implementation dependency; it does not mean tested on Windows.

| Component | Actual implemented state / source evidence | Classification | Windows work / evidence required |
|---|---|---|---|
| XRK decoding | `src-tauri/src/telemetry/mod.rs`, pinned `libxrk` revision in `Cargo.toml`, native panic containment | Shared, unverified | MSVC compile and real-XRK parity; retain exact revision and sample/unit/calibration behavior |
| Session/lap detection | Rust parser retains source laps, channels, acquisition metadata | Shared | Compare session/lap/sample/channel counts against existing fixtures |
| Speed/RPM and MPH | `Plots.tsx`, `telemetry.ts`, `speedDisplay.ts`; original calculation units retained | Shared | Native import-to-chart smoke; frontend units already covered |
| GPS, comparisons, deltas | `telemetry/spatial.rs`, `Track.tsx`, Rust analysis; conservative missing/invalid GPS guards | Shared | Real-XRK map, cursor, spatial alignment and fallback acceptance |
| Corners and sections | Automatic approximate sections plus editable boundaries; `Segments.tsx`, library overrides | Shared, persistence affected | Editing, reset, keyboard controls and reopen |
| Advanced analysis | Traction circle, scatter, histograms, shifts, RPM recovery candidates, formulas, presets, event inspection in `Advanced.tsx`, `AnalysisCanvas.tsx`, `telemetry/advanced.rs`, `expressions.rs` | Shared | Windows UI/performance and same numerical results; do not relabel candidates as confirmed mechanical diagnoses |
| Session explorer | `SessionSidebar.tsx`, `sessionExplorer.ts`, `explorer.css`; current uncommitted implementation | Shared | Preserve current panel/sidebar interactions and responsive overrides |
| Merging | `merging.rs`, `SessionMerge.tsx`, library virtual merges, source provenance and unmerge | Shared, persistence affected | Source-isolated calculations/video and merge/reopen/unmerge parity |
| Library/workspaces | `library.rs`; versions 1/2, SHA-256 references, backups, schema/version guards, recovery | Needs Windows save semantics | Unconditional directory open/sync is a blocker; repeated writes and recovery must pass on Windows |
| App-data location | `lib.rs::run` uses `app.path().app_data_dir()` | Shared | Verify standard-user Windows application-data directory; never use install directory |
| Paths | `PathBuf` backend; UI basename splits both separators; video state accepts drive/UNC paths | Shared, validation needed | Unicode/spaces, canonical extended-length paths, missing/moved sources, UNC where accessible |
| Native video bridge | `build.rs` guards Objective-C compiler and Apple framework links with target OS | Already conditional | Preserve guards; no Apple SDK/tools/frameworks in Windows build |
| Frame analysis | `video_analysis/mod.rs` shared contract, `macos.rs`/`decoder.m` native AVFoundation/Core Image | Windows implementation required | Non-macOS stub currently returns `UnsupportedPlatform` |
| Local video authorization | `video.rs` validates canonical regular MP4/MOV, readability and exact asset scope | Shared | Windows path-to-asset URL, CSP, ranged playback; keep scope restrictive |
| Local playback | HTML media adapter with seek, rate, readiness and clock fallback | Shared UI, OS codecs | Packaged WebView2 MP4/MOV playback is unverified; extension alone does not establish codec support |
| Manual video sync | Model/controller, segment editor/timeline, corrections and saved offsets/preferences | Shared | Native playback/telemetry seeking, source switching, segment boundaries and restart |
| YouTube playback | Official IFrame adapter; packaged macOS error 153 documented | Existing platform limitation | Windows native HTTP origin may differ from macOS non-HTTP origin guard; test actual packaged origin, retain security |
| YouTube downloads | No downloader, executable, dependency or IPC found | Not implemented | No download feature to port; do not introduce Python/FFmpeg to manufacture parity |
| Automatic visual sync | Local frame-analysis infrastructure only; no crossing detection, lap matcher or analysis UI/IPC | Roadmap, not implemented | Port frame infrastructure; do not claim automatic synchronization |
| Dialogs / file drop | Tauri dialog plugin, open permission, native webview file-drop API in `bridge.ts` | Shared | Multi-file import, cancellation, Unicode selection, drop and missing-file Locate |
| Window/title bar | OS decoration plus HTML drag region; configured min/default logical sizes | Shared, GUI validation | Drag/button hit targets, maximize/restore, resize, small displays |
| Window geometry persistence | No window-state plugin or geometry restore implementation found | Not implemented | Distinguish saved workspace/video panel settings from OS window position/size; proposed Windows addition in design |
| Scaling/chart rendering | DPR canvas backing store; uPlot/CSS sizing; responsive explorer overrides | Shared, incomplete evidence | 100/125/150/200%, DPR-only transitions, mixed monitors, cursor hit testing and retained state |
| Platform copy/shortcuts | Mac/macOS wording and Command glyph in `App.tsx`, `bridge.ts`, sidebar; Ctrl+O already handled | Small shared-UI corrections | Neutral wording and correct shortcut label, no frontend fork |
| Installer/icon | Only app/DMG targets; PNG/ICNS but no ICO | Windows packaging required | NSIS per-user x64, multi-resolution ICO, shortcuts, WebView2 strategy |
| Release console | `main.rs` has release `windows_subsystem = "windows"` | Already conditional | Inspect packaged executable; retain existing attribute |
| Release automation | `.github/workflows/release.yml`: tag-only, single Apple Silicon job publishes immediately | Windows + publication gate required | Both native builds must succeed before public release publication |
| Frontend/browser tests | Vitest; browser verifiers mostly hardcode macOS Chrome | Test tooling changes required | Portable browser launch and installed Playwright Chromium; browser tests remain distinct from native WebView2 |
| Native video tests | Entire `tests/video_analysis.rs` macOS gated; Objective-C MJPEG generator | Windows coverage required | Real Windows decoder fixtures/tests, not a successful zero-test run |
| Private integration fixtures | Real telemetry, library, advanced and merge suites require ignored `data/` | CI evidence gap | Run on a Windows machine with authorized local fixtures; do not upload private recordings implicitly |

## Highest-risk findings

1. **Persistence can report failure after writing on Windows.** `library.rs::atomic_write` flushes a temporary file, renames it, then uses `File::open(parent)?.sync_all()?`. Ordinary Windows directory opening requires special flags; this is a source-based expected failure, not yet a Windows reproduction. `commit()` updates its in-memory manifest only after these operations, so post-replacement failure needs explicit semantics. Preserve backup recovery and future-schema refusal. [Microsoft directory handles](https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-a-handle-to-a-directory).
2. **Windows decoding is absent.** Existing platform dispatch is a useful narrow seam; copying the sampling algorithms or replacing the Apple bridge would create unnecessary regression risk.
3. **Native coverage would silently disappear.** The current Windows test target would contain zero native frame tests. Existing file-inspection tests use arbitrary bytes and establish paths/metadata, not decoding.
4. **Immediate publication risks partial releases.** Two jobs independently publishing can expose a release with just one platform. Build/stage both first, then publish a draft only after complete artifact checks.
5. **GUI acceptance remains separate.** WebView2 codecs, dialogs, scaling, real installed paths, upgrades and uninstallation require a Windows desktop. Hosted runner compilation alone cannot establish them.

## Baseline checks in this audit

Host: Apple Silicon macOS. Used the repository-local stable Rust toolchain and cached dependencies.

| Check | Observed result |
|---|---|
| `npm test` | PASS: 14 files, 215 tests |
| `npm run build` | PASS: TypeScript and Vite production build |
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml` | 101 tests passed before native-video suite; 7 native-video tests failed during fixture generation with AVFoundation `-11800` / underlying `-12903`; exit 101 |
| macOS native-video retry outside sandbox | PASS: all 7 tests, unchanged source; supports sandbox/environment interference in the initial fixture-generation failure |
| macOS packaged app/DMG | Not rebuilt in this planning phase; must be rebuilt after implementation |
| Windows compile / native tests / installer / GUI | Not run; no Windows execution environment used in this phase |

The 101 passing Rust tests comprise 75 library unit tests, 1 advanced integration test, 8 library tests, 8 merging tests, 4 real-telemetry tests and 5 video path tests. The separate successful native-video retry brings the observed total to 108 passing tests across two invocations. The full command stopped at the initially failed suite, so it did not establish doc-test success. The retry used the same toolchain and `--locked --offline --manifest-path src-tauri/Cargo.toml --test video_analysis` outside the sandbox. The existing `binrw 0.14.2` future-compatibility warning remains. Older validation documents describe historical passing runs; they do not replace current evidence.

## Decision and next gate

Recommend native Media Foundation via narrowly enabled Windows Rust bindings, preserving the current shared decoder contract and Apple implementation. Alternatives and failure-handling details are in [the proposed design](superpowers/specs/2026-10-15-windows-support-design.md); executable stages are in [the proposed plan](superpowers/plans/2026-10-15-windows-support.md).

Both documents are proposals awaiting user approval. This phase adds documentation only; it does not implement support, create an installer, commit, push, tag or publish a release.

Two independent read-only workers reviewed the written proposals and approved the approach with clarifications now incorporated: Windows backup ordering, icon configuration, narrow drag permissions and honest handling of unavailable pre-fix Windows execution. This is proposal review, not acceptance of an implemented Windows application; the final independent acceptance review remains a planned delivery requirement.
