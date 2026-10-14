# Milestone 6 — Video synchronization · 2026-10-13

**Local-video fallback implemented and verified. Full Milestone 6 acceptance remains unmet because packaged native YouTube playback fails with error 153.** The approved specification and eight-task plan were executed with parent-led Codex Orchestrator and at most two concurrent workers. No cut detection, computer vision or AI analysis was added.

## Implemented

- Optional Video workspace with locally referenced MP4/MOV and the official YouTube IFrame adapter. Pause at a start/finish crossing, choose the matching recorded lap, and select **Sync Here**. Native controls, playback rate, timeline, resize, segment editing, correction nudges and predicted lap crossings remain available.
- Independent, validated half-open segment mappings use absolute session timestamps. Cuts never imply continuous telemetry; gaps and unrecorded telemetry become unavailable. Repeated footage requires explicit segment selection. Explicit unavailable seeks pause without moving the footage.
- Asynchronous playback/seek completion, cancellation, bounded clock prediction and drift resets keep charts, GPS and interactions independent of video operations. Playback updates laps/readouts/GPS; explicit graph/GPS selections seek, while hover, comparison, axis, zoom and theme changes do not.
- Optional bounded/versioned workspace state restores paused, preserves advanced state and unknown future video schemas, and retains mappings when a file is missing or changed. Locate requires confirmation that mappings still apply; metadata does not establish byte identity. Rust authorizes only the validated exact local file using platform-neutral paths.

## Verification and native observations

- Stable product commit `fd66499`: working-tree `npm test` passed 161 tests in 10 files, including four tests belonging to the user's separate speed-display work. A clean `git archive fd66499` snapshot passed 157 tests in nine files, production build and both video browser checks without those uncommitted files.
- `test:video` (two scripts), `test:plots`, `test:workflow`, `test:advanced` and `test:canvas` passed. Offline Rust passed 84 tests: 66 unit, one advanced, eight library, four real-telemetry and five video integration tests. Existing upstream `binrw 0.14.2` future-compatibility warning remains. Final Tauri macOS build passed; release binary 11.88 MiB.
- Actual packaged macOS application (`tauri://localhost`) decoded synthetic 60-second, 30-fps H.264 MP4 and genuine MOV fixtures generated with AVFoundation outside the repository. Play/pause, 2× rate and seeks worked. A deliberately corrupt MP4 produced a clear codec error while telemetry remained usable. No original footage was copied or uploaded.
- Native one-action lap-8 anchor at session 206.53 s, independent segments `[0,30)` and `[30,60)`, cut transition, correction +0.1 s and independent predicted markers were observed. Paused lap-9 seek at 26.585 s remained stable after the late-frame callback regression was corrected. GPS and lower RPM graph clicks sought correctly; hover and comparison preserved video position. Both graph axes worked; unavailable coverage cleared synchronization instead of fabricating a time. Native GPS reports its own approximate timing resolution (~0.68 s for the observed pair).
- Final build `fd66499` rejected a mapping beyond the last recorded lap as unavailable. Native duplicate import of original 0362 retained two sessions and mappings. Missing synthetic MP4 remained unavailable with both segments intact; Locate plus explicit confirmation restored playback. Before/after persisted JSON showed identical segment arrays, selected segment and preferences, with only the source path changed. Restart restored paused playback, rate 2, panel height 240, two segments and existing formulas/presets/comparison.
- Independent task reviews and whole-diff acceptance review identified and verified bounded fixes for async races, session switching, graph hover, unavailable seeks, paused native clocks and recorded-lap coverage. No Critical or unresolved Important local-video code findings remained; final acceptance distinguishes the approved fallback from full native YouTube support.

- Final follow-up on 2026-10-14: an initial startup observation stayed on restoration, then resolved without repair; the cause is unconfirmed. A subsequent confirmed quit/relaunch loaded both sessions immediately. The current user-edited YouTube source/mapping was preserved, and the product Video workspace displayed its explicit native error-153 availability message. Earlier synthetic local restart evidence remains separate from this current workspace check.

## Native YouTube limitation and accuracy

Early development WKWebView playback over HTTP worked, but the packaged custom origin failed with YouTube error 153 (missing accepted HTTP Referer/client identity). The user-supplied `TySa_fqgccc&t=1308s` was also tested in an actual packaged official-API probe: the iframe showed error 153, duration stayed unknown and Play failed. A separate HTTP browser official embed reported “Shifter Is Back?”, duration 2637 s, completed seek to 1308 s and advanced to 1316.98 s. That establishes browser availability only; it does not establish native playback or native synchronization.

