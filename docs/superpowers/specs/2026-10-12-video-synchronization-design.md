# Milestone 6: Video synchronization specification

Status: architecture approved on 2026-10-12; written specification awaiting user review. Implementation has not started.

## Purpose and scope

Let a karting driver analyze onboard footage alongside the existing Apex Telemetry graphs and GPS trace. Videos may omit pit stops or entire driving periods, while individual recorded laps remain intact. A few independent segment anchors must be sufficient to align a typical edited practice video.

Support official YouTube IFrame API playback and locally referenced MP4/MOV files. Preserve all existing imports, comparisons, advanced analysis, formulas, presets, corner overrides, themes, shortcuts and JSON persistence. Never modify, delete, upload or commit original telemetry or local videos. Stop after Milestone 6; exclude cut detection, audio matching, computer vision and AI analysis.

The starting repository is `fe15e6e` on `main`. Extend existing React/TypeScript, uPlot, Tauri 2 and Rust infrastructure without adding a player framework or unrelated refactoring. Use at most two concurrent workers; parent owns contracts, integration, acceptance and delivery.

## Architecture and ownership

Add a pure TypeScript synchronization model, a small source-neutral playback contract, HTML video and YouTube adapters, and a video workspace component integrated into `App`. Keep timing conversion independent of React and actual players so deterministic simulated clocks can test it.

The common playback contract exposes asynchronous readiness, play, pause, seek, current time, duration, playback rate, supported rates, state/error notifications and disposal. Seek requests carry a generation and resolve only after completion or a visible timeout/failure. Adapters handle source-specific behavior; synchronization consumes their clock/state rather than assuming a uniform event cadence. Dispose listeners, timers, pending operations and stale callbacks on source/session changes.

Rust handles local file validation, selected-file authorization and existing atomic workspace persistence. Video decoding and streaming belong to the native WebView/player, never the telemetry parser or serialized library task queue. No large file reads, hashing of whole videos, copying videos into the library, synchronous waits or per-frame IPC.

Reuse existing lap boundaries, per-lap position/time mappings, content versions, queued saves and plot cursor guards. Preserve approved independent advisor findings: absolute session time must outlive asynchronous lap analysis; hover cannot serve as a seek event; native YouTube identity must be tested rather than inferred from browser success.

## Source and segment model

Persist an optional independently versioned `video` section in each session workspace. Version 1 contains session ID/content version, source type and canonical YouTube URL/video ID or native local file path and metadata, segments, selected segment and bounded player/workspace preferences. Preferences include panel size, playback rate and last paused video position. Restore paused; never autoplay after restart. Runtime object URLs, native authorization tokens and transient player state are not persisted.

Each segment stores a stable ID, `videoStart`, `videoEnd`, `anchorVideoTime`, `anchorTelemetryTime`, optional anchor lap ID and `correctionSeconds`, all measured in seconds. Session timestamps use the original telemetry time origin. The deterministic mapping inside that segment is:

`telemetryTime = videoTime + anchorTelemetryTime - anchorVideoTime + correctionSeconds`

Reverse the same equation for telemetry-to-video conversion. Correction shifts the mapping without stretching time or changing lap durations. Positive correction maps the same frame to a later telemetry timestamp; label this direction in the controls.

Validate finite numbers, unique IDs, positive segment length, nonnegative video boundaries and anchor video time inside its segment. Require the telemetry anchor to lie in the session. When duration is known, reject boundaries beyond it. Allow unmapped video intervals. Reject overlapping video intervals; sort only for display, never silently rewrite user boundaries. Bound persisted collections and strings within the existing workspace size limit and report failures without truncation.

Use half-open `[videoStart, videoEnd)` intervals: at a shared cut, the later segment owns the timestamp. The exact final media endpoint may display the preceding last frame as an explicit ended-state exception, but ordinary conversion never extrapolates into it. No interpolation or continuity is inferred between segments. Telemetry outside recorded laps or supported position mappings remains unavailable.

Different video segments may show the same telemetry interval. Reverse lookup returns a unique match, unavailable, or ambiguous. For ambiguity require explicit segment selection; never pick the nearest segment or seek silently. Lap coverage is derived from mapped intersections and distinguishes full, partial and absent coverage.

## Synchronization and timing accuracy

