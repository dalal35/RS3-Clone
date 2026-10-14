# Milestone 6 Video Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize independent stretches of local or YouTube footage with existing telemetry, GPS and recorded laps, preserving edited cuts and persistent mappings.

**Architecture:** Pure TypeScript mappings and a source-neutral asynchronous controller connect HTML video/official YouTube adapters to absolute session timestamps. React converts that clock into existing lap-relative cursors; Rust validates and authorizes local file references while existing JSON saves retain mappings. Probe native YouTube compatibility before expanding its UI.

**Tech Stack:** Existing React 19, TypeScript, uPlot, Tauri 2, Rust/serde, Vitest and Playwright; no new runtime dependencies planned.

**Spec:** `docs/superpowers/specs/2026-10-12-video-synchronization-design.md` (formally approved 2026-10-12).

## Global Constraints

- Never modify, delete, upload or commit original telemetry or local videos.
- Use at most two concurrent workers; parent owns contracts, integration, acceptance and delivery.
- Keep library manifest version 1 and add only an optional video subsection to the existing workspace.
- Use half-open `[videoStart, videoEnd)` intervals: at a shared cut, the later segment owns the timestamp.
- Video-origin updates never call seek back into the player. Graph hover updates readouts only.
- Restore paused; never autoplay after restart.
- No large file reads, hashing of whole videos, copying videos into the library, synchronous waits or per-frame IPC.
- No cut detection, audio matching, computer vision or AI analysis; stop after Milestone 6.
- Work in the existing repository as requested; preserve current uncommitted speed-display changes and Git history. Review the live diff before edits; never reset unrelated work or stage it as part of this milestone.
- Product paths and local-file handling use platform-neutral Tauri/Rust APIs. macOS-specific launch/inspection commands belong only to verification.

## Review Focus

- Rapid source/session switches during seeks must not apply old clocks or resume discarded players: Task 4 cancellation tests and Task 7 integration tests.
- Repeated footage of the same telemetry lap must require segment disambiguation: Task 2 reverse-lookup tests and Task 6 selection tests.
- Native picker cancellation, Unicode paths and missing/changed restored files must preserve mappings: Task 3 native tests and Task 5 restoration tests.
- Pointer hover, chart zoom/pan and theme/axis changes must never become video seeks: Task 7 explicit-interaction tests.
- Backgrounding, buffering and rate changes must not turn stale player samples into fabricated telemetry progression: Task 4 deterministic-clock tests.

## File map and shared contracts

- `src/video/model.ts`: source/segment/state types, strict URL parsing, deterministic mappings, lap markers/coverage and cursor conversion.
- `src/video/state.ts`: bounded restoration, version protection and serialization; existing `src/workspace.ts` adds optional video state and `view:'video'`.
- `src/video/player.ts`: playback types and adapter contract; `src/video/htmlPlayer.ts` and `src/video/youtubePlayer.ts` implement it.
- `src/video/controller.ts`: pure clock/seek state machine; `src/video/useVideoSync.ts` owns React lifecycle and lap-analysis reconciliation.
- `src/video/VideoWorkspace.tsx`: source/player/anchor controls; `src/video/SegmentEditor.tsx` and `src/video/VideoTimeline.tsx` handle mapping edits and navigation.
- `src-tauri/src/video.rs`: local reference metadata/validation and exact-file authorization; `lib.rs` registers commands; Cargo/config add only required protocol/CSP settings.
- `src/App.tsx`, `src/Plots.tsx`, `src/Track.tsx`, `src/bridge.ts`, `src/styles.css`: parent-owned integration with existing behavior.
- Colocated `*.test.ts` cover pure model/state/controller/adapters. `tests/video.html`, `tests/video.tsx`, `scripts/verify-video.mjs` provide browser fixtures/integration. Native observations go in `PROGRESS.md` with generated fixtures outside `data/`.

Freeze these contracts before workers implement dependents:

