# Dedicated Advanced Workspace Design and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for parent-led execution. The parent may assign up to two workers with distinct file ownership after approval. Obtain independent read-only acceptance review after integration.

**Goal:** Separate Advanced analysis from Video and make the existing M5 tools usable as a dedicated, responsive telemetry workspace.

**Architecture:** Keep App as owner of session, laps, workspace preferences, cursor, zoom and video synchronization. Reuse Advanced, AnalysisCanvas, Plots, advancedState and the existing Rust analysis/expression engines. Restrict VideoWorkspace and active media synchronization to the Video view; Advanced continues to use the same telemetry selection and timeline.

**Tech Stack:** Existing React/TypeScript, CSS, canvas, uPlot, Tauri/Rust, Vitest and Playwright. No new dependencies.

**Spec:** The user's pasted Advanced-tab request and the design below. Approved by the user on October 15, 2026; executed parent-led with two focused workers and independent read-only review.

## Global constraints

- Preserve existing dirty-tree changes, session persistence, lap comparison, merged-source provenance and all original XRK files. Do not reset, stash or replace existing work.
- Reuse M5 calculations and math validation; do not rewrite detectors, the math engine or alignment.
- Use actual imported telemetry in the application. Synthetic tests cover adversarial cases; real-XRK diagnostics verify actual calculations and integration.
- All speed presentation uses mph through the existing speedDisplay conversions; backend channel values and units remain intact.
- Keep one shared cursor, selected lap/comparison, segments and zoom. Do not add an independent playback or synchronization system.
- Preserve video import, local playback, YouTube integration, source selection, mapping validation and persistence within Video.
- Preserve analysis configurations, formulas and presets across workspace switches. Preserve future-schema data as read-only.

## Inspection findings

- `src/App.tsx:101` renders VideoWorkspace for Video **or Advanced with an attached source**. Lines 58, 86 and 89 also activate video/player seeks for Advanced. This causes the duplicated video interface.
- `src/Advanced.tsx` already provides traction, scatter, histogram, shifts, low-RPM recovery, formulas, presets, filters, statistics, warnings and event navigation.
- `src/AnalysisCanvas.tsx` already draws primary/comparison points and common histogram bins, reports values/source timestamps, supports inspection/pan/zoom and uses ResizeObserver. Plot height still comes directly from a saved pixel preference.
- `src/advancedState.ts` already saves mode-specific channel/axis settings and built-in/custom presets. Workspace owns persistence.
- App already validates saved formulas, appends their channel metadata to the session, and passes formulas to backend analysis. Calculated channels are already eligible for selectors.
- `src-tauri/src/telemetry/advanced.rs` provides alignment, G conversion, filtering, weighted histograms, shift/bogging evidence and diagnostics. `expressions.rs` supplies the math engine.
- Rust `advanced.rs:209–240` already projects spatial comparison event positions onto the primary timeline. Advanced's event click handler maps them a second time. Correct the frontend consumer and fixtures, preserving this backend contract.
- Shift/bog modes show event tables and shared RPM plots, but lack explicit event-window inspection and guaranteed speed context.
- Existing browser checks in `scripts/verify-video-integration.mjs` expect Advanced to seek visible video. These assertions must change to test deliberate tab separation while retaining Video-only sync coverage.
- No applicable repository or ancestor AGENTS.md was found. Existing working-tree changes include App, Advanced, VideoWorkspace, workspace tests, speed conversion and responsive session navigation; preserve them.

## Design/specification

### Workspace separation

Advanced always renders telemetry analysis without video source controls, a player, YouTube controls or the video synchronization editor. Video always renders the existing VideoWorkspace and synchronized telemetry context. Leaving Video disposes/pauses its active player through the existing lifecycle; saved source/mapping preferences remain available on return. No background video clock may move Advanced's cursor or selected lap.

### Advanced organization

Keep one active analysis mode with clear labels: **G-G Traction Circle**, **Scatter Plot**, **Histograms**, **Shift Analysis**, **RPM Bogging**, and **Custom Math Channels**. Keep the preset selector alongside mode selection, with existing management actions. Bogging content retains its evidence qualification: low-RPM recovery candidates are not automatically confirmed bogging.

Put shared segment/range/value filtering above mode controls; keep less frequently used axis/calibration options in expandable controls. Give the selected plot the main workspace area. Retain shared telemetry and track/segment context, with controls that wrap or stack in the existing chart container. Keep event tables locally scrollable on narrow widths.

### Existing modes and targeted integration

