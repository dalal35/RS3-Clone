# Responsive Session Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make session navigation compact and optional while keeping lap selection accessible and analysis responsive to live window resizing.

**Architecture:** Extract the existing sidebar presentation into a focused React component; keep session lifecycle, merge validation and workspace state in App. Store navigation preferences separately from per-session workspaces. Use bounded navigation widths, flex/grid sizing and named container queries for analysis panels; retain mounted analysis and video components when navigation changes.

**Tech Stack:** Existing React/TypeScript, CSS, uPlot, ResizeObserver, Vitest, Playwright and Tauri. No new dependencies.

**Spec:** The user's pasted sidebar brief, the approved in-chat design, and the October 15 follow-up. The accepted requirements and implementation decisions are captured below; this is a bounded modification of existing flows, not a new persistence subsystem.

## Global Constraints

- Support Expanded (sessions and laps), Analysis (laps only), and Fully collapsed (small reopening rail); persist the preferred state independently of workspace tabs.
- Default session organization: grouped by date, newest first.
- Sorting and grouping are separate; support date ascending/descending, driver A–Z/Z–A and circuit A–Z/Z–A; grouping supports date, driver, circuit and none.
- Circuit comes only from LibraryEntry.track. Normalize surrounding whitespace and capitalization for driver/circuit group identity. Missing/invalid metadata uses explicit unknown labels and sorts after known metadata; equal sort values use stable recording date/name/id tie breakers.
- Use compact rows with ellipsis and full-detail tooltips. Retain Refresh, Locate, Remove and Unmerge only where supported; no fake Rename action.
- Merge selection is temporary and accessed from header overflow. Preserve existing eligibility rules, IPC, preview, acknowledgement and error handling. Cancel/success exits selection and clears temporary IDs; failed preview remains retryable.
- Preserve primary/comparison laps, partial labels, accurate times, merged source labels, channel selections, zoom, cursor and video synchronization on navigation changes.
- Adapt to current window/container dimensions. Narrow windows use a temporary navigation drawer with backdrop, Escape dismissal, focus restoration and keyboard containment; opening a drawer must not resize/remount analysis or permanently overwrite the preferred desktop state.
- Sessions and laps have independent sibling scrolling regions within available sidebar height. Give laps most remaining space, and all of it in Analysis state. No whole-sidebar scroll containing list scrolls.
- Preserve Rust behavior, original XRK files, persisted sessions, and unrelated uncommitted changes. No new UI framework or dependencies; use existing design tokens.

## Review Focus

1. Live transitions through drawer width while a menu is open: controls stay visible and keyboard focus remains usable.
2. Short windows with hundreds of sessions: lap selection and sidebar actions remain reachable without scrolling through sessions.
3. Invalid dates, date-only merged sessions and capitalization variants: no guessed metadata, accidental day shifts or unstable grouping.
4. Changing navigation during zoomed telemetry, advanced inspection or video playback: no workspace/player remount, lost zoom, or extra analysis request.
5. Missing/modified files and failed merge previews: contextual repair actions and existing error handling remain reachable.

## Current Source Evidence

- App.tsx owns session loading, serial workspace saves, lap/comparison selection and merge lifecycle. Keep those owners.
- LibraryEntry already provides name, driver, track, recordedAt, status and mergeSources. Backend copies track/driver/date from decoded sessions; no migration is needed.
- Plots.tsx calls uPlot.setSize through ResizeObserver. AnalysisCanvas.tsx also observes its host, but enforces a 280 px width floor; verify against the responsive minimum and remove overflow if necessary without resetting its view.
- VideoWorkspace.tsx retains its player through refs/effects and has user-sized panel height. Constrain rendered height to usable window space without changing the saved preference.
- Existing styles include body min-width:680px, a content-growing shell, window-based inspector layouts, and a narrow video rule that forces a side-by-side inspector. These need targeted replacement/overrides.
- Read-only layout advisor confirmed these constraints and recommended one mounted sidebar subtree, separate temporary drawer state, and container-based inspector stacking. Native window configuration currently enforces a 960×640 minimum; lower it to 600×500 after the responsive checks pass so desktop users can actually access the narrow drawer layout. This is window configuration only, not a Rust or telemetry change.
- App.tsx, Advanced.tsx, Segments.tsx, workspace files and existing verification scripts contain unrelated edits. Preserve them; capture a baseline patch before execution and apply only focused changes.

