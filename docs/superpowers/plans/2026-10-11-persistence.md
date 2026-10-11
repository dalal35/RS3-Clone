# Milestone 4 Implementation Plan

> **For agentic workers:** Use Codex Orchestrator with at most two workers. The user approved direct execution; no further planning gate.

**Goal:** Persist the local session library and useful workspace, with safe file lifecycle controls and editable corner boundaries.

**Architecture:** Rust owns an atomic versioned manifest, content identity, memory cache and guarded section recomputation. React restores summaries/workspaces asynchronously and provides minimal library and track controls.

**Tech Stack:** Existing Tauri 2, Rust/Serde, locked SHA-256 dependency, React/TypeScript and uPlot.

**Spec:** docs/superpowers/specs/2026-10-11-persistence-design.md

## Global Constraints
- At most two workers; distinct backend/frontend file ownership.
- Never modify, move, upload or commit original data/ fixtures.
- No silent refresh, source deletion, raw telemetry persistence, AI or unrelated plots.
- Preserve GPS validity gates, same-position delta and original automatic sections.

## Review Focus
- Interrupted/corrupted saves retain recoverable valid state; unsupported schemas remain untouched.
- Same-size file changes and duplicate copies are distinguished by content identity.
- Late analysis/load/save responses cannot replace the newly selected session workspace.
- Plot construction/reset does not overwrite compatible restored zoom.
- Corner edits preserve ordered full-lap partitions and guarded comparison metrics.

### Task 1: Rust library and corner override contract
**Files:** src-tauri/src/library.rs (new), src-tauri/src/lib.rs, src-tauri/src/telemetry/{mod,spatial}.rs, Rust tests and examples.
**Interfaces:** Tauri library_snapshot, load_library_session, remove_library_session, refresh_library_session, locate_library_session, save_workspace, set_corner_boundaries. Snapshot contains entries, activeSessionId, warnings; entries contain id/source/name/driver/track/recordedAt/lapCount/channelCount/status/workspace. Workspace is JSON; corner boundaries are number[] interior meters or null for automatic. Existing import_session returns Session; analyze_session retains existing arguments and applies stored overrides.
- [ ] Write failing lifecycle/recovery and corner invariant tests, run and record failure.
- [ ] Implement atomic manifest, SHA-256 identity, asynchronous commands and cached loading.
- [ ] Implement validated meter overrides before guarded section metrics.
- [ ] Run complete Rust suite, including temporary copies of both real fixtures.

### Task 2: Frontend library and workspace
**Files:** src/{App,Track,Plots,Segments}.tsx, src/{bridge,types,telemetry}.ts, styles, new workspace helpers/tests and browser interaction tests.
**Interfaces:** Consume Task 1 commands; workspace stores primary/comparison/channel order/axis/units/layout/compatible zoom. Coordinate exact command shapes before implementation.
- [ ] Write failing tests for workspace compatibility, unit conversion and boundary interactions.
- [ ] Implement asynchronous restore, recent library/status/locate/refresh/remove controls and ordered save handling.
- [ ] Implement plot zoom restore, units/layout and track handles/reset.
- [ ] Run full frontend tests/build and real-XRK browser interactions.

### Task 3: Integrate, verify, review and deliver
**Files:** README.md, PROGRESS.md and bounded integration fixes.
- [ ] Verify original hashes; run frontend/Rust/integration tests and native macOS build.
- [ ] Actually launch, import, edit, quit and reopen native app; verify workspace/library/corner state and session switching.
- [ ] Obtain independent read-only acceptance review; correct demonstrated blockers and rerun affected checks.
- [ ] Update PROGRESS.md with observed evidence and limits; commit verified functionality, push origin and stop.

## Rulings
- Work in the clean existing checkout; no separate worktree needed for disjoint worker ownership.
- Reuse prior advisor findings on content identity, atomic JSON and meter-coordinate boundaries; approved by user.
- User explicitly overrides additional skill planning approval gates and authorizes commit/push.
