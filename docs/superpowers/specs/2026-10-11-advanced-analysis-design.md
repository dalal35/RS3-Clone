# Milestone 5: Advanced Analysis design

Status: approved by the user; implemented for Milestone 5.

## Intent and scope

Deliver all seven requested analysis features in the existing native Apex Telemetry app, using locally imported real XRK telemetry. Preserve Milestones 1–4, existing layouts, shortcuts, import, persistence, spatial comparisons, corner editing and themes. Stop before AI Race Engineer. Original telemetry files remain unchanged, ignored, untracked and local.

The starting repository is `aba9534`. Rust already owns numerical analysis and atomic JSON persistence; React, TypeScript and uPlot own presentation. Keep these boundaries and add no dependencies unless an identified requirement cannot reasonably be met with existing tools.

## Architecture choice

Recommended: a shared Rust advanced-analysis engine, exposed through the existing serialized background library operations, with reusable React visualization components. This preserves source validation, numerical precision and one missing-data policy. A frontend-only engine would duplicate numerical rules and burden the UI thread. Separate engines for each tool would make filtering, timestamp alignment and uncertainty inconsistent.

Add focused modules under `src-tauri/src/telemetry/advanced/` for alignment and filters, statistics, events and formulas. Add typed request/response contracts in Rust and TypeScript. Requests identify source session, selected laps, active tool, channels, filters, detector settings and formulas. Responses identify source content version, parameter identity, per-lap data and explanatory availability/uncertainty notes.

Use `Library`'s validated parsed-session cache, never parse XRK again in a tool. Run calculations through the existing blocking-task boundary. Bound derived-result caches and key them by source content version, laps, source channels, formulas, filters, corner-boundary revision and calculation parameters. Refresh/remove invalidate source-dependent results. Presentation-only settings do not invalidate numerical results. Ignore stale asynchronous responses after selection or parameter changes.

## Shared numerical and interaction contract

- Original channel timestamps are authoritative for alignment, derivatives, event durations, recovery times and time weighting. Existing display-series coordinates are not source time.
- Keep source timestamp, lap identity and optional shared display position on points/events. Map source time through validated per-lap reference mappings. An unavailable mapping remains unavailable; normalized progress never silently substitutes for physical alignment.
- Continuous channels use bounded, gap-aware linear interpolation within source coverage. Discrete channels such as gear use bounded held values. Apply one cadence/outage policy across advanced tools and derived channels; expose sparse or uncertain cadence rather than extrapolating.
- Never interpolate across declared/inferred outages, bridge invalid samples, extrapolate beyond coverage, or turn missing/invalid results into zero. Derivatives require supported neighbors in the same continuous span.
- Filters compose selected laps, corner/reference interval, time/distance range and optional channel-value constraints. Evaluate corner/range membership through the same mappings as existing analysis. Withhold unsupported physical filters with an explanation.
- Numerical calculations use every supported sample/interval. Visualization downsampling preserves source identities and extrema; inspection and event summaries use full precision. Record dropped/unavailable coverage where it affects interpretation.
- Keep the existing cyan primary and amber comparison colors in all tools. Extend `Plots` to accept controlled cursor updates with a reentrancy guard. Map clicks, scatter clicks and event rows update the same cursor as the telemetry graphs. Unmapped samples remain inspectable without inventing a map location.

## Workspace design

Add an unobtrusive Telemetry / Advanced workspace selector alongside the current controls. Advanced is one cohesive workspace with a tool selector, compact preset selector, shared lap/filter bar, resizable main visualization and contextual inspector. Reuse the session/lap sidebar, track map, corner selection and theme tokens.

Provide tools for Traction, Shifts, RPM recovery, Scatter, Distribution and Formulas. Presets configure these tools; they are not a separate disconnected page. Keep an RPM/channel context plot available beside or beneath advanced views for event inspection and shared cursor feedback. A drag divider adjusts panel size; persist layout. Controls and legends state units, data coverage and inference status. Disabled tools explain exactly which channels or mappings are missing.