### Task 1: Navigation preferences and session organization

**Files:** Create `src/sessionExplorer.ts`, `src/sessionExplorer.test.ts`.

**Interfaces:** Export `SidebarState = 'expanded' | 'analysis' | 'collapsed'`, `SessionSort`, `SessionGrouping`, `ExplorerPreferences`, `SessionGroup`, `defaultExplorerPreferences`, `readExplorerPreferences(storage: Pick<Storage,'getItem'>): ExplorerPreferences`, `writeExplorerPreferences(storage: Pick<Storage,'setItem'>, preferences: ExplorerPreferences): void`, and `organizeSessions(entries: readonly LibraryEntry[], sort: SessionSort, grouping: SessionGrouping): SessionGroup[]`. Preference storage must tolerate unavailable storage, malformed JSON and invalid enum values. Group results reference original entries and never mutate the library.

- [x] Write failing Vitest cases for all sort directions, deterministic ties/input permutations, case/whitespace normalization, unknown driver/circuit, malformed and date-only timestamps, no grouping, and unchanged input data.
- [x] Write failing preference tests for all three sidebar states, default date grouping/newest sort, invalid storage data and throwing storage implementations.
- [x] Run `npx vitest run src/sessionExplorer.test.ts`; confirm failures represent missing behavior.
- [x] Implement the helpers with explicit date validation and local recording-day semantics; do not infer metadata from filenames or titles.
- [x] Repeat the focused tests, then `npm test`; record results.

### Task 2: Compact session/lap navigation and App integration

**Files:** Create `src/SessionSidebar.tsx`; modify only sidebar/merge wiring in `src/App.tsx`; create `scripts/verify-sidebar.mjs`; update existing workflow selectors in `scripts/verify-workflow.mjs` where the UI intentionally changes.

**Interfaces:** SessionExplorer consumes entries, active session ID, session, primary/comparison IDs, busy/restoring/lifecycle flags, merge IDs/mode and callbacks for open/select/manage/selectLap/compare/previewMerge/cancelMerge. App retains session and merge business rules. SessionExplorer owns organization preferences and group expansion; the preferred sidebar state is shared with the shell through controlled state or a callback, without entering workspace serialization.

- [x] Add browser checks first for default compact rows, group expansion, all three states, persisted preference, selected session after sorting/grouping, and primary/comparison retention. Observe the missing-control failures before implementation.
- [x] Add merge entry/cancel/preview-error/retry/success checks and missing-file Locate/modified-file Refresh/merged Unmerge action checks. Update the existing merge workflow test to enter selection mode explicitly and reopen it after cancellation.
- [x] Implement compact header controls: sessions toggle switches Expanded/Analysis; collapse minimizes the entire sidebar; reopening restores lap access with an explicit Sessions control. Keep an accessible state label and buttons with meaningful names.
- [x] Implement sorting/grouping controls, collapsible group headings, selected row treatment, metadata tooltip, compact overflow menus with Escape/outside dismissal and focus restoration. Use standard interactive elements and arrow/Home/End navigation over visible selectable session rows; Enter/Space activates focused rows.
- [x] Put merge entry in header overflow; show checkboxes/action bar only in merge mode. Preserve original session eligibility and existing preview/confirmation implementation. Exit temporary mode on cancel or successful merge, including preview cancellation.
- [x] Preserve existing lap callbacks and numbering helpers. Fix any existing label precedence that could conceal an incomplete lap's PARTIAL status.
- [x] Run `npm run test:workflow` and the new sidebar browser script; record results.

### Task 3: Responsive shell, panels and drawer

