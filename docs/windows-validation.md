# Cross-platform implementation and validation

Historical local checks below were recorded 2026-10-16 against the **uncommitted working tree** based on `fc25121`,
including preserved pre-existing explorer/UI work. This is a local implementation
delivery, **not a verified Windows release**. At that checkpoint no commit, push, tag or publication
had occurred. The original private XRKs, videos and user library were not changed.

## Isolated commit candidate

The authorized commit preparation excludes unrelated pre-existing explorer, merge
and macOS window-configuration changes. The isolated Windows-only candidate passes
181 frontend tests across 13 files and its production frontend build; historical
257-test and local packaged-app evidence below includes the preserved explorer work
and must not be presented as validation of this narrower committed tree. Native CI
will validate the actual pushed revision and supersede these local artifact records.

## Implemented source

| Area | Implementation |
|---|---|
| Windows frame processing | `video_analysis/windows.rs`: Media Foundation Source Reader, thread-confined COM/MF RAII, Unicode paths, metadata, actual 10MHz PTS, retained first sample, sequential extraction, cooperative cancellation and buffer cleanup |
| Shared processing | Existing validation, sampling grid, bounded consumer callbacks, progress/status/errors and async worker retained; Apple bridge and Apple build/framework path unchanged |
| Pixels | Validated BGR/signed stride/padding, top-down owned RGB8/gray8, rotation and bounded bilinear downsampling; no new FFmpeg/OpenCV/runtime executable |
| Persistence | Same-directory exclusive Windows temp, sync/close/replace, cleanup only of owned files; backups prepared before primary so no fallible write follows a successful primary replacement; Mac ordering retained |
| Desktop | Shared neutral copy and shortcut hints, canvas DPR repaint without state reset; Windows-only window-state plugin and visible work-area clamp; narrow header-drag capability |
| Packaging | Windows override: NSIS `currentUser`, x64 target, silent WebView2 download bootstrapper, six-resolution ICO; app identity/version remain `com.dalal35.apextelemetry` / `0.1.0` |
| Release | Existing workflow extended with macOS/Windows native jobs, tests, staging and restricted permissions; publisher depends on both and verifies complete same-run assets before publishing a draft beta |

The source covers existing telemetry, analysis, session/merge, workspace and
manual video behavior through the shared implementation. Availability on Windows
is still subject to native acceptance; source reuse does not establish that pass.
YouTube downloading and automatic visual synchronization remain unimplemented.

## Observed macOS and shared results

Host: Apple Silicon macOS; repository-local stable Rust/rustdoc 1.99.0 with the
same explicit local PATH, `RUSTUP_HOME` and `CARGO_HOME`; Node 20.18.0.