The approved local-video fallback is retained without a proxy, identity spoofing, stream extraction or weakened security. Native YouTube playback and its end-to-end synchronization/restoration remain an unmet full-milestone criterion. Local timing follows codec/media timestamps, display cadence and manual alignment; frame-level accuracy is not guaranteed. YouTube synchronization is approximate when the platform permits playback. Windows codec/WebView behavior has not been natively verified. Below roughly 356 px available player width, the minimum 200 px height can override the viewport's 16:9 ratio; footage remains contained, a deferred minor layout issue.

## Preservation and delivery

Original XRK SHA-256 values remain unchanged: 0361 `b46294e5cbf4df0ad946b33c1e3810f141c00afc5b2c0784c3a2a2e5ae6abc38`; 0362 `cd749e4279b6fab0c36e8f43ff7b187614c8e63c37ca8777460d09b9b6390a64`. Both remain ignored and untracked; no telemetry, videos, caches or secrets are included in milestone commits. Unrelated uncommitted speed-display changes remain in the working tree. Existing Git history is preserved; delivery uses a normal push to `origin/main`. Work stops at Milestone 6 with the native YouTube limitation above.

---

# Milestone 5 — Advanced telemetry analysis · 2026-10-12

Implemented the approved design from baseline `aba9534`, using Codex Orchestrator with at most two concurrent workers. Independent numerical and integrated reviews found regressions that were corrected with observed failing tests before acceptance. Final review recommends shipping.

## Completed
- All seven features: G-G traction, shift analysis, RPM recovery, scatter plots, distributions, restricted mathematical channels and saved analysis presets. Advanced remains a separate workspace beside the existing Telemetry view, retaining laps, comparisons, track sections, themes and synchronized plots/maps.
- Rust owns calculations at original sensor timestamps, shared cadence/explicit-gap alignment, acceleration units/signs/offsets, discrete gear sampling, full-precision summaries, weighted histograms and event evidence. Known outages are never interpolated. Physical display mapping does not warp calculation time.
- G-G axes are user-selectable with explicit orientation/calibration/gravity uncertainty. Shift evidence distinguishes measured, calculated and RPM-inferred changes, including conservative inferred downshift candidates; interruption and recovery windows never claim mechanical shift duration. Low-RPM recovery defaults to configurable 8,200 RPM and remains a candidate without supporting throttle/gear evidence.
- Restricted expressions validate units, dependencies and circular references, bound input/work, and preserve invalid numerical results as gaps. Derived channels work in ordinary telemetry plots. No dynamic code execution or new dependency was added.
- Five built-in presets plus custom save/duplicate/rename/delete/default/reset, independent formula persistence and per-tool channel/scale/range settings. The bounded advanced namespace preserves Milestone 4 workspace compatibility and protects unknown newer advanced state. Source-validated advanced cache is bounded to eight results.
- Canvas zoom/pan/reset, point and histogram-bin inspection, panel resizing, common filters, sortable/excludable events, RPM context and event map markers. Aggregate histogram bins leave the shared point cursor unchanged. Async saves/session switches and event-tool plot rebuilds have regression coverage.

## Verification
- `npm test`: 25 tests pass. `cargo test --manifest-path src-tauri/Cargo.toml --offline`: 66 unit tests and 12 integration tests pass, plus doc tests. Synthetic cases cover units, outages, irregular cadence, invalid formulas, cycles, event noise/braking/throttle lifts, gear debounce, discrete values, exclusions, nullable recovery and tool isolation.
- All four browser suites pass: `test:plots`, `test:workflow`, `test:advanced`, `test:canvas`. Advanced workflows use actual Rust output from a real XRK through simulated IPC; canvas fixtures target rendering/inspection. Tests cover shared cursors, filters, event exclusions, formulas, presets/restart, delayed validation races and finite cursor retention across event-tool changes.
- `npm run build` and final `npm run tauri build` pass. Native Apple Silicon macOS bundle: 11.61 MiB. Exercised real sessions, duplicate native-picker import, all seven tools, event-map and scatter selections, derived mph channel in ordinary plots, log distribution/bin inspection, preset default/reset, keyboard panel resizing, both themes, and verified process exit/relaunch with saved formula, preset and lap comparison restored. Native retest confirms the final cursor-rebuild correction.
- Both original XRKs are read by integration tests. Fastest-pair calculated-gear transition candidates: 0361 19/17, 0362 16/16. Default low-RPM recovery candidates: 0/0 in each. Final debug paired-lap detector calculations: shifts 39–43 ms, recovery 31–33 ms on this Mac; these are representative engine observations, not end-to-end latency guarantees.
- Original fixture SHA-256 hashes remain unchanged (recorded below); both files remain ignored and untracked. No telemetry was uploaded or committed.