- Traction uses existing lateral/longitudinal channels and calibration, combined acceleration point cloud, G reference rings, lap colors and timestamp/value tooltips. Missing/invalid acceleration gets explicit existing diagnostics; do not fall back silently to unrelated channels. Keep physical equal scaling of lateral and longitudinal G so reference circles are circular on screen.
- Scatter uses available source and validated math channels, overlays, filtering and shared timeline point selection. Preserve lap color identity; when optional channel coloring is enabled, retain a visible comparison cue.
- Histograms retain common comparison bins, configurable count/width, time/sample weighting, percentage/count presentation, units and invalid-data handling.
- Shifts and bogging retain existing event evidence, RPM drops, recovery metrics, exclusion controls and conservative limitations. Ensure RPM and speed context are requested for these modes, even if absent from the user's normal channel list. Never overwrite that saved channel list.
- Add explicit event inspection that moves the shared cursor and focuses the existing synchronized traces around the event; use a bounded window with context (2 seconds on each side in time mode, 20 meters in distance mode), clamped to valid available plot bounds. Include the observed end position when available. No new event detector or plot engine.
- Formula validation/CRUD and presets remain the existing implementations. Verify derived channels are offered and consumed by advanced plots, including unavailable/deleted formula references.

### Synchronization contract

Advanced result positions are already in the backend's timeline coordinates. Use finite positions directly for primary events and spatially aligned comparisons; remove the extra comparison-time conversion. When spatial alignment is unavailable, primary lap-time inspection is valid, comparison inspection remains informational unless its coordinate can safely represent the shared primary timeline, and unavailable distance positions do not move the cursor. Do not imply physical correspondence from equal unaligned lap times.

Point and event inspections must preserve original lap/source identity. Advanced actions must never issue media seeks, including cross-source merged comparisons. Returning to Video restores its existing mapping/player behavior. Track/segment selection remains shared; in Advanced, selecting a track section also selects that section in the existing advanced filter, and clearing selection clears that filter without introducing separate selection state.

### Responsive behavior and persistence

Reuse the chart-container queries introduced by existing session-explorer changes. Size canvases from measured available width and clamp the rendered preferred height to usable viewport height with a useful minimum; retain the saved resize preference separately from temporary viewport constraints. Keep wheel/pan view stable on window/sidebar resizing. Avoid page-wide horizontal overflow at 600 px and give plots useful space at 1600 and 2560 px; check a short 500 px window too. Existing local event-table overflow is acceptable.

## Review focus

1. Attached video must not mount or publish callbacks into Advanced, including late seek/playback callbacks after tab/session changes.
2. Spatial comparison events in time mode must use backend-projected primary positions exactly once; nonspatial/absent positions must not cause false alignment.
3. Merged comparison-only channels and formula metadata must keep correct lap/source labels and mph conversions.
4. Narrow/short windows and live sidebar resizing must preserve preferences, cursor and canvas viewport without clipping controls.
5. Empty/invalid results and missing RPM, speed or acceleration must show useful messages without stale events or fabricated data.

## Implementation plan

### Task 1: Separate workspace rendering and media ownership

**Files:** Modify `src/App.tsx`, `scripts/verify-video-integration.mjs`; extend existing `tests/video-integration.tsx` only if instrumentation needs it.

**Interfaces:** Preserve VideoWorkspace props, useVideoSync and workspace schema. Video player ownership and media seeking require `workspace.view === 'video'`.

- [x] Add failing browser assertions: an attached-source Advanced view contains Advanced controls but no VideoWorkspace/player/import/YouTube UI; Video contains its controls but no Advanced modes.
- [x] Test Video → Advanced → Video and Telemetry → Advanced without video: saved mappings and Advanced mode/settings survive; stale disposed media callbacks cannot change Advanced's lap/cursor.
- [x] Restrict wrapper rendering, player activation and media-seek gates to Video. Preserve source-context and lifecycle guards. Keep Advanced cursor/event actions functional without media.
- [x] Replace obsolete Advanced-media-seek assertions with telemetry cursor assertions. Retain Video graph/map/segment/lap seek, source-switch, ambiguity and async-race coverage.
- [x] Run `npm run test:video`; inspect the focused diff against the existing dirty baseline.

### Task 2: Complete analysis-mode integration and event inspection

**Files:** Modify `src/Advanced.tsx`, `src/App.tsx`, `src/AnalysisCanvas.tsx`, `src/Plots.tsx` if needed for external zoom updates; add `src/advancedIntegration.ts` and `src/advancedIntegration.test.ts` only for shared pure position/window policy. Extend `scripts/verify-advanced.mjs` and relevant video integration fixtures.

**Interfaces:** Reuse `AdvancedResult`, `AdvancedEvent`, shared cursor and workspace zoom. If extracted, define `inspectableAdvancedPosition(lapId: string, position: number | null, analysis: Analysis): number | null` and `advancedEventWindow(event: AdvancedEvent, axis: Axis, bounds: {min:number;max:number}): {min:number;max:number} | null`. Add `onInspectEvent?: (event: AdvancedEvent) => void` to Advanced, with App owning shared cursor/zoom updates. Existing seek callbacks retain provenance.