```ts
type VideoSource =
  | {type:'youtube'; url:string; videoId:string}
  | {type:'local'; path:string; size:number; modifiedMs:number};
interface VideoSegment {
  id:string; videoStart:number; videoEnd:number;
  anchorVideoTime:number; anchorTelemetryTime:number;
  anchorLapId?:string; correctionSeconds:number;
}
interface VideoStateV1 {
  version:1; sessionId:string; contentVersion:string; source:VideoSource|null;
  segments:VideoSegment[]; selectedSegmentId:string|null;
  preferences:{panelHeight:number; playbackRate:number; pausedVideoTime:number};
}
type MappingResult = {kind:'mapped'; time:number; segmentId:string}
  | {kind:'unavailable'} | {kind:'ambiguous'; segmentIds:string[]};
type PlaybackState = 'loading'|'paused'|'playing'|'buffering'|'ended'|'error';
interface PlayerSnapshot {
  time:number; duration:number|null; rate:number; state:PlaybackState;
  observedAtMs:number; seeking:boolean;
}
interface VideoPlayer {
  ready:Promise<void>;
  play():Promise<void>; pause():Promise<void>;
  seek(time:number, signal:AbortSignal):Promise<void>;
  setRate(rate:number):Promise<void>; supportedRates():number[];
  snapshot():PlayerSnapshot;
  subscribe(listener:(snapshot:PlayerSnapshot)=>void):()=>void;
  dispose():void;
}
```

`AbortSignal` and controller generation checks provide cancellation without persisting runtime IDs. Adapter errors reject operations with user-readable messages. Model imports existing `Lap`, `LapView`, `Axis`, `Session` types; no duplicate telemetry schema.

## Execution sequence and ownership

The user selected parent-led Codex Orchestrator, at most two concurrent workers. Parent loads execution skill, inspects dirty work, records fixture hashes and owns native YouTube decision in Task 1. Then worker A owns pure model/state (Tasks 2, 5), worker B owns local backend/adapters/controller (Tasks 3, 4); these roles never edit the same files concurrently. Parent integrates shared files and builds UI in Tasks 6–7 once required interfaces pass. Delegate independent browser test work after its fixture contract exists. Reuse still-applicable architecture advice; obtain fresh bounded advice only if native findings require a material contract change. Delegates may not spawn further agents.

Task dependencies: 1 → adapter implementation in 4; 2 + 3 → 5; 2 → controller in 4; 2 + 4 + 5 → 6; 6 → 7 → 8. Tasks 2 and 3 may run concurrently after Task 1. Task 5 may overlap Task 4 with separate ownership. Independent read-only review runs after stable integration; no more than two worker/advisor/reviewer agents are active at once.

### Task 1: Early native YouTube compatibility checkpoint and playback contract

**Files:** Create `src/video/player.ts`, `src/video/youtubePlayer.ts`, `tests/video.html`, `tests/video.tsx`, `src/video/youtubePlayer.test.ts`; modify `src-tauri/tauri.conf.json` only as needed for the checkpoint. Parent owns this task and its decision.

**Interfaces:** Produce the `VideoPlayer` contract above. The checkpoint harness mounts an official API player in a minimum 200×200 viewport and records ready/state/error/current time; it is test-only and does not add native IPC to remote content.

- [x] Read current official YouTube IFrame/client-identity and Tauri WebView/CSP documentation using available documentation tools; record the supported native identity mechanism and its evidence. Use the previously identified HTTP Referer issue as the specific question, not an invitation to broad research.
- [x] Add a failing API-load test named `reports API script failure instead of hanging`: simulate script `error`, assert a rejected readiness promise and a meaningful error. Run `npx vitest run src/video/youtubePlayer.test.ts`; observe the missing implementation failure.
- [x] Implement the minimum API loader/probe using the official script, timeout and lifecycle cleanup; add only narrow required script/frame CSP origins. Keep native controls and branding visible. Run the targeted test; expect pass.
- [x] Launch the actual Tauri macOS WebView with the test-only harness and try public embeddable video `M7lc1UVf-VE` (verify current availability first). Observe play, advancing current time, pause, seek and supported rate changes; capture actual error codes or network failure if unsuccessful. A browser-only observation is insufficient.
- [x] Classify the result as native supported, confirmed WebView/client-identity blocked, or network-inconclusive. Record observations and exact environment in the execution record. For blocked/inconclusive results, retain the official adapter contract and honest availability state; continue local support without unsupported workarounds or heavy YouTube UI work. A material architecture change returns to the user before implementation.
- [x] Review the checkpoint diff, run `npm run build`, and commit only its verified contract/harness/config files as `feat: establish video playback contract and native compatibility probe`.