## Limits / stopping point
- The fixtures have calculated gear, no measured throttle/brake, and unverified accelerometer mounting/calibration. Candidate counts validate execution and invariants, not externally annotated mechanical events, confirmed bogging or tire grip. Sparse source data and GPS resolution limit conclusions.
- Overlapping histogram bars favor primary-lap bin inspection. Default presets apply through explicit reset; reopening preserves the last used configuration. Large recording/library performance has not been broadly benchmarked. Existing memory-only parsed-cache and source-refresh limitations remain.
- Existing upstream `binrw` future-Rust compatibility warning remains. The app is locally ad-hoc signed; distribution signing/notarization is outside scope.
- Milestone 5 is the stopping point. AI Race Engineer development has not begun.

---

# Milestone 4: persistence and workflow polish — 2026-10-11

Continued from `1b3d192`. Approved architecture recorded in `docs/superpowers/specs/2026-10-11-persistence-design.md`; implemented with Codex Orchestrator and at most two concurrent workers.

## Completed
- Versioned local JSON session library in macOS Application Support (`com.dalal35.apextelemetry/library.json`). Synced temporary writes and same-directory atomic replacement preserve a valid previous-generation backup. Damaged primary recovery is disclosed; unrecoverable/unsupported stores stay read-only rather than being silently overwritten.
- SHA-256 content identity, canonical file references and summary metadata; no raw samples persisted or original XRKs duplicated by the application. Parsed sessions are cached in memory. Hashing, parsing, analysis and saves run outside the UI thread; summaries restore before the selected recording loads.
- Recent sessions, duplicate detection, explicit Refresh, matching-content Locate and safe Remove/reimport. Missing or modified sources cannot silently supply cached analysis. Refresh of changed content clears incompatible workspace and corner overrides; failed refresh preserves the prior entry. Remove never deletes the source.
- Per-session primary/comparison laps, channel selection/order, speed units, time/distance axis, graph density and compatible zoom restore across switching and relaunch. Source-version checks reject stale workspace saves after refresh. Ordered saves, selection/request guards and lifecycle interaction locking prevent stale responses from replacing newer work.
- Track boundary handles support dragging and arrow-key adjustment (5 m; Shift 20 m). Shared boundaries persist in primary reference-lap meters, with fixed endpoints and Rust validation of finite values, partition count and minimum 2 m spacing. Reset to automatic removes overrides. Existing guarded section metrics recompute without altering recorded telemetry, spatial alignment or delta. Incompatible partial comparisons temporarily omit manual sections with a note and retain guarded telemetry/reset access.
- Existing visual language retained, with compact library actions, useful restoration/file/save/error states and existing Cmd+O/Escape workflow. Speed presentation supports km/h and mph; distance coordinates remain explicitly labeled meters.