**Files:** Modify `src/styles.css`, `src-tauri/tauri.conf.json` window minimum dimensions, targeted presentation in `src/App.tsx` / `src/SessionSidebar.tsx`, and resize handling in `src/Plots.tsx`, `src/AnalysisCanvas.tsx`, `src/video/VideoWorkspace.tsx` only if tests demonstrate a gap. Extend `scripts/verify-sidebar.mjs`.

**Interfaces:** Shell exposes a sidebar-state data attribute/class; the main analysis region is a named inline-size query container. Container queries change inspector stacking, toolbar wrapping, formula/editor layouts and video controls based on actual analysis width. The narrow drawer threshold is justified by minimum useful chart width plus navigation width, and observes current shell width rather than physical screen resolution.

- [x] Add failing browser checks for live resizing at 1440×900, 1280×800, 1024×640, 800×600, 600×500 and 1920×1080; test all three workspace views and three sidebar states.
- [x] Assert no document/main horizontal overflow; chart/canvas width follows its host; visible controls do not overlap or clip; long session names remain truncated; lists scroll independently with 100 entries; lap buttons stay reachable in short windows.
- [x] Assert chart DOM identity, saved zoom, primary/comparison, channel selection, active tab and video player identity survive sidebar changes and resize. Use simulated IPC only at the native boundary, as existing browser tests do.
- [x] Give the app a viewport-height shell with bounded sibling scroll regions. Use clamped navigation width and fluid spacing; avoid stretching sidebar widths on external monitors. Main content scrolls vertically within its region.
- [x] Introduce the temporary drawer at insufficient shell width: keep chart area intact, use a clearly accessible opener and backdrop, contain focus only while open, dismiss with Escape/outside click and restore focus. Do not automatically expand on tab changes or persist temporary drawer state as a desktop preference.
- [x] Replace conflicting window-dependent panel layouts with analysis-container rules; wrap important controls and progressively compact secondary toolbar actions. Keep all actions accessible. Respect reduced motion.
- [x] Verify ResizeObserver resizing preserves chart scales/cursor and canvas view; avoid adding sidebar state to component keys or analysis effect dependencies. Fit video rendering to available width/height while preserving its saved panel size and active adapter.
- [x] Run the new sidebar browser checks and existing plots/advanced/canvas/video suites; inspect screenshots at narrow, short, laptop and large sizes.

### Task 4: Integrated acceptance and native verification

**Files:** Add `test:sidebar` to `package.json`; update this plan's execution results and focused user documentation only as needed. Avoid unrelated documentation rewrites or committing existing user changes.

- [x] Run `npm test`, `npm run build` (includes TypeScript), `npm run test:sidebar`, `npm run test:workflow`, `npm run test:plots`, `npm run test:advanced`, `npm run test:canvas`, and `npm run test:video`. No lint script is configured; report that accurately.
- [x] Run offline Rust tests with the existing local toolchain and `npm run tauri build`; record native bundle location and any genuine platform/permission blocker.
- [x] Obtain an independent read-only acceptance review of the integrated diff, including preservation of the initial dirty changes, metadata handling, merge lifecycle, drawer accessibility and resize/state behavior. Correct blockers and rerun affected checks.
- [x] Inspect the final diff/status and confirm sample recordings/backend files were not changed. Deliver UI summary, file list, organization defaults, three-state/drawer behavior, merge changes, test evidence and remaining limitations. Do not claim native interactive checks unless actually performed.

## Execution / Approval

The user approved this plan and parent-led execution on October 15, 2026, with at most two parallel workers. Implementation and independent acceptance review are complete; final native bundle verification is recorded below.

Recommended method: parent-led native execution with bounded worker assignments for independent organization helpers and browser coverage, plus a fresh acceptance reviewer. This avoids repeatedly handing off the closely coupled shell/App/layout integration. An isolated worktree is optional and requires user consent; in-place work can preserve the supplied dirty baseline with focused patches.


## Final Results — October 15, 2026

Implemented the three persisted navigation states, compact session/lap rows, contextual management actions, temporary merge selection and independent sorting/grouping. Default date groups sort newest first. Unknown metadata sorts last; case/whitespace variants share groups. Invalid/ambiguous dates are labeled Unknown date; raw metadata remains in tooltips. Navigation uses logger wall dates/times without shifting recording days.