### Task 2: Deterministic segments, lap propagation and axis conversion

**Files:** Create `src/video/model.ts`, `src/video/model.test.ts`. Worker A owns these files.

**Interfaces:** Produce `parseYouTubeUrl(input:string):VideoSource|null`, `validateSegments(segments:VideoSegment[], laps:Lap[], duration?:number):string[]`, `videoToTelemetry(segments:VideoSegment[], videoTime:number):MappingResult`, `telemetryToVideo(segments:VideoSegment[], telemetryTime:number, selectedSegmentId?:string):MappingResult`, `lapMarkers(segments:VideoSegment[], laps:Lap[]):{segmentId:string;lapId:string;lapNumber:number;videoTime:number}[]`, `lapCoverage(segments:VideoSegment[], laps:Lap[]):Record<string,'full'|'partial'|'none'>`, `sessionTimeToCursor(time:number, lap:Lap, view:LapView, axis:Axis):number|null`, `cursorToSessionTime(cursor:number, lap:Lap, view:LapView, axis:Axis):number|null`.

- [x] Write tests using segment A `[0,10)` anchored at video 2/session 102, segment B `[10,20)` anchored at video 10/session 200. Assert forward times `0→100`, `9→109`, `10→200`, `20→unavailable`; reverse `105→5`, `150→unavailable`, `205→15`. Add gap, overlap, NaN/Infinity, duplicate-ID, out-of-duration and invalid-anchor assertions.
- [x] Add `does not choose repeated footage implicitly`: two disjoint video segments mapping the same telemetry interval yield `ambiguous`; an explicitly matching segment ID yields its exact video time. Add marker assertions for lap starts 100/105/200, correction `+0.1` shifting inverse markers by `-0.1`, partial/full coverage, and exact shared boundaries.
- [x] Add conversion assertions: lap start 100 and mapping `(0 m,0 s)/(50 m,5 s)/(100 m,10 s)` map absolute 105 to cursor 5 s/50 m and back; out-of-coverage returns null. URL tests accept official watch/share/short forms and reject lookalike hosts, malformed IDs and executable schemes.
- [x] Run `npx vitest run src/video/model.test.ts` and observe red. Implement the declared exports, bounded binary-search interpolation and half-open semantics without player/React dependencies. Run the same test and expect green.
- [x] Commit only model/tests as `feat: map edited video segments to absolute telemetry time`.

### Task 3: Native local-file validation and playback authorization

**Files:** Create `src-tauri/src/video.rs`, `src-tauri/tests/video.rs`; modify `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/bridge.ts`. Worker B owns new backend files; parent applies shared-file registration/config/bridge patches after review.

**Interfaces:** Rust `inspect_local_video(path:&Path) -> Result<LocalVideoInfo,String>` returns camelCase `{path,size,modifiedMs,status}` with status `ready|missing`. Tauri command `authorize_local_video(path:String, app:AppHandle) -> Result<LocalVideoInfo,String>` validates/canonicalizes a regular readable MP4/MOV and authorizes only that file. Frontend `pickLocalVideo():Promise<LocalVideoInfo|null>` and `authorizeLocalVideo(path:string):Promise<LocalVideoInfo>` use existing dialog/invoke APIs; URL conversion remains in local adapter.

- [x] Write Rust tests `missing_reference_is_repairable`, `rejects_directory_and_wrong_extension`, `unicode_filename_preserves_metadata` using temporary directories outside `data/`; metadata tests do not assert codec decodability. Test uppercase extensions and permission errors where the host can represent them.
- [x] Run `cargo test --manifest-path src-tauri/Cargo.toml --offline video` with existing project-local toolchain environment if required; observe red. Implement metadata/status validation and exact-file authorization, enabling Tauri `protocol-asset` and narrow `media-src` only. No global filesystem scopes or video hashes.
- [x] Add picker cancellation bridge assertions to `src/video/htmlPlayer.test.ts` with dialog mocked: cancel returns null, leaves state unchanged; selected path passes to authorization once. Test restored path authorization uses the same validation.
- [x] Run targeted Rust/frontend tests and `npm run build`; expect pass. Inspect production asset permissions and confirm remote YouTube frames receive no native capabilities.
- [x] Commit the verified local-file changes as `feat: authorize locally referenced video files`.

