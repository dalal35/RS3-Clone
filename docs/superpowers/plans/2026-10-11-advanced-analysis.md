# Advanced Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Implement, integrate and validate all seven Milestone 5 tools.
**Architecture:** Rust owns original-time gap-aware calculations and restricted expressions. React presents results using the existing shared laps, corners, plots, track and atomic workspace persistence.
**Tech Stack:** Rust/serde, Tauri 2, React/TypeScript, uPlot, canvas; no new dependencies planned.
**Spec:** `docs/superpowers/specs/2026-10-11-advanced-analysis-design.md`

## Global Constraints

- Original telemetry files remain unchanged, ignored, untracked and local.
- Default low-RPM threshold is 8,200 RPM.
- Never interpolate across known outages or perform calculations on warped display timestamps.
- At most two concurrent workers, distinct file ownership; parent integrates and verifies.
- Preserve M1–4 and manifest version 1; bounded advanced namespace in workspace JSON.
- Stop before AI Race Engineer.

## Review Focus

- Invalid sample removal must not accidentally bridge an outage.
- Cursor updates from event/scatter selection must reach ordinary plots without feedback loops.
- Time-weighted histograms must clip selection boundaries and not count gaps.
- Preset switching must preserve formulas and old-workspace restoration.
- Missing/unknown channels must not acquire invented calibration or detector confidence.

### Task 1: Shared calculations and four visual tools

Files: create `src-tauri/src/telemetry/advanced.rs` and its unit tests; worker owns this file only.
Interfaces: `analyze(&Session, &Analysis, &AdvancedRequest) -> Result<AdvancedResult,String>`, public serde request/result types. Session may already contain derived channels. Existing Analysis supplies shared reference mappings.
- [x] Write failing tests for gap alignment, acceleration conversions, source-time mapping, empty/missing channels and uneven-cadence histogram weighting.
- [x] Observe red with offline cargo test; implement alignment, composable filters, G-G, scatter, histogram and supported full-precision summaries; run green tests.
- [x] Add red tests for measured/inferred shifts and low-RPM candidates including noise, braking and gaps; implement conservative detectors with source-time identities and evidence labels; run green full suite.
- [x] Inventory both real XRKs without modifying them; expose units/cadence/limits in diagnostics.

### Task 2: Restricted expressions

Files: create `src-tauri/src/telemetry/expressions.rs` and unit tests; separate worker owns this file only.
Interfaces: public serde `Formula { id, name, expression }`; `evaluate(&Session, &[Formula]) -> Result<Vec<Channel>,String>`. Syntax uses `[stable-channel-id]`, unit-bearing constants and explicit conversion functions. Null results are represented by nonfinite internal values and explicit invalid-span handling before serialization.
- [x] Red tests for arithmetic/precedence, unit compatibility, conversion, derivative reset across gaps, invalid domains/division, unknown references, circular dependencies and bounded input.
- [x] Implement safe AST/dimension evaluator and dependency graph; observe targeted green and full suite.

### Task 3: Persistence, IPC and integration

Files: parent owns `library.rs`, `lib.rs`, `telemetry/mod.rs`, `src/bridge.ts`, `src/types.ts`, `src/workspace.ts`, `src/advancedState.ts` and persistence tests.
Interfaces: `analyze_advanced(sessionId, primaryId, comparisonId, axis, request, formulas)`; existing `analyze_session` receives optional formulas. Source-version check precedes cache lookup. Return serializable nullable unavailable values.
- [x] Red frontend tests for old workspace, preset CRUD/default/last-used, formula preservation and unsupported schema protection.
- [x] Implement bounded versioned advanced state and reuse atomic workspace saves. Add bounded Rust advanced caches keyed by source/settings/boundaries.
- [x] Red integration tests for formula channels in ordinary charts, real-XRK responses, restart persistence and stale-source rejection; implement and run green.

### Task 4: Cohesive interactive workspace

Files: parent owns `src/Advanced.tsx`, `src/AnalysisCanvas.tsx`, `src/App.tsx`, `src/Plots.tsx`, `src/Track.tsx`, `src/styles.css`, browser harness and interaction tests.
- [x] Write browser assertions for advanced navigation, point/event selection to shared plot/map cursor, filters, scale controls, formula CRUD and preset persistence.
- [x] Implement compact tool/preset controls, contextual options, resizable panels, canvas inspection/zoom/pan, numerical summaries, sortable/excludable event tables and explicit unavailable states.
- [x] Feed source-derived channels into ordinary picker/plots; show event markers and interval highlights on plots/maps; observe browser green.

### Task 5: Acceptance and delivery

Files: tests, `PROGRESS.md`, `README.md`; parent owns acceptance.
- [x] Run frontend/Rust suites, existing browser checks, new real-XRK advanced checks and production build; fix regressions with red-green tests.
- [x] Build native Apple Silicon app and exercise real import, all tools, themes, synchronization, formulas, presets and restart. Measure representative processing/interactions.
- [x] Obtain independent read-only integrated review and resolve material findings; rerun affected checks.
- [x] Recheck telemetry hashes/untracked status, document actual evidence/limitations, commit meaningful changes and push origin/main without force.

## Execution record

User explicitly approved the design and directed implementation without another approval except material architectural changes. Work in the existing repository as requested; no extra worktree. Parallel workers implement independent numerical/formula modules, parent owns integration. This user-directed execution takes precedence over skill handoff pauses and sequential-only delegation guidance.