- [x] Add failing checks for backend-projected comparison-time positions (unequal lap mappings), finite/absent/nonspatial positions, bounded context windows, and foreign-source inspections without media seeks.
- [x] Reuse returned event coordinates directly and implement event focus through existing shared zoom; make Plots respond safely to externally changed zoom if necessary without zoom-save feedback loops.
- [x] Request existing RPM and speed context in shifts/bog modes without changing saved normal channel selections. Test missing context channels and successful RPM/speed trace rendering.
- [x] Connect Advanced section selection to existing shared track/segment selection and clear/reset behavior.
- [x] Clarify labels, avoid unrelated-channel traction defaults, retain source/lap identification under optional channel coloring, and use equal G scale in the traction renderer.
- [x] Test all six modes, overlays/lap switching, math-channel selections and invalid/deleted formulas, presets/restart, empty sessions, unsupported/missing channels, invalid/nonfinite samples and stale requests. Reuse existing real-XRK diagnostic output; correct synthetic fixtures to match the backend position contract.
- [x] Run `npm test`, `npm run test:advanced`, `npm run test:canvas` and affected Video integration checks.

### Task 3: Responsive layout, integration verification and acceptance

**Files:** Modify targeted Advanced selectors in `src/styles.css` or add focused `src/advanced.css` imported by Advanced; modify `src/AnalysisCanvas.tsx` for measured sizing and `scripts/verify-advanced.mjs` for viewport checks. Preserve existing `src/explorer.css` behavior.

**Interfaces:** Preserve `AdvancedConfig.panelHeight` as the saved user preference; temporary viewport constraints do not write a new preference. No persistence schema change.

- [x] Add failing narrow/wide/short-window checks at 600×500, 1600×1000 and 2560×1440, including live resizing, resizer keyboard/pointer interaction, formula editor and event tables. Assert no page-wide overflow and stable cursor/settings.
- [x] Apply wrapping/stacking controls, usable plot height and equal-scale traction layout using existing design tokens and measured container dimensions. Capture screenshots for visual review.
- [x] Run `npm test`, `npm run build`, `npm run test:plots`, `npm run test:workflow`, `npm run test:advanced`, `npm run test:canvas`, `npm run test:video`, `npm run test:sidebar`.
- [x] Run `cargo test --offline --manifest-path src-tauri/Cargo.toml` with the repository's documented local toolchain environment when needed, then `npm run tauri build`. Report tooling/signing/network limitations separately from product failures; do not claim skipped checks passed.
- [x] Obtain an independent read-only acceptance review of the stable integrated diff against this spec; correct blocking findings and rerun affected checks.
- [x] Deliver the duplication cause, reused components, changes, actual check results and remaining limitations. Confirm original recording files and unrelated changes were preserved.

## Execution ownership after approval

Parent owns App routing, shared state and synchronization, integration decisions and final acceptance. Up to two workers may own disjoint focused UI/canvas or test changes; assign complete missions and avoid concurrent edits to shared files. Independent reviewer is read-only. The user approved the design, plan and execution on October 15, 2026.

## Evidence before approval

- `npm test`: **12 files / 203 tests passed** on October 15, 2026.
- Read-only advisor confirmed backend event positions are already projected, existing math metadata is supplied by App, and event traces can reuse Plots with RPM/speed context.
- Product, integration/build and Rust checks have not yet been run for this proposed change because implementation is awaiting approval.

## Acceptance record — October 15, 2026

- All six modes reuse M5. Advanced and Video are separate with attached and unattached sources; late video callbacks cannot own Advanced.
- Regression tests verified projected comparison events exactly once through table, map and keyboard, event zoom, math selectors, presets, invalid/empty data and a truly empty session.
- Frontend: 215 tests passed. Real-XRK Advanced/plots, canvas, workflow, player and Video integration checks passed. Layouts tested at 600×500, 1600×1000 and 2560×1440.
- Rust: full offline suite passed (108 tests); doctest phase passed with 0 examples. Initial sandbox AVFoundation failures and concurrent-cache doctest lookup failures were resolved by authorized platform access and a consistent sequential run.
- Sidebar acceptance test fails at its Refresh-menu assertion in both current and saved pre-task baseline; unrelated sidebar code was preserved.
- Independent review found no demonstrated product blocker. Review identified missing responsive prerequisites in the selective commit candidate; Advanced-scoped CSS now supplies them without committing the unrelated session explorer.
- Commit includes required existing mph conversion prerequisites. Unrelated sidebar/navigation/window configuration changes remain outside the commit. Original XRK hashes were verified unchanged.
- Browser integration uses real XRK-derived Rust outputs with simulated native IPC/media boundaries; actual YouTube/network playback was not newly tested.