### Task 4: Playback adapters and deterministic seek/clock controller

**Files:** Create `src/video/htmlPlayer.ts`, `src/video/youtubePlayer.ts`, `src/video/controller.ts` and their colocated tests; reuse Task 1 loader/tests. Worker B owns these files after Task 3. Consume Task 2 mappings and the frozen playback contract.

**Interfaces:** `createHtmlPlayer(element:HTMLVideoElement, url:string):VideoPlayer`; `createYouTubePlayer(host:HTMLElement, videoId:string):VideoPlayer`. `createSyncController(player:VideoPlayer, options:{nowMs:()=>number; segments:()=>VideoSegment[]; onTime:(result:MappingResult)=>void; onError:(message:string)=>void})` returns `{tick():void; setVisible(visible:boolean):void; seekTelemetry(time:number, segmentId?:string):Promise<MappingResult>; seekVideo(time:number):Promise<MappingResult>; dispose():void}`. Inject the monotonic clock; adapter events supply samples, React schedules bounded ticks. `seekVideo` validates coverage before issuing a seek. Native source controls may scrub unsynchronized footage to establish an anchor, but such footage publishes no synchronized telemetry position.

- [x] Write simulated-player tests with explicit observed samples and controlled promises: playing 5 s at rate 2 predicts 5.1 after 50 ms; fresh sample 5.04 resets prediction rather than adding drift; buffering/paused/hidden resets prediction. Bound prediction horizon to 100 ms and UI tick cadence to 50 ms as implementation choices supporting the spec's roughly 20 Hz updates.
- [x] Write `superseded_seek_cannot_resume`: start two seeks, resolve the older last, assert only newest target publishes/resumes. During pending seek, old samples publish no time; failed/timeout seek remains paused; unavailable/ambiguous lookup pauses and invokes no seek. Video ticks invoke zero player seeks. Dispose/source switch abort pending operations and unsubscribe once.
- [x] Write adapter tests for HTML `seeked`, same-time seek, codec `MediaError`, rejected play, disposal and unsupported rates. For mocked YouTube test unavailable/disabled-embed/153 errors, supported-rate filtering, script timeout and bounded convergence (within 0.25 s, two observations, 5 s timeout). Label YouTube convergence approximate. HTML target tolerance is 0.05 s; neither tolerance asserts frame-level native accuracy.
- [x] Run `npx vitest run src/video/controller.test.ts src/video/htmlPlayer.test.ts src/video/youtubePlayer.test.ts`; observe red. Implement cancellable async operations, media/frame callbacks where available and source observation resets. No guessed fixed latency compensation or synchronous waiting.
- [x] Run targeted tests to green and full frontend suite. Commit as `feat: synchronize asynchronous video clocks without seek feedback`.

### Task 5: Versioned video state and safe restoration

**Files:** Create `src/video/state.ts`, `src/video/state.test.ts`; modify parent-owned `src/workspace.ts`, `src/workspace.test.ts`, `src-tauri/tests/library.rs` as needed for round-trip evidence. Worker A owns new state files; parent integrates shared workspace changes.

**Interfaces:** `restoreVideoState(raw:unknown, session:Session, contentVersion:string):{state:VideoStateV1|null; warnings:string[]; futureRaw?:unknown}`; `serializeVideoState(restored:ReturnType<typeof restoreVideoState>):unknown`. Runtime future-version protection must preserve raw state through ordinary saves. Limit 100 segments, 2048-character source strings, panel height 200–900 px, playback rate 0.25–4 and finite nonnegative paused time; reject oversized state without silently dropping segments.