| Check | Observed result |
|---|---|
| `npm test` | PASS, 15 files / 257 tests |
| `npm run build` | PASS, TypeScript and Vite production frontend |
| `npm run test:release` | PASS, 11 tests including partial/tampered/mixed-run artifacts, version/tag mismatch, existing release, failed/incomplete upload and tag-only/fail-fast shell policy |
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml` | PASS, 122 runtime tests; doc-test setup succeeds, 0 doc tests |
| Rust suite breakdown | 86 lib, 1 advanced, 8 library, 8 merge, 3 synthetic persistence, 4 real telemetry, 5 video paths, 7 AVFoundation video |
| `node scripts/verify-native-video-tests.mjs` | PASS, confirms 7 macOS native-video tests enabled |
| Canvas browser regression | PASS, real React/canvas interaction and 100/125/150/200% DPR changes; missing CDP resolution event supplied explicitly, not native monitor-event evidence |
| Workflow browser regression | PASS, session/merge/persistence simulation and actual Ctrl/Command shortcut boundary checks |
| Advanced browser suite | PASS, real-XRK-backed analysis/navigation/formulas/presets and async interactions |
| Video browser suites | PASS, both workspace and App integration, including fresh affected reruns after chart corrections |
| Sidebar and real-XRK plots | PASS after diagnosed chart correction; original strict assertions retained, with added invalid-restore and valid delta-domain/recreation checks |
| Targeted native rustfmt / `git diff --check` | PASS at native handoff; final integration whitespace check retained |
| `actionlint 1.7.12 -shellcheck= -pyflakes= .github/workflows/release.yml` | PASS, syntax/expression/static workflow validation, not an Actions execution |
| `npm run build:mac` | PASS, arm64 `.app` and `.dmg` |
| `stage-release-artifacts.mjs macos` | PASS, actual arm64 Mach-O, signature verification, bundled notices, DMG trailer and archive/hash staging |

Full Rust tests ran outside the sandbox because AVFoundation fixture generation
requires native services. The initial planning run failed fixture generation
inside the sandbox and passed the unchanged suite outside it. A later worker run
passed all 122 runtime tests but failed doc-test setup with missing-crate E0463;
the final isolated full command with explicit matching toolchain PATH passed
including setup. No assertions were weakened and doc tests were not disabled.
The existing `binrw 0.14.2` future-compatibility warning remains.

Browser checks simulate IPC and some media boundaries. They do not establish
Windows dialogs, WebView2 codecs, real playback synchronization or installed GUI
behavior. Interrupted/concurrent runs and timeout attempts are not counted as
passes; the final essential runs were sequential. Test servers now bound Vite
dependency scanning to app/test HTML instead of scanning native toolchain output.

## Actual macOS artifacts

- App: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Apex Telemetry.app`.
- DMG: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Apex Telemetry_0.1.0_aarch64.dmg`.
- DMG bytes: `3730854`; SHA-256: `a8b7a64246f50b9f225c5efcb462c8bcfd4a22d15d199d2b90e158399930018b`.
- Staged app archive: `.tools/windows-release/final-2026-10-16-accepted/macos/Apex Telemetry_0.1.0_aarch64.app.tar.gz`.
- App archive bytes: `3680878`; SHA-256: `f527bf14e6a9df36cb39d3f1b0cad7974387a04cef7796b512bcc0efa9eb1a5d`.

The stage manifest records base HEAD plus `runId: local`; it is **not** proof
that this uncommitted source has been pushed or built by GitHub Actions. The app
is ad-hoc signed, not notarized. A new installed-app GUI smoke on a separate Mac
is not claimed; user data was preserved rather than launching against that library.

## Windows evidence and blocking gaps

| Check | Status / limit |
|---|---|
| Actual Windows source/tests MSVC typecheck | PASS in a supplemental crate including decoder, generator, persistence, library, merging, telemetry and Windows unit-test source by path |
| Full Windows app cross-check on this Mac | BLOCKED before app source checking by Tauri resources: `tauri-winres` reports `NotAttempted("llvm-rc")`; no Windows SDK/resource compiler |
| Full app native MSVC compilation/link | NOT RUN on Windows |
| Sink Writer fixture generation / Source Reader decoding | NOT RUN on Windows; authored tests must pass natively |
| Actual x64 NSIS installer generation and extraction | NOT RUN; **no Windows installer artifact exists from this work** |
| NTFS repeated replacement/failure recovery | Tests authored/typechecked; NOT EXECUTED on Windows |
| Private-XRK import/analysis/merge/workspace parity | NOT RUN on Windows; existing private fixtures must be provisioned locally with authorization |
| Native dialogs, drop, extended paths/UNC, asset URLs/large-file seek | NOT VERIFIED on Windows; path serialization tests alone are insufficient |
| Local playback/offsets/rates/segments/restart and YouTube origin | NOT VERIFIED in packaged Windows WebView2 |
| Standard-user install/shortcuts/reinstall/upgrade/uninstall retention | NOT VERIFIED on Windows 10/11 |
| Window geometry, header dragging, 100–200% native/mixed-monitor scaling | Pure/helper/browser checks only; actual Windows GUI NOT VERIFIED |
| Long-clip throughput, peak memory and cancellation latency | NOT MEASURED on Windows |
| Actual GitHub Actions execution | NOT RUN for this unpushed implementation; static workflow checks pass |

The supplemental crate avoids Tauri's host resource compiler and copies shared
API type declarations; it typechecks actual implementation files but does not
link or execute the application. Reproduction wrapper and logs are retained under
`.superpowers/sdd/2026-10-15-windows-support/`; this is not a replacement codebase.

Windows native tests generate original H.264/AAC media with VFR/CFR PTS, nonzero
start, rotations and B-picture settings. Encoder setting acceptance does not
prove a bitstream contains B pictures. Inspect actual output and retain failing
timing/orientation assertions; if a system encoder cannot express a required
fixture, introduce a tiny inspected redistributable fixture with recipe/provenance.
Do not skip or weaken the tests to manufacture native validation.

## Remaining native acceptance procedure

Use a Windows x64 machine or an authorized Windows Actions checkout. Run:

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:release
cargo check --locked --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml
node scripts/verify-native-video-tests.mjs
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib --test persistence --test video --test video_analysis
npm run build:windows
node scripts/stage-release-artifacts.mjs windows "$env:TEMP/apex-release-validation"
```