Maintain authoritative absolute session playback time separately from the displayed lap cursor. Convert to time-axis coordinates by subtracting the selected lap start. Convert to distance coordinates through the existing validated lap mapping; invert that mapping for graph/GPS seeks. Never substitute normalized progress, extrapolate or clamp into unrelated coverage.

During video playback, sample the source clock at a bounded cadence and publish telemetry/GPS cursor updates at roughly 20 Hz. Use monotonic elapsed time only for short prediction between observed player samples while playing; reset prediction on pause, buffering, seek, rate change and visibility changes. Reconcile against fresh source samples so polling latency cannot accumulate into drift. Do not add a guessed permanent latency offset. Manual correction handles the user's anchor error, not transport uncertainty.

Local playback uses available media time/frame callbacks, with time events as fallback. Report synchronization as constrained by media timestamp precision, display cadence and manual alignment; do not promise frame stepping or frame-level accuracy without observed support. YouTube time is an approximate asynchronous player clock. Clearly label approximate YouTube synchronization and record observed limitations separately from deterministic mapping accuracy.

On an explicit telemetry seek, pause synchronized playback, mark a pending seek, issue one generation-tagged player request, and wait for completion. HTML video uses `seeked` and current time validation; YouTube uses bounded observed-time convergence and timeout because it has no equivalent reliable seek-complete event. Suppress old clock samples during pending seeks. A new seek cancels/supersedes the old generation. Resume only if playback was active and the current request succeeded; failures stay paused with a useful message.

Video-origin updates never call seek back into the player. Graph hover updates readouts only. Explicit graph clicks, GPS position clicks, covered-lap selection and selected analysis events use a separate seek intent. Reset/zoom/theme changes do not issue player seeks. Uncovered or ambiguous telemetry selection pauses playback and shows its state without displaying unrelated footage as synchronized.

When the clock crosses a lap boundary or edited cut, identify the correct recorded lap and change selection once. Keep the latest absolute target while its analysis loads; project it only when `analysis.primary.lapId` matches. Ignore stale analysis/player callbacks after subsequent lap/source/session changes. Keep the player mounted and visible during analysis loading. Highlight the current lap and containing existing approximate corner when a supported mapping exists.

## User workflow and workspace

Add a Video workspace choice beside the existing Telemetry/Advanced choices. Retain the session/lap sidebar, selected telemetry channels and GPS inspector. The video panel remains visible above the graphs with an accessible resize divider and sensible minimum dimensions; the YouTube viewport must satisfy its player requirements. Reuse existing colors, spacing and dark/light themes.

Attach footage through a YouTube URL field or native MP4/MOV picker. Replacing footage explicitly clears its old segment mappings after a clear user action. Show ready/loading/buffering/error state, player controls, supported speeds, video time and absolute telemetry time. Keep native YouTube controls accessible and unobstructed.

Primary synchronization is: pause on a start/finish crossing, select the matching telemetry lap in a clearly labeled anchor selector, then click **Sync Here**. This anchors the current video time to that recorded lap's start. With no segments, create a segment spanning available footage; disclose and expose its editable boundaries. For edited footage, the user defines the cut/end and adds another segment with its own anchor. Never infer a cut from lap timing.

Provide a compact segment list/editor for start/end, anchor lap or explicit telemetry timestamp, correction in seconds, small ± timing nudges, and removal. Validate proposed edits before applying them; retain the last valid mapping on error. Adding a segment suggests only the remaining unmapped video interval and does not silently shorten another segment. Users explicitly trim the current segment first when required.

The compact video timeline shows segment boundaries, unmapped gaps, the playhead and predicted lap crossings with recorded lap numbers. Propagate crossings from recorded lap starts through each segment's inverse offset; include markers only inside that segment. Correction updates all markers for that segment. Label these as predicted from telemetry, never visually detected crossings. Provide keyboard-accessible alternatives to timeline pointer interactions.

## Local video, platform support and errors

Use Tauri's native picker and asset protocol with individually authorized validated files. Enable only required protocol features; do not grant recursive/global filesystem access. Reauthorize valid saved references on restore and support native range/seek streaming. Keep paths platform-neutral using Rust `Path`/`PathBuf` and Tauri URL conversion; avoid hardcoded macOS filesystem paths, shell tools or platform-only codecs in the implementation.

Validate regular file and allowed extension without pretending extension proves codec support. Media errors explain unsupported codec/container, unreadable source or decode failure. Missing files preserve mappings and offer **Locate**. Relocating a reference updates the path; changed size/metadata is flagged and requires confirmation that mappings still apply. Do not claim byte identity from metadata. Invalid, unavailable or pending-confirmation sources cannot drive synchronized playback.