- [x] Write tests for absent video, valid round trip, corrupt nested objects, incompatible source version/session ID, malformed segments, invalid preferences and unknown version 2 preserved byte-equivalent through serialization. Assert restoration starts paused and does not persist transient URLs/timers.
- [x] Add changed/missing reference tests: absent file preserves mappings and offers repair; changed size/mtime requires explicit confirmation before playback; picker cancellation preserves the old reference. Missing and changed are runtime availability, not destructive state migrations.
- [x] Run targeted state/workspace tests to red; implement restoration and optional `Workspace.video`, retaining existing speed-display changes, advanced state and view defaults. Add `view:'video'` restoration only when supported; show corruption warnings without preventing telemetry use.
- [x] Add library save/reopen assertions that video JSON survives existing atomic persistence, old entries remain readable, stale expected content version is rejected, and combined advanced/video workspace obeys the existing 64 KiB limit. Run offline Rust library tests and targeted frontend tests to green.
- [x] Commit only milestone state/persistence hunks as `feat: restore versioned video mappings safely`; never stage unrelated edits wholesale.

### Task 6: Video workspace, one-action lap anchors and segment editing

**Files:** Create `src/video/VideoWorkspace.tsx`, `src/video/SegmentEditor.tsx`, `src/video/VideoTimeline.tsx`; extend `tests/video.tsx`, `scripts/verify-video.mjs`, `src/styles.css`, `package.json`. Parent owns UI/integration; an available worker may own browser assertions exclusively after the fixture API is fixed.

**Interfaces:** `VideoWorkspace` props are `{session:Session; state:VideoStateV1; availability:'ready'|'missing'|'changed'|'error'; telemetryTime:number|null; onChange:(next:VideoStateV1)=>void; onPlayer:(player:VideoPlayer|null)=>void; onSeekTelemetry:(time:number, segmentId?:string)=>void; onSeekVideo:(time:number)=>void}`. It creates/disposes the source adapter and reports it through `onPlayer`; parent passes it into Task 7's hook. `onChange` persists only semantic edits/preferences. `SegmentEditor` consumes segments/laps/duration and emits validated replacement arrays; `VideoTimeline` consumes model markers and emits explicit mapped-video seeks. Component-local draft fields never replace valid mappings on invalid input.

- [x] Write Playwright assertions for attach/cancel/replace, paused crossing → anchor lap selector → **Sync Here** producing the exact lap start anchor; initial segment spans known footage with editable boundaries. Unknown duration disables segment creation with a useful message.
- [x] Add assertions for trimming before adding a new cut, overlap rejection without mutation, correction ± nudges moving only selected segment markers, segment removal, repeated-footage disambiguation, and full/partial/no-coverage labels.
- [x] Add assertions for keyboard timeline navigation and resize separator controls, preserved aspect ratio/minimum player dimensions, dark/light layouts and video remaining visible while graphs load. Mock source readiness/errors; native playback remains separately verified.
- [x] Run `node scripts/verify-video.mjs` and observe missing-workspace failures. Implement the accessible workspace/timeline/editor using existing style tokens; label predicted lap crossings, approximate YouTube timing, unsupported codec and **Footage unavailable**. Preserve native YouTube controls; avoid implementing unsupported heavy YouTube UI when Task 1 is blocked.
- [x] Register `test:video` in package scripts; run it and `npm run build` to green. Commit as `feat: add video workspace and edited-segment synchronization controls`.

### Task 7: Bidirectional telemetry, graph/GPS seeks and asynchronous lap transitions

**Files:** Create `src/video/useVideoSync.ts`, `src/video/useVideoSync.test.ts`; modify `src/App.tsx`, `src/Plots.tsx`, `src/Track.tsx`, browser harness/script. Parent owns production integration; test worker owns only agreed test files.

