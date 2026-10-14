# Reversible Session Merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select same-day XRKs and reversibly analyze their laps together without changing recordings or original settings.

**Architecture:** Persist virtual merge definitions referencing immutable source identities and hashes. Route each lap's analysis and video through its original source, using a common spatial frame only for comparisons. Keep merged settings separate and source sample buffers shared.

**Tech Stack:** Existing Rust, serde/serde_json, SHA-256, Tauri 2, React/TypeScript, Vitest, and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-session-merging-design.md`, formally approved at `528e436` on 2026-10-14.

## Global Constraints

- Add no dependencies, database, upload, or broad refactoring.
- Never write to `data/` or original XRK files.
- Preserve the existing unrelated working-tree changes.
- Use Codex Orchestrator with at most two workers and an independent acceptance review before delivery.
- Do not concatenate, shift, resample, or cache a second copy of source channel timelines.
- Preserve all source laps, including partial laps and possible duplicates.
- A missing or modified member makes the merge unavailable as a whole.
- Commit only verified feature changes and push to `origin/main`; exclude unrelated changes and all `data/`.

## Review Focus

1. A source changes between preview and confirmation: creation must reject the stale preview (Task 2).
2. Two sources reuse both lap and channel IDs: selections/results must retain source provenance (Tasks 1, 3).
3. An original video state uses a future schema: preserve its opaque payload through merge/reopen/unmerge (Tasks 2, 4).
4. Resetting an inherited corner override: use automatic boundaries in the merge and preserve the original override (Tasks 2, 3).
5. Unmerge races a queued save or video callback: do not recreate the merge or switch to a different source (Tasks 4, 5).

## File map and execution

Create `src-tauri/src/merging.rs` for metadata/identity/preview types and validation;
`src-tauri/tests/merging.rs` for merge integration tests; `src/merging.ts` and
`src/merging.test.ts` for pure UI source/selection adapters; and a focused
`src/SessionMerge.tsx` preview component. Extend existing library, IPC, numerical,
workspace, and video files only at their existing responsibilities. Extend
`scripts/verify-workflow.mjs` and video integration fixtures rather than adding
another browser harness.

Parent owns contracts/integration and implements the dependent sequence. Use one
worker for bounded read-only advice if new evidence changes a decision and one
independent acceptance reviewer after integration; never more than two concurrent
workers. Reuse the existing architecture advice. This is parent-led execution,
not a fresh implementation delegate for every task.

At execution start load executing-plans, TDD, worktree, and verification guidance.
Record the dirty baseline and relevant baseline checks. Follow worktree guidance
without losing user changes or omitting their dependencies from validation. Use
path/hunk staging against that baseline for mixed files; never `git add .`.
Each task ends with its focused checks and a feature-only commit. No product
implementation begins until the user reviews this plan.

### Task 1: Source identities, timestamp proof, and merge preview

**Files:** Create `src-tauri/src/merging.rs`; modify `src-tauri/src/lib.rs`,
`src-tauri/src/telemetry/mod.rs`, `src/types.ts`; tests in `merging.rs`.

**Interfaces:**
- `SourceRef { session_id: String, content_version: String }` (camelCase JSON).
- `RecordingStamp { day: String, seconds_from_midnight: u32 }`; no UTC/timezone inference.
- `LapRef { source_session_id: String, source_lap_id: String }`.
- `qualified_lap_id(source: &str, lap: &str) -> String`: encode the pair with JSON, avoiding delimiter collisions.
- `parse_recording_stamp(recorded_at: &str) -> Result<RecordingStamp, String>`.
- `preview_sources(sources: &[&Session], refs: &[SourceRef]) -> Result<MergePreview, String>`.
- `MergePreview { sources: Vec<SourceRef>, day: String, laps: Vec<MergedLap>, channels: Vec<MergedChannel>, warnings: Vec<String>, preview_version: String }`.
- `MergedLap` retains original Lap fields plus `LapRef`, qualified ID and display number; `MergedChannel` has a qualified ID, name/unit and explicit source/channel bindings. Source IDs never match channels by themselves.

- [ ] Read the pinned parser's metadata/timecode implementation and existing read-only fixture outputs to establish exact log-date/time format and start-time semantics. Record the evidence in a brief code comment and regression fixture. Only evidence-backed formats enter `parse_recording_stamp`; unsupported or ambiguous strings return an error. If start semantics cannot be established, retain the spec's explicit merge refusal rather than guess.
- [ ] Write unit tests `recording_stamp_validation`, `preview_preserves_sources`, and `preview_warns_without_deduplication`. Assert valid leap days parse; invalid calendar/time values, ambiguous dates and missing fields fail; different days fail; duplicate source selection normalizes; fewer than two sources fails; all partial/coincident laps remain. For each lap assert `(start,end,duration,source_lap_id)` equals the original. Assert ordering uses recording start plus lap start with source/lap ID tie breaks, independently of selection order. Assert channel-index collisions never imply a match; duplicate name/unit matches remain distinct.
  Core assertions: `assert_eq!(preview.laps.len(), a.laps.len() + b.laps.len());` and `assert_ne!(qualified_lap_id(&a.id, "lap-1"), qualified_lap_id(&b.id, "lap-1"));`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --offline merging`; observe the new assertions fail before implementing preview functions.