## YouTube compatibility and early native checkpoint

Accept standard watch, short and share URLs through strict host/ID parsing. Use the official IFrame API only; never download footage or extract streams. Configure CSP narrowly for required API scripts and embedded player frames, without weakening IPC capabilities or permitting remote content to invoke native commands. Keep controls, branding and required minimum player dimensions intact. Use available playback rates and meaningful errors for removed/private videos, disabled embedding, network/API load failure and missing client identity.

Before substantial UI implementation, test a publicly embeddable video inside the actual packaged/development Tauri macOS WebView. Current YouTube guidance requires desktop embedded clients to provide HTTP Referer identity; an `origin` query parameter alone does not establish compatibility. Investigate only documented compliant platform capabilities. Do not spoof identity, disable security globally, proxy streams, or introduce unsupported workarounds.

If compliant native embedding is blocked by WebView restrictions, preserve complete local-video support, expose an honest YouTube availability message and document native YouTube as an unmet completion criterion. Browser or simulated API success never counts as native playback evidence. Network restrictions are reported separately from confirmed WebView incompatibility.

References: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [YouTube embedded-client requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity), [Tauri URL conversion](https://v2.tauri.app/reference/javascript/api/namespacecore/).

## Persistence, compatibility and recovery

Keep library manifest version 1 and add only an optional video subsection to the existing workspace. Old sessions restore without video. Use existing atomic writes, backups, serialized save ordering and content-version checks. Telemetry content changes invalidate video mappings with the existing explicit Refresh workflow; communicate that mappings require realignment. Unchanged content preserves them.

Validate restored nested state before use. Corrupt video state produces a repairable warning and does not prevent telemetry analysis. Unsupported future video versions are preserved read-only without accidental overwrite. Keep last valid mappings if a save fails and report persistence failure. Save source/mapping/preferences changes, not every playback tick. Restore local references asynchronously so missing files or network operations cannot block session opening.

## Verification and delivery

Use tests first for the pure model/controller. Deterministic clocks cover forward/reverse conversion, independent segments, shared cut boundaries, unmapped gaps, reverse ambiguity, lap markers, correction signs, invalid/overlapping mappings and out-of-range positions. Test latency, buffering, superseded seeks, completion/timeouts, rate changes, drift reconciliation and feedback-loop prevention without wall-clock flakiness.

Test persistence round trips, old/corrupt/future versions, telemetry content changes, missing/relocated/changed local references and per-session isolation. Browser integration tests exercise one-action lap anchoring, boundary edits, correction, lap coverage, click/GPS seeks, hover without seek, playback-driven cursor/GPS, asynchronous lap transitions and restart restoration. Mock YouTube clocks only for deterministic behavior tests and identify those tests as simulated.

Run `npm test`, `npm run build`, all existing browser scripts (`test:plots`, `test:workflow`, `test:advanced`, `test:canvas`), new video integration checks, offline Rust tests and the native macOS application build. Observe native local playback, pause/resume, seek, rate adjustment, codec failure handling, missing-file Locate and restart restoration using generated fixtures outside `data/`. Observe native YouTube playback early and recheck the final integration if it is supported. Record checks unavailable due to host/network constraints without claiming success.

Obtain independent read-only acceptance review of the integrated behavior and apply bounded corrections. Recheck original fixture hashes and ignored/untracked status without modifying files in `data/`. Update `PROGRESS.md` with implementation, exact tests, native observations, accuracy limits and unresolved completion criteria. Commit relevant verified source/tests/docs and push normally to `origin/main` when permitted; never force push or commit videos, secrets, generated caches or fixtures. Do not call the milestone fully complete while required behavior or checks remain unverified.

## Approval and implementation handoff

This specification incorporates the approved architecture and follow-up requirements. Self-review checks scope, mapping semantics, asynchronous ownership, source boundaries, migration safety and honest native acceptance. No architectural question remains open; native YouTube feasibility is an explicit early evidence checkpoint with the approved local-video fallback.

The installed brainstorming workflow requires explicit review of this written specification before invoking writing-plans. After specification approval, create the implementation plan with file ownership, tests and the early native checkpoint; that skill also requires user review of the written plan and execution-method selection before implementation. Use the requested parent-led orchestration with at most two concurrent workers as the proposed execution method.