**Interfaces:** `useVideoSync(options:{session:Session; contentVersion:string; player:VideoPlayer|null; segments:VideoSegment[]; primaryId:string; analysis:Analysis|null; axis:Axis; onLap:(lapId:string)=>void; onCursor:(cursor:number|null)=>void; onCorner:(cornerId:string|null)=>void})` returns `{telemetryTime:number|null; status:'ready'|'unavailable'|'ambiguous'|'seeking'|'error'; error:string|null; seekTelemetry:(time:number,segmentId?:string)=>Promise<MappingResult>; seekVideo:(time:number)=>Promise<MappingResult>}`. It owns Task 4's controller, 50 ms scheduling and visibility listener, retains latest absolute time and source/session generation, and publishes cursor only for matching `analysis.primary.lapId`. Add optional `onSeek:(position:number)=>void` to Plots/Track; existing `onCursor` keeps hover/readout semantics. Covered-lap selection calls the hook with that lap's start; comparison selection never seeks.

- [x] Add failing tests for video advancing across two laps and a cut while analysis responses resolve out of order; assert only matching latest lap projection applies and player stays mounted. Unsupported distance mapping yields null GPS/cursor rather than normalized interpolation.
- [x] Add browser assertions: hover invokes zero seeks; click invokes one seek; drag zoom/shift-pan/reset/theme/axis changes invoke none; programmatic cursor ticks invoke none. GPS position clicks seek nearest valid primary position, corner focus remains functional, advanced event explicit selections share the same path.
- [x] Assert covered lap selections seek correctly, uncovered selections pause/show unavailable without changing video position, ambiguous selections request segment choice, and playback updates speed/RPM readouts/current corner/GPS. Preserve comparison synchronization and telemetry-only behavior when no video is attached.
- [x] Run targeted hook and video browser checks to red. Implement separate seek intents, lap reconciliation and callback guards without moving player inside the analysis-loading branch. Do not persist every playback tick; save paused position and semantic preferences through existing queue.
- [x] Run frontend tests plus `test:video`, `test:plots`, `test:workflow`, `test:advanced`, `test:canvas` to green. Commit as `feat: connect video playback to telemetry and GPS in both directions`.

### Task 8: Native acceptance, independent review and delivery

**Files:** `PROGRESS.md`, this plan's execution record, bounded fixes/tests in their owning files. Parent owns acceptance and delivery; independent reviewer is read-only.

- [x] Generate a short supported-codec video fixture outside `data/` and outside versioned source. Record generator/source, duration and container; a generated file is used only for testing and never committed. Use a corrupt/unsupported fixture to exercise graceful errors.
- [x] Run `npm test`, `npm run build`, `npm run test:video`, `npm run test:plots`, `npm run test:workflow`, `npm run test:advanced`, `npm run test:canvas`, `cargo test --manifest-path src-tauri/Cargo.toml --offline`, `npm run tauri build`. Each must exit zero; capture actual counts and failures, not expected counts. Use existing local Rust toolchain configuration when needed.
- [x] Launch the built macOS app and exercise real telemetry import, local video play/pause/rate/seeks, anchors, two edited segments, correction, both axes, graph/GPS seek, uncovered positions, decoder error, restart restoration and missing-file Locate. Measure observed responsiveness and timing behavior; disclose local codec-dependent precision and approximate YouTube synchronization without claiming frame accuracy from unit tests.
- [x] Recheck native YouTube in final integration when Task 1 succeeded. If blocked or network-inconclusive, record exact evidence and remaining native YouTube completion criterion; do not equate simulated/browser tests with native success.
- [x] Request independent read-only acceptance review of the stable diff against spec, including source authorization, preserved dirty work, edited-cut boundaries and async races. Resolve blocking findings with regression tests and rerun affected checks; renew review only when material behavior changes invalidate it.
- [x] Recheck original telemetry SHA-256 against `PROGRESS.md`, `git ls-files data` remains empty and `git check-ignore` confirms fixtures remain excluded. Never modify anything in `data/` to perform these checks. Confirm no videos/secrets/cache artifacts are staged.
- [x] Update `PROGRESS.md` with implemented behavior, exact observed checks, native YouTube outcome, accuracy/codec/network limitations and unfinished criteria. Check off only observed completed steps here; do not mark milestone complete if required behavior/checks remain missing.
- [x] Run `git diff --check`, inspect staged hunks, commit verified milestone work, and push `origin main` without force when permitted. Existing unrelated speed-display changes remain outside milestone commits. Report any permission/network delivery block precisely.

## Plan self-review and approval handoff