Use a reusable canvas/SVG visualization surface as appropriate for efficient scatter and histogram rendering, with resize observation, pointer inspection, click selection, wheel zoom, drag pan and reset. Reference-grid and axis settings belong to the current tool. Provide numerical inspector values and accessible labeled controls.

## G-G traction circle

Select longitudinal and lateral acceleration channels explicitly; suggest channels only when names and units support identification. Convert supported acceleration units using standard gravity 9.80665 m/s². Permit axis swapping, sign reversal and explicit user offsets, retaining provenance and displaying calibration/orientation uncertainty. Unknown units disable conversion. No automatic gravity removal or grip claim.

Plot lateral g on X and longitudinal g on Y, overlay selected laps, support speed coloring, shared filters, cursor highlighting, inspection, zoom/pan and configurable reference spacing. Compute signed extrema and labeled absolute percentiles on full aligned data. Distinguish raw accelerometer measurements from verified vehicle-frame acceleration; gravity contamination and mounting uncertainty stay visible.

## Shift events

Prefer stable, valid integer gear transitions with debounce and continuous source coverage. Label these measured gear changes. Otherwise detect conservative RPM interruption/recovery candidates using configurable sensitivity, speed trends and available throttle/braking evidence; label direction and evidence as inferred or uncertain.

Report source timestamp, mapped position, RPM before/after and signed change. Report interruption duration only when supported start/recovery samples exist; do not equate an RPM transition window with mechanical shift duration. Flag unusual interruptions or possible missed shifts as candidates. Do not infer gear count, fixed ratios or shift RPM. Ratio/state estimates require sufficiently separated stable RPM/speed clusters and adequate coverage; otherwise omit them with a reason.

Render event markers on RPM context plots and the GPS map. A sortable, lap-colored table selects the shared cursor and permits persistent false-positive exclusions. Exclusions are keyed to source version, lap, event kind and stable source-time identity, so source refresh cannot apply stale exclusions.

## RPM recovery candidates

Default threshold 8,200 RPM; configurable minimum duration and recovery criteria. Detect continuous low-RPM intervals during supported moving/accelerating conditions, suppress braking, idling, outages and unsupported edge intervals. Use available throttle, gear and acceleration evidence without assuming any exists.

Report duration, minimum RPM, recovery time when observed, affected corner and position when mapped, evidence and uncertainty. Without throttle, consistently label events low-RPM recovery candidates, never confirmed bogging. Support threshold/event filters, exclusions, per-lap summaries, RPM interval shading, map highlights and click synchronization.

## Scatter and distributions

Scatter accepts any supported numerical source/derived channels. Align explicitly in source time without oversampling statistics; preserve original units and identities. Support lap/speed/RPM coloring, contextual channel filters, linear/log scales, finite manual axis ranges, tooltips and click synchronization. Log axes exclude nonpositive values with visible counts. Offer useful RPM/speed and acceleration pair suggestions without requiring them.

Histograms use common bin edges across laps, configurable count or width and percentage/count modes. Default to time-weighted occupancy, integrating supported clipped source intervals and splitting at filter/bin boundaries; never count outages as time. Clearly distinguish sample count from supported duration. Show min/max, mean, median and percentiles under the chosen weighting policy, with coverage and excluded-value counts. Constant channels and empty selections have defined non-crashing behavior.

## Safe mathematical channels

Implement a restricted Rust lexer/parser and AST evaluator; no arbitrary code evaluation. Use stable channel IDs in formulas and expose a searchable insert picker. Support numeric constants, parentheses, unary signs, arithmetic, comparisons, common functions (`abs`, `sqrt`, `min`, `max`, `clamp`, dimensionless trigonometric/log functions), explicit compatible conversions and a gap-aware time derivative for RPM change rate.

Track dimensions and conversion scale independently of display units. Addition/subtraction/comparisons require compatible dimensions; multiplication/division combine them; square root and other functions validate their dimensional inputs. Bare constants are dimensionless; provide explicit unit-bearing constants/conversions for thresholds and examples. Unknown units permit raw display but block operations requiring an unverified conversion.

