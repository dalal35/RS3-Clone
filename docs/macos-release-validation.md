# macOS 0.1.1 release validation — October 18, 2026

## Consolidation and provenance

Inspected local/remote branches, tags, stashes, worktrees, reflogs and unreachable objects before integration. `main` was an ancestor of the sole feature branch `fix/dedicated-advanced-workspace`; all 49 reachable historical commits and all reflog commit IDs were represented by that branch. There were no stashes, other worktrees or unreachable feature commits. The existing uncommitted session explorer/responsive work is included, along with every implemented feature on the feature branch. No history is rewritten.

The release uses 0.1.1, the next unused version after v0.1.0. Package/lockfile, Cargo/lockfile and Tauri versions agree. The original bundle ID, executable name, persistence keys and Windows code are retained.

## Validation

- Frontend: 257 tests across 15 files passed; TypeScript and production Vite build passed.
- Release policy: 27 tests passed, including macOS-only exact asset sets, publication failure handling and stable release publication.
- Full Rust suite: 123 tests passed, plus doc tests, including real private XRK import/analysis, advanced formulas/presets, GPS/lap/corner comparisons, persistence, safe refresh/relocation, merge/reopen/unmerge and 7 native AVFoundation media tests. Sandbox media fixture generation failed initially; unchanged tests passed with OS media access.
- Browser suites: branding/theme, sidebar/responsive navigation, workflow/persistence/merge, canvas, source video, actual-App video integration, real-XRK plots and real-output-backed Advanced workflows. Browser IPC/media clocks are simulated; native playback was verified separately below.
- Production Apple Silicon app and DMG built with the locked dependency graph. arm64 Mach-O, product/version/bundle metadata, TTT icons, bundled third-party notices and strict deep code-signature checks passed. `hdiutil verify` validated the DMG checksum.
- Packaged native GUI: reopened the existing two-entry user library; restored fastest lap, selected channels and workspace; rendered GPS/corners and telemetry; loaded G-G analysis with 1,361 real samples and Advanced controls. Local H.264 fixture attached through the native file dialog, paused metadata loaded, a manual lap-8 anchor was created, and playback advanced video time, telemetry time, graph readouts and GPS position. Existing YouTube mappings correctly displayed the documented native error 153.
- Existing library and backup were copied into ignored local storage before the temporary native test and restored byte-for-byte after quitting. Original recordings and videos were not modified or uploaded.
- Independent read-only acceptance reviewed feature/history completeness, data preservation, sidebar integration, release gates, artifact provenance and privacy; no outstanding critical findings. Acceptance caught and corrected a session-menu focus/queued-scroll dismissal at offscreen rows; mount-time ancestor scroll snapshots distinguish delayed prior scroll events from new scrolling, and popup focus avoids scrolling; the browser regression now exercises both Refresh and Locate menus. The test harness also uses literal Vite dependency entries to avoid scanning native build output.

## Privacy and release scope

A full tracked-history audit examined 463 historical blobs for credential signatures and sensitive file paths: no credentials, raw XRK/XRZ recordings, personal video or private datasets were found. Tracked video fixtures are documented synthetic media. History contains normal author identity/email and named fixture/track assertions; these are not claimed anonymous. Repository publication was explicitly authorized after reporting that distinction. Ignored data, tooling, user-library backups and test output remain local.

This release is macOS only. Windows source, native tests, NSIS configuration and opt-in cross-platform automation are preserved; no Windows compilation or packaging was performed for this task.

## Remaining limitations

Ad-hoc signed, without Apple Developer ID notarization; Gatekeeper may require an explicit user override. Native GUI testing was on this Apple Silicon Mac, not a separate clean machine or every supported macOS version. Local codecs remain system dependent. YouTube native playback error 153 persists. Video downloading and automatic visual synchronization have never been implemented; frame decoding is infrastructure only. No automatic updater. Numerical uncertainty and missing-data limitations remain visible in the UI. The upstream `binrw 0.14.2` future-compatibility warning remains.