Spec coverage: Task 1 owns early native compatibility; 2 owns deterministic mapping/markers/coverage; 3 owns native files/platform boundary; 4 owns timing/seek/performance; 5 owns persistence/recovery; 6 owns intuitive UI; 7 owns telemetry/GPS integration; 8 owns observed native acceptance, regression review and delivery. Review Focus inputs are assigned explicit tests. Shared signatures use the same types throughout; no speculative runtime dependency is required.

The user has already selected parent-led Codex Orchestrator with at most two concurrent workers. The installed writing-plans skill explicitly requires review of this written plan before implementation. Preserve that execution method after approval; no further execution-method question is needed.

## Execution record

- 2026-10-12: Written specification formally approved. Plan created and self-reviewed; product code not modified by this planning task. Existing uncommitted speed-display changes were observed and left intact. The user subsequently formally approved this plan at `63b8145`; execution proceeded without further design approvals.

- 2026-10-13: Tasks 1–7 implemented, each independently reviewed with scoped re-reviews of bounded fixes. Task 1 `45bcb5e`; Task 2 `bb520e2`; Task 3 `c645d3d`; Task 4 `2235a00` + `0d3065b`; Task 5 `4ead40f` + `ba70770`; Task 6 `8bb35cd` + `6e0d5ff`; Task 7 `e93b818` + `15dcac4` + `b196cbb`. Native paused-clock correction `cc6fcd0` and final recorded-lap coverage correction `fd66499` received independent acceptance review. No unresolved Important local-video code findings remain.
- Task 8 verification: working 161 frontend tests; clean committed snapshot 157; offline Rust 84; all six browser checks, production build and final native build pass. Native local MP4/MOV, codec error, edited segments, anchors, correction, graph/GPS seeks, coverage, real duplicate XRK import, paused restoration and missing-file Locate observed. Full evidence, unchanged original hashes and limitations are recorded in `PROGRESS.md`. Checkmarks indicate executed steps, including investigation and limitation reporting; they do not assert native YouTube success.
- Native YouTube: early development HTTP WKWebView success, packaged `tauri://localhost` error 153. Actual supplied `TySa_fqgccc&t=1308s` also fails in packaged official-API probe. Separate HTTP official embed seeks/plays successfully (2637 s duration). Approved local fallback implemented and ready for delivery; full native YouTube playback/sync/restoration criterion remains unmet. No unsupported workaround or architecture change introduced.
- Independent final review: whole stable implementation reviewed, one final fix wave for out-of-recorded-lap mappings, scoped re-review accepted `fd66499`. Narrow viewport ratio is a nonblocking deferred minor; native YouTube remains an explicit acceptance limitation.
- Execution rulings, in order: existing main checkout used under explicit user authorization (incorrect isolation would require dirty-work migration); disjoint workers allowed concurrently within the user-approved two-worker limit (incorrect ownership would require conflict resolution); approved local fallback after native YouTube 153 without unsupported identity workaround (cost: native YouTube remains unavailable); additive optional `PlayerSnapshot.error` surfaces post-ready errors (incorrect contract choice would require consumer adjustment); optional `VideoWorkspace.children` keeps existing graphs/loading inside the sticky player section (incorrect composition would require layout rework).
- Only milestone hunks were committed in shared files. Unrelated speed-display changes and both original XRKs remain preserved. User authorized normal `origin/main` push; no force push, history rewriting, cut detection, computer vision or AI work.

- 2026-10-14: Final follow-up native startup initially delayed at restoration, resolved without repair (cause unconfirmed); subsequent confirmed quit/relaunch immediately loaded two sessions. Current user-edited YouTube source/mapping preserved; final product workspace displays explicit error 153. Prior synthetic local restoration evidence was not replaced with a claim about the user-edited current state.

- 2026-10-14 delivery: independent final evidence review accepts the local-video fallback (code quality PASS, no unresolved Critical/Important local-video findings); full native YouTube acceptance remains unmet. Documentation bookkeeping was corrected before commit. Normal push succeeded `63b8145..6d15095` to `origin/main`, preserving history and all unrelated dirty paths. Fresh frontend 161 tests and production build passed; no product changes since `fd66499`.