Validate syntax, references, dimensions and dependency cycles before save. Limit formula length, AST depth, operation count and formula count. Division by zero, invalid domains, overflow and unsupported source alignment return missing values, not chart contamination. Dependent formulas use a topological order and the shared alignment/gap policy.

Support create/edit/duplicate/rename/delete with dependency-aware errors. Persist stable ID, name, expression, output unit and metadata at session level, independently of presets; switching presets never deletes formulas. Derived channels appear in the ordinary channel picker and charts as well as scatter/distributions, using the existing analysis path after safe evaluation. Deleting a referenced formula requires resolving dependencies; missing source channels produce availability notes rather than destroying formulas.

## Persistence and compatibility

Store a versioned `advanced` section in existing per-session workspace JSON, retaining manifest version 1 and its atomic-save/backup/source-version safeguards. Old workspaces restore advanced defaults without changing existing fields. Validate nested values and bound collections to respect the 64 KiB workspace limit; surface save-limit failures without silent truncation. Preserve unknown newer advanced versions without overwriting them.

Persist active tool, channels, scales/ranges, coloring, grid/orientation settings, detector thresholds, filters, layout, formulas, exclusions, presets, default preset and last-used preset. Session-scoped presets avoid pretending channel IDs are portable between recordings. Built-ins: Overview; Traction and Handling; Shifting; RPM and Engine Performance; Corner Analysis. Users can create, rename, duplicate and delete custom presets and choose a default. Last-used wins on ordinary restoration; default is used for initial entry. Built-ins remain recoverable. Missing channels leave the preset intact and show a repairable unavailable selection.

Retain existing changed-content Refresh semantics: refreshing modified source bytes explicitly resets content-bound workspace state, including advanced presets, formulas and exclusions. Explain this consequence before the user invokes Refresh on modified content. Refreshing unchanged bytes preserves preferences. This avoids silently rebinding formulas to changed channel identities; portable export/sharing is outside this milestone.

## Delivery and validation

Implement in the user's requested order, sharing foundational alignment/filtering first. Parent owns contracts, integration and numerical acceptance. Use at most two concurrent workers with separate file ownership; use read-only advice before consequential contract choices and independent acceptance review after stable integration.

Use synthetic signals only for isolated tests: acceleration conversion/orientation, shifts and noise/braking suppression, low-RPM recovery, gaps and heterogeneous cadence, histogram weighting/filter clipping, expression grammar/dimensions/domain failures/cycles and persistence migration. Add frontend state/cursor tests and browser interactions for every tool, exclusions, formulas, presets and restoration. Retain existing plot/workflow regressions.

Acceptance runs frontend and offline Rust tests, existing and new browser checks, production frontend and native arm64 builds, and actual native real-XRK import/interactions/restart where supported. Profile representative real-data calculation and interaction timings. Inspect actual source channel names, units and cadence; missing gear/throttle/G channels must produce honest unavailable or inferred outcomes. Real-data event outputs establish exercised behavior, not independent ground truth for mechanical shifts or bogging.

Recheck original fixture SHA-256 and ignored/untracked status. Update PROGRESS.md with observed evidence, limitations and exact remaining work. Commit only relevant source/tests/docs, push to origin/main without force when host permissions allow, and report any blocked delivery step precisely. Milestone 5 is not complete until all required features, checks and permitted delivery steps are finished.

## Observed baseline and design review

Read-only baseline: 18 frontend tests and 34 Rust tests pass (23 numerical, 7 library, 4 real-XRK); existing upstream binrw warning remains. Both originals are ignored/untracked and their hashes match PROGRESS.md. Existing diagnostics establish RPM and GPS speed but do not expose the full channel inventory or source cadence; full inventory is required before implementing channel-role suggestions.

Independent read-only architecture advice supports the Rust/React boundary and session-scoped presets. Incorporated cautions include original-time calculations, controlled cursor propagation, missing-sample provenance, bounded storage, formula independence from presets and explicit changed-source refresh semantics. Mechanical shift and bogging ground truth remains unavailable unless independently supplied; no acceptance claim will imply otherwise.