## Verification
- `npm test`: **18 tests pass**, including workspace defaults, source-version invalidation, compatible lap/axis zoom, boundary ordering and speed presentation without raw-data mutation.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`: **34 tests pass** (23 existing numerical unit tests, 7 library integration tests, 4 real-XRK integration tests). Temporary-copy tests cover duplicate bytes, same-size changes, cached-source rejection, missing/located files, failed refresh, duplicate-refresh rejection, safe remove, bounded workspace, stale saves after refresh, reopen/reset/refresh of corner edits, corrupt primary/backup, interrupted temp files and unsupported schema protection.
- Real-XRK corner tests on both fixtures preserve alignment/delta JSON, contiguous meter partitions, elapsed/delta sums, time-axis conversion and partial-comparison fallback. Native-response serialization assertions cover computed file status and saved override state.
- `npm run test:plots`: real-XRK browser interaction check passes synchronized zoom/pan/reset/cursor/map/card focus, boundary pointer drag and keyboard ordering, and compact-layout zoom retention.
- `npm run test:workflow`: simulated-IPC React browser check passes per-session switching, serialized saves, reload restoration, safe removal, explicit refresh invalidation, boundary focus and ordered edits. Regression tests were observed failing for out-of-order saves (55 m instead of 60 m), late-analysis draft replacement (70 m instead of 75 m), and click-to-keyboard focus, then passing with fixes.
- Production frontend build and native arm64 macOS app build pass; bundle approximately **11.19 MiB**. Native app exercised via its real picker and UI, including full Quit/relaunch with process exit confirmed. Two library entries and active comparison restored; an earlier exact workspace/corner comparison retained primary/comparison, channel order, imperial units, compact layout, time axis, boundary **22.999009970358813 m** and zoom **1.1945246190757643–4.061232803325453 s**. Restored zoom was also visually checked on all plots.
- Native UI checks cover keyboard corner edit/reset, partial-comparison fallback, per-session switching, duplicate import (count stays two), Remove/reimport with original source preserved, and modified/moved disposable copies. Modified content remained blocked until explicit Refresh; valid replacement reset incompatible state. Missing copy exposed Locate and matching original content reopened successfully. Final library references both original fixtures.
- Native comparison results remain **−0.359 s** (0361 lap 9 versus 10) and **−0.399 s** (0362 lap 8 versus 9), with validated spatial alignment. Independent read-only acceptance review: **ship**, after correcting response-field and asynchronous editing regressions.
- Original fixture SHA-256 hashes remain unchanged, ignored and untracked: 0361 `b46294e5cbf4df0ad946b33c1e3810f141c00afc5b2c0784c3a2a2e5ae6abc38`; 0362 `cd749e4279b6fab0c36e8f43ff7b187614c8e63c37ca8777460d09b9b6390a64`. Originals were never moved, modified or uploaded.

## Limits / stopping point
- File changes are checked when accessing/analyzing or refreshing a session; there is no background filesystem watcher or automatic moved-file discovery. Locate is explicit and requires matching content.
- Parsed cache is memory-only and currently unbounded until removal or application exit. Each analysis validates the source fingerprint; cold launch reparses only the selected session. Very large libraries/recordings have not been performance-benchmarked.
- Recovery was tested with interrupted temporary files and corrupt manifests/backups, not physical power-loss fault injection. A recovered backup can omit the most recent save; the UI explains this. Unrecoverable or newer-schema stores require manual recovery/update and are preserved.
- Manual boundaries remain approximate and primary-lap-specific; they do not increase GPS accuracy. Native keyboard editing and browser pointer dragging were exercised; physical native pointer dragging was not separately tested. Existing fixture/calibration and GPS-resolution limitations still apply.
- Existing upstream `binrw` future-Rust warning remains. App is locally ad-hoc signed; distribution signing/notarization is outside scope. No AI, advanced plots or unrelated features added. Stop at Milestone 4.

---

# Spatial comparison milestone — 2026-10-11

Continued from `77d9f42`. Existing native workspace and visual design retained.

## Completed
- GPS-based alignment in a shared session-local metric frame. The selected primary lap's smoothed trajectory supplies reference meters; comparison fixes project geometrically with heading, ordering, lateral residual and branch-ambiguity checks. Matching lap percentage is never used to establish physical position.
- Conservative gates for fix validity, reported accuracy, cadence, missing spans, implausible motion, stationary positions, racing-line separation and start/finish agreement. Isolated spikes can be rejected when nearby valid fixes support a short bridge; long gaps reject spatial comparison. Missing receiver accuracy uses a disclosed conservative 5 m floor, never zero error.
- Cumulative same-position time delta, shared reference-distance overlays and primary-time coordinates for aligned time views. Endpoint delta is checked against recorded lap durations. Explicitly estimated normalized-distance fallback remains when supported by reliable speed; unvalidated corner comparisons are withheld.
- Approximate corners and straights from spatially sampled heading changes, supported by local speed profiles. Short uncertain islands merge; finish-seam geometry is considered. Boundaries follow the primary reference and carry resolution estimates.
- Section time differences, entry/minimum/exit speed in km/h, selected-channel time-weighted means and signed differences in channel units. Outages and invalid GPS fixes suppress unsupported metrics. GPS map paths and markers break across invalid spans.
- One-click map sections and comparison cards focus all telemetry plots and synchronize cursors, live readouts, map markers and selected section. Reset restores the whole lap and clears focus. Existing lap-list compare buttons remain the one-click comparison workflow.

## Verification
- `npm test`: 12 tests pass, including physical coordinate mapping and GPS path/marker gap handling.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`: 23 unit + 3 integration tests pass. Synthetic cases cover known spatial position despite different trajectories, noise/spikes, invalid/missing GPS, reversed travel, stationary positions, unknown accuracy, two known hairpins, channel gaps/time weighting and section-time telescoping.
- Real-session tests read both original XRKs and corrupt only in-memory clones. They verify spatial method, monotone mappings, section partitions, timing sums, exact delta endpoints and conservative downgrade on invalid fixes/accuracy/missing spans.
- `npm run test:plots`: local real-XRK browser check passes synchronized zoom, pan, reset, cursor/readouts, map/card selection and all plot cursors at the selected section midpoint. Localhost binding requires sandbox escalation; no telemetry is uploaded.
- Production web build and native arm64 macOS application build pass. Native app exercised with both real files, fastest-lap comparisons, corner focus and live readouts, aligned time axis and both themes; original dark theme restored.
- Best-versus-next-fastest results: 0361 reference 413.977 m, engineering position resolution 2.76 m / timing resolution about 0.72 s; 0362 reference 413.031 m, 2.44 m / about 0.68 s. Both produce 7 approximate corners + 4 straights, with full valid-fix coverage. Endpoint and summed section deltas match recorded differences: −0.359 s / −0.399 s. These are invariant checks, not surveyed positioning ground truth.
- Independent read-only acceptance review: ship, no blockers.
- Fixture SHA-256 hashes unchanged (listed below); fixtures remain ignored/untracked.