- [ ] Implement the interfaces and merge warnings. Preview hash covers ordered source IDs/hashes and validated metadata; return descriptors without sample arrays. Warn on interval overlap, possible duplicates, track/driver/session conflicts and unverified device clocks.
- [ ] Rerun the focused tests and `npm run build`; require passing assertions/type checks, then commit only Task 1 changes.

### Task 2: Atomic virtual persistence and reversible lifecycle

**Files:** Modify `src-tauri/src/library.rs`, `src-tauri/src/lib.rs`,
`src/bridge.ts`, `src/types.ts`; create `src-tauri/tests/merging.rs` and extend
`src-tauri/tests/library.rs`.

**Interfaces:**
- `MergeDefinition { id, name, sources: Vec<SourceRef>, workspace: Option<Value>, corners: HashMap<String, Option<Vec<f64>>> }`; `None` corner value is an explicit automatic-boundary override, absent key inherits original.
- Manifest v2 adds `merges: Vec<MergeDefinition>`; read v1 as no merges and write v2 on first merge. Continue rejecting unsupported newer versions before recovery/overwrite.
- `Library::preview_merge(&mut self, session_ids: &[String]) -> Result<MergePreview,String>`.
- `Library::merge(&mut self, session_ids: &[String], preview_version: &str, acknowledge_warnings: bool) -> Result<Session,String>`.
- `Library::unmerge(&mut self, merge_id: &str) -> Result<LibrarySnapshot,String>`.
- IPC `preview_merge_sessions`, `merge_sessions`, `unmerge_session`; bridge `previewMergeSessions(ids)`, `mergeSessions(ids, previewVersion, acknowledgeWarnings)`, `unmergeSession(id)` mirror these results.
- Extend `Session`/`LibraryEntry` with optional merge provenance/member status; existing load/save/analyze commands accept merge IDs. Merge content version hashes its pinned source references. Persist video maps in the merged workspace defined in Task 4, not a second raw store.

- [ ] Write `merge_reopen_unmerge_preserves_originals`, `merge_missing_locate`, `merge_stale_preview`, `merge_dependency_policy`, `merge_schema_recovery`, and `merge_settings_bounds` integration tests. Assert original workspace/corner/video JSON equality before/after; raw samples absent from manifest; active merge restores; missing/changed members block full load while unmerge works; matching Locate recovers; changed hash at confirmation fails; referenced removal/content-changing refresh fail; same-content refresh succeeds. Reject duplicate/dangling/nested references and malformed hashes. Cover v1 migration, future-version protection, corrupt primary/valid backup, interrupted temp file, explicit corner-reset tombstones, opaque future video payload retention, and the existing 65,536-byte aggregate workspace limit.
  Core assertions: `assert!(library.merge(&ids, &stale_preview_version, true).is_err());` and `assert_eq!(original_entries_before, original_entries_after);` after excluding expected last-used/active-selection changes.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --offline --test merging`; observe failures for the new behavior.
- [ ] Implement manifest/IPC/bridge integration. Load merge members through validated source references, preserve originals as visible entries, report member-specific missing/modified errors, and persist no incomplete merge. Unmerge deletes only derived state and chooses an available original. Validate workspace versions before queued saves. Use `Arc<Session>` in the private original cache with borrowed/shared access for merge resolution; no materialized merged sample cache. Existing ordinary-session responses remain compatible.
- [ ] Run library and merging integration tests plus `npm run build`; require passing results and source-file byte equality, then commit only Task 2 changes.

### Task 3: Source-routed graphs, spatial comparison, and advanced analysis

**Files:** Modify `src-tauri/src/telemetry/{mod.rs,spatial.rs,advanced.rs,expressions.rs}`, `src-tauri/src/library.rs`; tests in
`src-tauri/src/telemetry/tests.rs`, `src-tauri/tests/{merging.rs,advanced.rs}`.

**Interfaces:**
- `LapSource<'a> { session: &'a Session, lap: &'a Lap }` and `ChannelBinding { output_id: String, primary_id: Option<String>, comparison_id: Option<String> }` in `telemetry/mod.rs`.
- `analyze_sources(primary: LapSource<'_>, comparison: Option<LapSource<'_>>, axis: &str, channels: &[ChannelBinding], boundaries: Option<&[f64]>) -> Result<Analysis,String>`; existing `analyze_with_boundaries` becomes a same-source wrapper.
- `spatial::align_sources(primary: LapSource<'_>, comparison: Option<LapSource<'_>>) -> Result<Geometry,String>` uses one primary GPS origin and independent source fixes. Segment metrics/track sampling receive the applicable source explicitly.
- `advanced::analyze_sources(primary: LapSource<'_>, comparison: Option<LapSource<'_>>, analysis: &Analysis, request: &AdvancedRequest, channels: &[ChannelBinding]) -> Result<AdvancedResult,String>`; preserve the existing wrapper.
- Library resolves merged IDs, channels and formulas per source and remaps result lap/channel IDs to qualified/output identities. Formula evaluator retains its existing API; prepare only derived buffers required by the selected sources, never clone full raw recordings to rename IDs.