The shell uses current available window dimensions, a 40px reopening rail, bounded fluid sidebar width, sibling session/lap scroll regions and analysis/charts container queries. Below 900px shell width navigation becomes a temporary modal drawer without reducing chart width. Narrow/short windows prioritize laps and charts; long headings clamp to two lines. Video is sticky only with sufficient window height; its measured height supplies scroll padding so graph controls remain reachable. Analysis inputs/component keys do not depend on sidebar state or window size.

### Changed files for this task

- `src/SessionSidebar.tsx`: session/lap presentation, modes, groups, menus, keyboard and drawer access.
- `src/sessionExplorer.ts`, `src/sessionExplorer.test.ts`: pure organization, compact dates and safe navigation preferences; 38 tests.
- `src/explorer.css`: responsive shell/navigation/panels, fluid spacing, container queries and reduced-motion handling.
- `src/App.tsx`, `src/main.tsx`: explorer integration, preferences/drawer/merge-mode wiring, active recording label and CSS import.
- `src/video/VideoWorkspace.tsx`: measure sticky player to keep focused/scrolled graph controls clear; adapter and synchronization unchanged.
- `src-tauri/tauri.conf.json`: approved 600×500 native window minimum.
- `scripts/verify-sidebar.mjs`: dedicated simulated-IPC browser suite, including review regressions.
- `scripts/verify-workflow.mjs`, `scripts/verify-advanced.mjs`, `scripts/verify-video-integration.mjs`: revised action-menu selectors and distinct session-name fixtures, preserving existing assertions and dirty baseline edits.
- `tests/advanced.tsx`, `tests/video-integration.tsx`: load the same responsive CSS as production.
- `package.json`: `test:sidebar` command.
- This implementation plan: approved decisions and verification evidence.

### Verification

| Check | Result |
| --- | --- |
| `npm test` | 203 passed across 12 files; initial baseline 165 passed |
| `npm run build` |TypeScript and production Vite build passed |
| `npm run test:sidebar` |Passed 100/1/0-entry libraries, organization, keyboard/drawer/merge errors, all three modes and live600×500→2560×1440→600×500 resizing in Telemetry/Advanced/Video |
| `npm run test:workflow` |Passed switching, serial saves, refresh, merge preview/error/cancel/success, unmerge and removal |
| `npm run test:plots` |Passed real-XRK graph/zoom/pan/cursor/track/editing checks |
| `npm run test:advanced` |Passed real-output-backed analysis, formulas, presets, units and asynchronous races |
| `npm run test:canvas` |Passed rendering/inspection and cursor/zoom checks |
| `npm run test:video` |Both source/workspace and actual-App synchronization integration scripts passed |
| Offline Rust suite | 116 tests passed; doc tests passed. AVFoundation fixture creation failed in sandbox, then all tests passed with OS media access |
| `npm run tauri build` |Final macOS bundle passed, 12.31MiB at `src-tauri/target/release/bundle/macos/Apex Telemetry.app` |
| `git diff --check` |Passed |
| Independent acceptance |Two P2 issues (focus loss and hidden drawer merge errors) reproduced RED, fixed, browser suite GREEN, independently confirmed resolved |

Screenshots inspected at 600×500 and 2560×1440; additional intermediate windows included 800×600, 1024×640, 1280×800 and 1920×1080. Instance identity, graph/canvas zoom, selected session/laps, channels, axis, active tabs and video mapping/time remain intact. A small-library height regression and long-heading regression were also observed RED before their fixes.

No lint script is configured. Browser native IPC/media clocks are simulated; this work verified the native build and native Rust/AVFoundation tests, but did not manually operate the packaged UI or verify live native playback. Existing upstream `binrw 0.14.2` future-compatibility warning remains. No outstanding acceptance findings. Unrelated baseline changes were preserved; no XRK recordings, backend algorithms, library persistence or merge rules were modified. Changes remain uncommitted in the working tree.