## Limits / stopping point
- Spatial alignment improves physical comparability but these GPS recordings cannot establish exact corner boundaries or sub-tenth local timing accuracy. Resolution estimates are engineering estimates, not confidence intervals; small local deltas must be interpreted accordingly.
- Reference trajectory and section labels change with the primary lap. Manual boundary editing is deferred: a safe editor must recompute metrics and preserve alignment validity. Chart zoom/pan remains available for examining a chosen range.
- Rejected geometry falls back to a clearly labeled estimate or withholds comparison. Approximate corners have no external ground-truth annotation. Validation remains scoped to these logger fixtures and targeted synthetic cases.
- Sessions remain in memory. No AI, SQLite, telemetry upload/modification or unrelated advanced features were added. Stop at this milestone.
- Existing upstream binrw 0.14.2 future-Rust warning remains; current checks pass. App remains locally ad-hoc signed; distribution signing/notarization is outside scope.

---

# Previous viewer milestone — 2026-10-11

## Completed
- Native Apple Silicon macOS app: Tauri 2, Rust, React/TypeScript, uPlot. Original graphite/cyan/amber workspace with dark/light themes.
- Native multi-file picker, Cmd+O and native file-drop handler; local session list, channel discovery, lap selection and fastest complete lap.
- Pinned MIT libxrk core imports both real XRKs: 12 recorded laps and 27 available channels each. Best complete laps: 26.676 s / 26.585 s. Initial/final partial laps excluded from ranking.
- Independent channel timestamps, full-precision speed integration, distance/time axes, two-lap overlays, synchronized zoom/pan/reset/cursor values, projected GPS racing lines and position markers.
- Estimated normalized-distance delta only for complete laps with reliable speed and compatible measured lengths; explicit uncertainty notes.
- Missing samples, invalid GPS fixes, unknown calibration, unsupported channels and malformed files receive guarded calculations or visible notes. Declared channel outages break chart lines and suppress interpolated readouts.

## Verification
- `npm test`: 7 presentation/numerical helper tests pass.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`: 12 numerical unit tests + 2 integration tests pass (both actual XRKs and malformed import).
- `npm run test:plots`: actual XRK-derived plots pass synchronized zoom, shift-pan, reset and live cursor checks in local headless Chrome.
- `npm run build` and `npm run tauri build`: pass; native arm64 app bundle approximately 10.7 MiB.
- Native app launched; picker imported both files; inspected session switching, correct lap times, two-lap overlays, live readouts and synchronized GPS markers, time axis, channel selector and both themes.
- Independent acceptance review: ship after correcting channel-gap interpolation/disclosure.
- Original fixtures remain byte-for-byte unchanged, ignored and untracked:
  - 0361 SHA-256: b46294e5cbf4df0ad946b33c1e3810f141c00afc5b2c0784c3a2a2e5ae6abc38
  - 0362 SHA-256: cd749e4279b6fab0c36e8f43ff7b187614c8e63c37ca8777460d09b9b6390a64

## Limits / next steps
- Delta is an estimate at normalized progress, not exact same-location timing; overlays retain measured distance. Generic channel calibration is parser-backed and validation is scoped to these fixtures; no claim of universal device support.
- Sessions remain in memory; reimport after reopening. No database, AI analysis or device communication.
- Very sparse channels may lack enough intervals to classify outages reliably. GPS outages are disclosed; GPS trace segments may visually connect across them.
- Native file-drop handler is implemented; physical Finder-to-app drop was not exercised. Native picker, real imports and chart/track synchronization were exercised.
- Local app is ad-hoc signed; distribution signing/notarization is outside this milestone. Upstream binrw 0.14.2 emits a future-Rust compatibility warning; current build/tests pass.
- Frontend initial five tests were written before implementation but no red assertion was observed because Vitest was not installed yet. Subsequent gap regression tests completed red-green verification.
- Future optional work: persisted sessions, wider logger/calibration fixtures and more precise spatial lap alignment. Stop at this verified milestone.
