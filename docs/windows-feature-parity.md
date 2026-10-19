# Windows feature parity — macOS 0.1.3 reference

## Scope and evidence

The reference is the released `v0.1.3` application. Production React/Rust source,
dependencies, capabilities, persistence identifiers and platform adapters were
compared with the tag. No missing Windows feature implementation was identified;
this validation adds tests and CI tooling without changing application behavior.
Step 1's [native build and packaging evidence](windows-validation.md) is retained.

[Targeted Windows runtime run 39296405451](https://github.com/dalal35/Ten-Tenths-Telemetry/actions/runs/39296405451)
passed on revision `1773937`, using the optimized executable without NSIS packaging.
It verified the complete runtime sequence below, including playback, seek, manual
sync and a full process restart. The earlier failures were harness issues: an
assertion read media metadata before decoding was ready, and an exact label
selector omitted the playback dropdown's option text. Production application
source and security settings did not need changes.

The new XRKs are deterministic invented telemetry generated from the pinned
libxrk parser's existing synthetic framing patterns. They contain a stadium GPS
track, laps, RPM and accelerometers, with distinct RPM values in two sessions.
No bytes or metadata come from private recordings. These exercise real XRK
parsing, library operations and numerical analysis; they do not represent every
logger, calibration, acquisition mode or recording size.

## Feature coverage

| Implemented feature | Windows implementation and automated evidence |
|---|---|
| XRK import, channels and laps | Shared pinned parser; synthetic valid XRKs exercise import through `Library` and release-app native IPC, including long Unicode paths. |
| Session explorer | Shared React organization, keyboard navigation, sorting/grouping, contextual actions and three persisted modes; existing 100-session browser suite plus release-app session list. |
| Merge/unmerge and provenance | Shared Rust virtual-session implementation; synthetic native tests cover distinct source RPM, qualified laps/channels, reopen, missing source/Locate, unmerge and original workspace retention; existing browser workflow covers merge UI. |
| Persistence and recovery | Same bundle ID and library schemas; synthetic tests retain opaque math/video workspace values, corrupt the disposable primary and recover its backup, and verify source bytes remain unchanged. Existing persistence tests cover future-schema refusal and repeated replacements. |
| Telemetry plots and MPH | Shared uPlot/display conversion; synthetic native tests assert samples and numeric/unit MPH conversion; frontend tests retain display rules; release WebView2 renders plots and MPH labels. |
| GPS, comparisons and delta | Shared Rust spatial analysis; synthetic native tests assert geometry, alignment, lap comparison, delta and duration conservation; existing unit tests retain conservative missing/invalid GPS handling. |
| Corner edits/reset | Shared reference-meter overrides; synthetic tests edit boundaries, restart, restore and reset while retaining alignment/delta contracts. |
| G-G plots | Shared calibrated-axis analysis and canvas; synthetic native tests assert real accelerometer output and units; release WebView2 renders the actual G-G view. |
| Scatter, distributions, shifts and RPM recovery | Same shared implementation; existing Rust/frontend tests cover statistics, weighting, discrete samples, gaps, exclusions, event evidence and inspection. Existing canvas/sidebar browser checks cover interaction and rendering. Private-XRK Advanced acceptance remains local. |
| Custom math and presets | Shared expression validation/unit conversion and workspace state; synthetic native/native-IPC tests evaluate real formulas; existing Rust/frontend tests cover invalid expressions, units, dependency cycles, presets and persistence guards. |
| Media Foundation decoding | Existing Windows native tests retain actual PTS, VFR/CFR, B-pictures, rotation/color, resize, cancellation and file-handle assertions. macOS retains AVFoundation. |
| Local video and manual sync | Shared media adapter, timeline and segment model; release-app WebView2 test exercises authorized H.264 asset playback/rate/seek, manual anchoring and process restart. Existing browser tests cover cancel/replace/Locate, cuts, correction, gaps, ambiguity, races and source/session isolation. |
| Restart | Native library reopen/recovery plus full release-process close/relaunch with restored video source, manual mapping and playback-rate preference. |
| Layout and DPI | Existing browser suite covers 600×500–2560×1440 Telemetry/Advanced/Video layouts without remounting or losing state, plus DPR repaint; release WebView2 uses CDP viewport/DPR emulation. Native offscreen window placement has existing pure-helper tests. |
| Dialogs, drop and Windows paths | Seven bridge tests verify picker options/cancellation, import queue failures, drop/unsubscribe and unchanged drive/extended-UNC/Unicode path transport. Real native filesystem tests and release IPC use paths over 260 UTF-16 code units. Dialog and drop mocks do not establish OS interaction. |
| Theme, shortcuts and branding | Shared dark/light theme and Ctrl/Command handling; existing branding/workflow/sidebar tests, unchanged identifiers/installer upgrade keys, and release WebView2 Ctrl shortcut label. |

## Runtime boundaries

The release WebView2 harness launches the actual optimized executable at its
bundled `tauri.localhost` origin, attaches through WebView2's documented CDP
support, and uses existing native IPC. It installs no production test hooks and
does not mock IPC or media clocks. It is restricted to GitHub-hosted Windows,
refuses pre-existing roaming/local application profiles, generates disposable
fixtures, closes the app and cleans only its initially absent profiles.
See [Microsoft's WebView2 Playwright guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/playwright).

The hosted Windows Server 2025 runner launches elevated. WebView2 150 and newer
ignore debugging environment overrides for elevated hosts. The harness instead
passes Microsoft's documented `--edge-webview-switches` host argument to its
disposable application process. It changes no registry policy or production
security setting and does not enable production DevTools or change the executable.
See [WebView2 host argument documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environmentoptions#get_additionalbrowserarguments).
The CDP port is stable across the two launches because a reused WebView2 data
folder must retain compatible browser-process options.

Direct native IPC import/merge/math checks establish backend integration, not
mouse-driven native dialogs or every UI control. CDP viewport/DPR overrides
establish webview rendering under emulation, not physical monitor transitions
or native window resizing. The hosted runner is not a physical Windows 10/11
acceptance machine.

## Outstanding acceptance

- Physical Windows 10/11 standard-user launch, real file dialogs/drop, native
  window resize/restore, disconnected monitors and mixed-monitor DPI.
- Accessible UNC/network shares, permissions and unavailable/moved external
  devices; path transport tests do not establish a real SMB connection.
- Private XRK numerical parity across logger/calibration variants, large-file
  memory/performance and long-clip cancellation latency. Private fixtures stay
  ignored/local and unchanged.
- Codec/container diversity, MOV variants, HDR/color management, missing
  WebView2 installation, Windows N/Media Feature Pack and offline bootstrap.
- Previous-version upgrades and real-profile uninstall retention; hosted
  installer lifecycle uses disposable profiles and same-version updates.
- Windows signing remains absent. Video workspace paths retain the existing
  2048-character bound and whole-workspace size limits; long-path coverage does
  not claim support for every possible 32K Windows path.
- Packaged YouTube availability remains unverified; macOS's documented error
  153 remains. Downloading and automatic visual synchronization were never
  implemented in the reference and are not claimed as Windows features.

The Windows beta distribution is documented in the
[release notes](release-notes-0.1.3-windows-beta.1.md), including full validation
run 39297826514 and its exact build revision. The Windows beta release label is
`v0.1.3-windows-beta.1`; the application and installer retain version `0.1.3`.
The published macOS v0.1.3 release and existing release tags are preserved.

Use the separate [Windows-only development workflow](windows-development.md)
for targeted checks and final hosted Windows validation.