- [ ] Write `cross_source_analysis_isolated`, `cross_source_spatial_parity`, `cross_source_channel_gaps`, `cross_source_formulas`, `cross_source_advanced_provenance`, and `merged_corner_reset_inheritance`. Use identical local timestamps/IDs but deliberately different values in the sources. Assert each series/stat/event uses its owning source, sourceTime is unchanged, output IDs are qualified, and same-source results equal existing calls. Known synthetic GPS geometry must preserve spatial delta/section sums in both axes. Missing/ambiguous/unit-conflicting channels remain unavailable; missing formula dependencies affect only that source while invalid syntax/cycles still fail. Conflicting track labels with invalid GPS withhold delta/corner comparison metrics. Prove reset uses automatic merge boundaries without changing original overrides.
  Constant-source fixture assertions: `assert!(result.primary.series[0].values.iter().all(|v| *v == 10.));` and `assert!(result.comparison.as_ref().unwrap().series[0].values.iter().all(|v| *v == 20.));` despite identical source-local timestamps.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --offline cross_source` and the corner test filter; observe the added tests fail.
- [ ] Implement source routing and unique name/unit bindings. Preserve all existing spatial validity gates, fallback warnings and single-source behavior. Prepare advanced gap data for only the selected source/lap context, without whole-recording raw clones. Include both source hashes and boundary/formula/configuration state in analysis cache keys; revalidate files on cache hits.
- [ ] Run full Rust numerical/library/merge/advanced tests; require no regression and explicit parity assertions, then commit only Task 3 changes.

### Task 4: Source-specific video and merged workspace adapters

**Files:** Create `src/merging.ts`, `src/merging.test.ts`; modify
`src/workspace.ts`, `src/video/{state.ts,model.ts,useVideoSync.ts,VideoWorkspace.tsx}`;
tests in existing workspace/video test files.

**Interfaces:**
- `Workspace.sourceVideos?: Record<string, ReturnType<typeof restoreVideoState>>`; serialize/restore per original source session ID/content version. Existing `Workspace.video` remains the ordinary-session field.
- `videoSourceContext(session: Session, primaryId: string): {sourceSession: Session; sourcePrimaryId: string; toMergedLapId: (id:string)=>string} | null` in `src/merging.ts`; source-only descriptors suffice, with original lap IDs/timecodes and source hash. Ordinary sessions use identity mapping.
- Video state keeps original source `sessionId`/`contentVersion`; translate only lap identities when returning selection to the merged workspace. Thread source context into existing sync/component props; no synthetic global time coordinate.

- [ ] Write `merged_video_source_isolation`, `merged_video_source_switch`, `merged_video_future_state`, and `merged_workspace_roundtrip` tests. Assert equal source times cannot select another source's lap/media; no mapping shows attach state; switching primary source changes video context and invalidates old callbacks; playback changes laps only within its source. Assert inherited mappings/corners survive unmerge unchanged, future video JSON stays opaque, and aggregate oversize settings fail without truncation. Cover missing members and unavailable source context.
  Context assertions: `expect(context.sourceSession.id).toBe(sourceB.id)` and `expect(context.toMergedLapId('lap-1')).toBe(mergedLapB.id)` when B is primary; serialize/restore must preserve the source-video JSON exactly.
- [ ] Run `npm test -- src/merging.test.ts src/workspace.test.ts src/video`; observe the new isolation/roundtrip assertions fail.
- [ ] Implement adapters, per-source video persistence and active-source labeling. Pause/dispose the old controller/player on source changes, including pending seeks, before binding the new one. Guard late callbacks by source identity/hash and selection generation. Resolve channels/zoom/presets from active selected original when seeding the merged workspace, with explicit notice for incompatible transient selections. Serialize all source video states inside the existing bounded workspace.
- [ ] Rerun the focused tests and production frontend build; require passing results, then commit only Task 4 changes.

### Task 5: Multi-select, preview, merge/unmerge workflow

**Files:** Create `src/SessionMerge.tsx`; modify `src/App.tsx`, `src/styles.css`,
`scripts/verify-workflow.mjs`, `tests/video-integration.tsx`,
`scripts/verify-video-integration.mjs`.

**Interfaces:** `SessionMerge` receives selected ready original IDs, the bridge preview,
confirmation/cancel callbacks and busy state. `App` owns selection and uses Task 2
commands; Task 4 supplies the active video context. Existing source opening, lap
comparison and save/lifecycle queues remain authoritative.

- [ ] Extend browser assertions for checkbox keyboard selection, count/clear, preview totals/day/source names, warning acknowledgement, rejected dates, cancel without changes, merge/open/restart/unmerge and original workspace restoration. Test double submission and unmerge while saves/analysis/video replies are queued: no recreated merge, stale UI or cross-source selection. Test missing-member repair directions and visible source/lap/video labels. Run integration video assertions with overlapping source clocks and different media mappings.
- [ ] Run `npm run test:workflow` and `npm run test:video`; observe the new merge/source-isolation assertions fail before UI changes.
- [ ] Implement the compact preview and existing-style controls; disable nested/unavailable selection. Wait for pending saves, serialize lifecycle mutations, revalidate confirmation server-side and ignore stale replies. Keep originals visible; expose Unmerge even for unavailable merges. Preserve original saved settings on every merge operation.
- [ ] Rerun workflow/video checks and `npm test`; require passing results, then commit only Task 5 changes.

### Task 6: Regression, native build, independent review and delivery

**Files:** Update `PROGRESS.md`; amend only affected feature files for review fixes.

- [ ] Run `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml --offline`, and `npm run test:plots`, `npm run test:workflow`, `npm run test:advanced`, `npm run test:canvas`, `npm run test:video`. Use the existing local Rust toolchain environment from README if needed. Require successful exit and inspect assertions/output; report existing baseline failures separately, never claim them passing.
- [ ] Run `npm run tauri build` with the same toolchain; require successful arm64 macOS bundle creation. Exercise the new merge/relaunch/unmerge UI using read-only originals or disposable copies outside `data/`, verifying original settings/source-specific video restoration and no XRK writes. Do not modify the user's persisted library for testing without preserving/restoring its exact prior state.
- [ ] Obtain independent read-only acceptance review of the stable integrated diff against spec, dirty baseline and test evidence. Resolve material findings and rerun affected checks; renew review if the corrections change uncovered contracts. Parent owns acceptance.
- [ ] Update `PROGRESS.md` with actual results, limitations and review verdict. Check `git diff --check`, feature-only commit content, unchanged unrelated hunks and absence of any `data/` paths. Commit verification notes; push verified commits to `origin/main` without force. Confirm push succeeded and report commit/build/test evidence.

## Planning self-review and handoff

Spec coverage: identity/date/order (Task 1); atomic definitions, source lifecycle,
recovery and reversibility (Task 2); analysis/channels/formulas/corners/memory
(Task 3); source-specific video/settings (Task 4); interface/races (Task 5);
regression/native acceptance/delivery (Task 6). Review Focus inputs each have
named tests. Interfaces use one qualified lap identity and original source times;
neither analysis nor video introduces a concatenated raw timeline.

The architectural spec is approved. This plan is awaiting user review. Preserve
the requested parent-led Codex Orchestrator execution method after approval;
use executing-plans for parent implementation and independent native workers for
bounded advice/review within the two-worker limit.