The native decoder marker performs real frame decoding; the CI list guard rejects
an empty/compiled-out suite. Staging checks PE x64/GUI subsystem, product/version,
actual NSIS embedded executable and notices, then writes SHA-256 manifests. Native
artifact inspection uses 7-Zip (available on the hosted Windows image; install it
for that developer-only inspection command if absent). End users do not need it.
Expected installer directory only:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.

On Windows 10 and 11 desktops, additionally test all existing XRK fixtures and
numerical outputs, persistence and merging across restart, local MP4/MOV player
timing against decoded PTS, VFR/B-frame/start-delay/rotation/pixel layout, corrupt
and missing-codec errors, cancellation/cleanup, file selection/drop/Locate,
Unicode and accessible UNC paths, default/offscreen geometry and each display
scale. Test standard-user install with/without WebView2, icons/shortcuts, repair,
upgrades and uninstallation retaining data. Use disposable libraries, not normal
user data. Record OS versions, commands, counts, setup filename/hash and actual
manual results separately from hosted build success.

## Runtime limits and safety

- Windows N requires Media Feature Pack **before launch**; static Media Foundation
  DLL imports can fail process loading if the OS components themselves are absent.
  Loaded Media Foundation with unsupported codecs returns structured decode errors.
- System codec coverage, container edit lists, orientation and sRGB/color handling
  need native verification. HDR/color-managed fidelity beyond the existing analysis
  intent is not claimed. Windows first-sample track-start metadata differs from
  AVFoundation track-range metadata; frame PTS must still match playback time.
- Cancellation is cooperative; an in-flight native call can finish first. Frames
  are delivered with bounded backpressure, not retained as a whole clip.
- Windows save success means synced contents and successful replacement, not Unix
  directory-fsync or power-loss guarantees. Concurrent editing by separate app
  processes is not guaranteed.
- WebView2 download bootstrap requires internet when absent. No Windows signing
  certificate is configured. macOS remains ad-hoc signed/unnotarized.

## Review and remote authorization

Independent read-only review found one Windows setup COM teardown-order defect:
temporary attributes/media interfaces could outlive the moved runtime after an
initial-read failure. Setup now uses a lexical scope that releases those interfaces
before runtime ownership transfers to the decoder. Actual-source MSVC typechecking
passes, and the reviewer confirmed the finding addressed. Stale architecture
documentation was also corrected. No source-proven persistence-consistency or
partial-publication defect was established.

The reviewer accepts the corrected native source to proceed to Windows validation;
full shipping acceptance remains blocked by missing native evidence. The later shared chart correction and its delta-domain follow-up also passed
scoped independent review, with no unresolved source defect in the reviewed
deltas. Final verdict: **ship to native Windows validation**, not approval to
ship an unvalidated Windows release. Source review cannot grant missing native
runtime evidence.

The existing remote workflow does not contain this uncommitted implementation.
Running it now would test old code. Finishing the Windows gate requires explicit
authorization to commit/push a reviewed validation ref and make the build-only
workflow dispatchable, or access to a Windows checkout containing this diff.
No release tag or publication is needed for build-only validation, and neither
is authorized by the implementation request.
