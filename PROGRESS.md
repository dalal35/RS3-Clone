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
