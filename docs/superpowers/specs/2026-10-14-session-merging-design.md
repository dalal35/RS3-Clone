# Reversible session merging

Status: written specification awaiting user approval.

## Purpose and scope

Allow a driver to select two or more imported XRK recordings from the same
recording day and analyze all their laps as one logical session. Preserve every
original recording, source identity, timestamp, lap duration, channel, GPS stream,
workspace, corner override, and video mapping. Merging is a library operation,
not an export or telemetry transformation.

Use the existing Rust library, atomic manifest storage, React session interface,
analysis algorithms, and video components. Add no dependencies, database, upload,
or broad refactoring. Never write to `data/` or original XRK files. Preserve the
existing unrelated working-tree changes. Use Codex Orchestrator with at most two
workers and an independent acceptance review before delivery.

## Existing constraints and selected approach

`library.rs` stores original file references, hashes, workspaces, and per-lap
corner overrides. `telemetry/mod.rs`, `telemetry/spatial.rs`, and
`telemetry/advanced.rs` currently assume both selected laps belong to one Session.
Channel IDs such as `channel-3` are file-local. Video currently selects laps by
source-relative time within a single session.

Use source-routed analysis with lightweight merged metadata. Do not concatenate,
shift, resample, or cache a second copy of source channel timelines. An approach
that builds a synthetic concatenated Session is rejected because overlapping
logger timecodes and file-local channel IDs can mix unrelated samples. Extend
the existing analysis entry points narrowly to accept a primary source/lap and
an optional comparison source/lap; single-source calls keep their current behavior.

## Identity and data model

An original session remains the authoritative owner of its samples and settings.
A merged lap has a stable identity derived from the pair (source session ID,
original lap ID), with explicit source session and original lap fields. Its start,
end, duration, completeness, and original lap number remain unchanged. A separate
display number orders laps within the merge. Same-source and cross-source lap
selection use the same visible workflow.

Merged session responses carry lap and channel descriptors, source provenance,
and warnings. They do not carry concatenated sample arrays. Cache original
parsed data once and borrow/share it where merged analysis needs it; avoid new
whole-recording clones in the merge path. Necessary plot/result arrays are allowed.

Channel identity includes its source. A comparison channel is matched only when
its recorded name and unit agree and the match is unique within each source.
File-local numeric IDs alone never establish equivalence. Keep ambiguous or
conflicting channels distinct. Source-only channels remain selectable, with an
explicit unavailable comparison series. Never invent values, silently convert
unknown units, or fill gaps from another recording. Formula dependencies resolve
through the source channel mapping; an unavailable dependency produces a disclosed
unavailable result for that source, while real formula validation errors remain errors.

## Recording date and chronological ordering

Validate XRK recording metadata obtained by parsing the actual source files before
preview and again before committing a merge. Never infer dates from filenames,
file modification times, or import order. Parse only documented/unambiguous
formats supported by the pinned XRK parser; validate calendar dates and times.
Reject missing, invalid, or ambiguous dates/times and mixed recording days.

Use the logger's recorded local calendar day, explicitly labeled as device time
without a verified timezone or independently verified clock. Do not manufacture
UTC timestamps. The supported log timestamp's meaning and relationship to lap
timecodes must be confirmed from the pinned parser before coding ordering logic.
Use recording start plus original source-relative lap start for chronological
ordering. Break equal-time ties deterministically by source ID and lap ID.
Keep this ordering coordinate separate from the unchanged original timecodes.
Do not claim the recording date is reliable if the supported metadata cannot
establish that relationship; block the merge with an actionable explanation.

Preview and retained merge warnings disclose overlapping recording/lap intervals,
coincident lap starts and durations (possible duplicates), conflicting driver or
session metadata, missing/unknown tracks, and conflicting track names. Preserve
all source laps, including partial laps and possible duplicates. Repeated
selection of the same source ID does not add it twice; reject fewer than two
distinct sources. Existing content-hash import deduplication remains unchanged.

## Analysis compatibility

Resolve each selected lap against its original source and validate source bytes
before analysis, including cache hits. For cross-source spatial comparison,
extract each lap's GPS and supporting channels from its own source, then project
both trajectories into a common metric frame using the primary reference.
Reuse existing fix-quality, coverage, heading, start/finish, separation, length,
gap, and uncertainty checks. Corner boundaries and metrics follow the primary lap.

Conflicting track labels require acknowledgement during merge preview and remain
visible. They never authorize a claimed spatial match. Failed geometry checks
retain existing estimated/unavailable behavior and explanations. Where track
metadata explicitly conflicts, withhold cross-source delta and corner comparison
metrics unless spatial validation establishes compatibility; independent lap
plots remain available. Unknown labels alone do not override valid GPS evidence.

Ordinary graphs, time/distance axes, cursor mapping, comparisons, manual corners,
advanced plots, distributions, events, and formulas operate on source-routed data.
Advanced points and events keep source-local times and source-qualified lap IDs.
Missing channels produce gaps or explicit unavailable results. Cache keys include
both source identities/content hashes, merge identity, parameters, formulas, and
applicable boundary overrides. Do not reuse results across different sources.

## Settings, corners, and video isolation

Merge creation waits for pending workspace saves. Original workspaces, presets,
formulas, zoom, lap selections, corner overrides, and video states remain unchanged.
The merge has its own workspace and corner overrides keyed by qualified lap ID.
Seed its analysis preferences from the active selected original, remapping valid
lap/channel references; discard only merge-incompatible transient selections with
an explanation. Inherited original corner overrides remain effective unless the
merge has a local override; reset restores automatic boundaries in the merge
without changing the original override.

