# Milestone 4: persistence and workflow polish

Approved by the user on 2026-10-11, including direct execution without another planning approval.

## Intent and scope
Make Apex Telemetry an everyday native macOS application: reopening restores a useful workspace without repeated imports. Preserve all completed GPS alignment, lap comparison, channel-gap handling and conservative uncertainty behavior. Retain the modern minimal UI. Stop at this milestone; no AI, advanced plots or unrelated features.

## Storage and identity
Use versioned JSON in Tauri's application support directory, existing serde dependencies, and a recoverable backup. Serialize mutations; write and sync a temporary file in the same directory, atomically rename it, and preserve a valid previous generation. Corruption must be visible and recoverable, never silently replace a damaged library with an empty saved library. Unsupported schema versions must not be overwritten.

Persist source references, content fingerprints, summary metadata, workspace preferences and corner overrides, not telemetry sample arrays. Use SHA-256 from the existing locked dependency graph for stable content identity. Canonical paths and file size/mtime aid status reporting; content fingerprints establish compatibility. Cache parsed sessions in memory. File validation and parsing run off the UI thread; restore summaries before parsing the selected session.

Missing files remain in the library with Locate. Relinking matching content preserves workspace. Modified files are visibly unavailable until explicit Refresh; never silently refresh. Successful refresh invalidates incompatible overrides and analysis-specific workspace. Failed parsing preserves the existing entry. Duplicate bytes select the existing entry, including another path; removal deletes only library metadata/cache, never source files. Recent sessions are ordered by use.

## Workspace and interactions
Restore active session and per-session primary/reference and comparison laps, channel selection/order, speed units, distance/time axis, simple graph density/layout and compatible zoom. Zoom compatibility includes source version, both laps and axis; incompatible ranges reset. Invalid saved laps/channels receive useful defaults. Persist mutations in order; surface save failures. Cmd+O opens telemetry; Escape closes editing/popovers; reset zoom is discoverable.

Manual corner edits move shared interior boundaries on the track, with fixed start/end points. Persist ordered interior distances in primary reference-lap meters, scoped to file version, primary lap and segmentation schema. Validate finite ordered values, minimum spacing and partition compatibility in Rust. Recompute existing guarded metrics and time-axis coordinates from validated spatial mappings. Editing must never change recorded telemetry, alignment, delta or uncertainty gates. Disable incompatible editing; Reset to automatic removes the override.

## Evidence
Test actual file lifecycle using temporary copies of real XRKs: duplicate imports, same-size modification, missing/located files, refresh failures, safe remove, store reopen and corruption/backup recovery. Test edited section partitions, metric sums and unchanged alignment/delta. Run frontend, Rust and browser integration tests and a native macOS build. Actually quit/reopen the native app and inspect restoration, switching and corner edits. Original data/ XRKs must remain ignored and byte-identical. Record observed limits in PROGRESS.md, commit and push verified work.