Video remains source-specific. A merged workspace stores lightweight video state
per source, seeded from each original's saved mapping and edited independently.
Selecting a primary lap selects that source's video and mappings, with an explicit
source label. A source without a video mapping shows the existing attach workflow;
it never inherits another source's mapping. The same media file may be independently
attached to multiple sources only through explicit mappings for those sources.

Use a source-only session/lap context for video validation, coverage, markers,
seeks, and playback-to-lap selection. Translate IDs between original and qualified
lap identities at the boundary; do not translate original times. Playback can
select only laps from its current source. Changing source pauses/disposes the old
player/controller and invalidates pending asynchronous callbacks. Overlapping
source-relative times must never select an arbitrary first matching merged lap.
Existing ordinary-session video schema and mappings remain compatible.

Unmerge deletes only the derived definition and its derived settings, then selects
an available original with its saved workspace. Originals retain their settings
throughout; there is no settings overwrite or lossy reverse transformation.
Unmerge must also work when a source file is missing or changed.

## Persistence and source lifecycle

Extend the existing atomic manifest and backup workflow. Store merge ID, display
name, ordered distinct source references with expected content hashes, merge
workspace, local corners, source-specific video settings, and schema version.
Never persist raw telemetry. Advance the manifest schema when first persisting a
merge; read legacy version 1 manifests, migrate without losing original fields,
and retain the existing refusal to overwrite unsupported future schemas.
Apply existing bounded-settings validation to derived settings, with actionable
save errors rather than truncation. Unknown future video payloads remain opaque.

Restore merge entries and active selection on restart. A missing or modified
member makes the merge unavailable as a whole, with member-specific repair
instructions; do not silently analyze a reduced set of laps. Keep the definition,
references, and saved settings intact. Locate reconnects the original by hash and
restores the merge without changing its identity or settings.

Block removal of an original referenced by a merge and explain that the user can
unmerge first. Block a content-changing refresh of a referenced original for the
same reason; same-content refresh and hash-matching Locate remain allowed.
This keeps version-pinned definitions and original preferences consistent without
adding a second merge-repair workflow. No source lifecycle operation deletes XRKs.
Validate definitions for duplicate IDs/references, dangling references, nested
merges, and invalid hashes. Reject damaged definitions without overwriting their
manifest; use the existing backup recovery path where applicable.

## Session interface

Add an accessible selection checkbox to each ready original session entry, separate
from the button that opens it. Keep ordinary opening and lap comparison unchanged.
Show selected count, Clear selection, and Merge Sessions when selecting originals;
disable merge until at least two distinct ready sources are selected. Do not allow
nested merges in this feature.

Preview source names, validated recording day, total lap count, and specific
warnings before creation. Invalid dates or unavailable sources block creation.
Non-blocking compatibility warnings require an explicit acknowledgement in the
preview. Cancel changes nothing. Revalidate backend constraints at confirmation.

Label merged entries clearly and expose Unmerge in their existing library controls.
Keep original entries visible and usable. Show source labels on merged laps and
source-specific video controls. Missing merged members link users to their original
entries' Locate/Refresh guidance. Serialize merge/unmerge with existing lifecycle
and save queues, prevent double submission, and ignore stale analysis/player replies.

## Verification and acceptance

Add targeted Rust and frontend tests before implementation for:

- Same-day validation, invalid/ambiguous timestamps, different days, deterministic
  chronological order, unchanged source timecodes, overlapping intervals, retained
  duplicate candidates, partial laps, and source-qualified IDs.
- Conflicting file-local channel indexes, channel name/unit ambiguity, different
  channel sets, missing samples, and independent formula resolution.
- Cross-source spatial comparisons and corner metrics against known synthetic
  geometry, and parity with existing single-source analysis; advanced result/event
  provenance and unavailable-channel behavior.
- Merge creation, atomic save/reopen, active-session restoration, legacy migration,
  definition validation, stale versions, backup recovery, missing/located sources,
  modified files, and referenced-source removal/refresh policy.
- Unmerge with available and missing sources, exact preservation of original
  workspace/corners/video settings, no persisted raw arrays, and no materialized
  merged raw-session cache.
- UI selection/preview/acknowledgement/cancel, merge/restart/unmerge workflow, queued
  saves and stale results, and source-specific video with overlapping timecodes,
  source switching, late callbacks, and original mapping restoration.

Use synthetic fixtures and disposable files outside `data/` for mutation tests.
Existing original XRKs may only be read by established regression checks.
Run `npm test`, production frontend build, affected browser regressions (including
workflow, plots, advanced, canvas, and video), Rust tests, and the native macOS
Tauri build with the existing project-local toolchain where necessary. Obtain an
independent review of the integrated diff and resolve blockers with focused checks.
Update `PROGRESS.md` with observed checks and limitations. Commit only verified
feature changes and push to `origin/main`; exclude unrelated changes and all `data/`.

## Required handoff

The user has approved the architectural direction. Approval of this written spec
is still required by the installed brainstorming skill. After that approval, use
the installed writing-plans skill to produce a short executable implementation
plan, obtain its required review/execution choice, and then implement through
verification, review, commit, and push. No product implementation is authorized by
the current spec-writing stage alone.
