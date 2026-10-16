# Local video analysis: Stage 1

Windows implementation update (2026-10-16): the same public Rust frame API now has a Media Foundation backend in `src-tauri/src/video_analysis/windows.rs`; the Apple implementation described below is retained. Windows source/test typechecking is supplemental evidence; native execution and installer validation remain pending. See [cross-platform validation](../windows-validation.md).

## Purpose and boundaries

This subsystem prepares local onboard MP4/MOV footage for later painted
start/finish-line detection. It does not detect lines, match laps, estimate an
offset, or expose automatic synchronization controls. Processing stays local.
YouTube extraction is outside this service.

## Existing architecture and integration

The Tauri entry point is `src-tauri/src/lib.rs`. Telemetry parsing, analysis,
and library writes use `spawn_blocking` under the library store mutex.
`src-tauri/src/video.rs` independently validates and canonicalizes local video
paths and grants asset-protocol playback access. React's
`src/video/htmlPlayer.ts` uses the WebView media player. Versioned video workspace
state and segment mappings live in `src/video/model.ts` and `state.ts`.

Video analysis is a separate Rust module with its own blocking work. It reuses
local file validation without taking the library mutex, manipulating the player,
granting playback access, or changing persisted segment anchors. Future callers
will consume small detection results; raw frame buffers remain on the backend.
Stage 1 needs no new frontend IPC command, event, or workspace schema.

The public backend API is in `src-tauri/src/video_analysis/mod.rs`:

- `inspect(path, cancel)` returns `VideoAnalysisMetadata`.
- `extract_frame(path, time, resize, format, cancel)` returns one
  `SampledVideoFrame`, including seconds and rational presentation time.
- `sample_frames(path, options, cancel, consumer, progress)` visits selected
  frames synchronously and emits a terminal progress status.
- `sample_frames_async(path, options, cancel, consumer, progress)` runs that
  pipeline on Tauri's blocking pool; closures must be `Send + 'static`.

`SamplingOptions` specifies a half-open `[start, end)` interval and a positive
sample interval. Frames crossing multiple requested targets are emitted once;
the next target advances beyond the delivered frame. The estimated total is an
upper bound on requested targets, not an exact VFR output count.
Internally computed follow-up targets allow two floating-point ULPs of arithmetic
rounding, preventing a decimal interval such as `0.1` from skipping the frame at
`0.3`. Explicit start/end bounds and individual extraction requests stay strict;
this is not a fixed time tolerance or a decoder seek approximation.
`ResizeOptions` caps width/height, preserves aspect ratio, and does not upscale.
`PixelFormat` supports tightly packed RGB8 and grayscale8; images use top-down
rows after applying the video's preferred display transform. Consumers must
process or release frames rather than retain an unbounded collection.

The caller owns a clonable `CancellationToken`. Dropping an async future is not
a cancellation request: signal the token and await the operation to observe
completion. Errors carry a stable category and explanatory message. Pixel
buffers deliberately do not implement frontend serialization.

## Technology decision

Use AVFoundation through a small Objective-C bridge with a C ABI and Rust-owned
resource handles. The bridge is compiled into the app and links macOS system
frameworks. This fits the existing macOS 13 minimum and requires Apple's Command
Line Tools for development. End users need no compiler, media executable,
Python, subscription, or network service.

FFmpeg offers broad codecs and portability, but would add binary distribution,
architecture, signing, versioning, and build-specific license obligations. Rust
libav bindings inherit those native dependencies. OpenCV would add a large native
dependency before an image-processing algorithm exists. A Swift subprocess would
add a protocol and executable lifecycle to package. AVFoundation avoids those
costs for the macOS target. The Windows Media Foundation implementation uses the
same Rust contract; its native runtime validation remains separate from macOS.

## Pipeline and timing contract

1. Validate a readable, canonical local MP4/MOV path.
2. Inspect the selected video track, duration, dimensions, optional nominal FPS,
   and native timing information.
3. Decode samples in presentation order using `AVAssetReaderTrackOutput`.
4. Select samples by their presentation timestamp, then resize and copy selected
   pixels into an owned, bounded analysis frame.
5. Deliver frames to a backend consumer and report progress. Stop on completion,
   cancellation, consumer failure, or decoder error; release native resources.

Requested time and decoded frame time are different. A timestamp request selects
the first available frame at or after the requested time, and reports the actual
sample timestamp. Sampling uses timestamps rather than `frame_index / FPS`;
nominal FPS is descriptive and does not imply constant frame rate. Times refer
to the asset playback timeline, preserving an initial video-track delay rather
than moving the first decoded frame to zero. This matters when later comparing
results with the existing media player's video-relative clock.

## Performance and ownership

Decode sequentially for interval sampling, keeping frame delivery synchronous to
provide backpressure. Do not collect an entire clip or send pixel arrays through
Tauri IPC. Resize only selected samples; honor decoded row stride and orientation.
Native autorelease pools and Rust resource guards bound lifetimes even when a
consumer returns an error. The decoder still needs codec working memory and
source-resolution sample buffers; a small analysis image does not remove those
costs. Scanning long recordings is proportional to the frames decoded, not just
the samples delivered.

The async entry point follows existing Tauri `spawn_blocking` practice. A separate
cancellation token can be signaled without waiting for a library lock. Cancellation
is cooperative: a currently executing native metadata/decode call may finish before the
next cancellation check. Progress describes processed analysis frames and actual
video time, with a sample-count estimate when available. It is not a claim about
UI playback or telemetry progress.

## Packaging and limitations

The decoder has macOS and Windows implementations; other platforms return an
explicit unsupported-backend error. Windows runtime validation remains pending.
Codec availability follows the operating
system, so an MP4/MOV extension alone does not guarantee decoding. Damaged,
encrypted, or unsupported media must surface an error. No fallback downloads or
external executable lookup occur. Cross-compilation needs an appropriate Apple
SDK and target toolchain. Tests generate tiny local videos rather than commit
large footage; real Purdue Grand Prix clips remain a later validation input.
Windows N requires Media Feature Pack before launch; missing system media DLLs
may prevent process loading, while missing codecs with Media Foundation loaded
produce structured decode errors. See the cross-platform validation record.

## Four-stage roadmap

1. **Frame infrastructure (this stage):** local metadata, timestamped decoded
   frames, interval sampling, resizing, background execution, cancellation,
   progress, errors, and automated infrastructure validation.
2. **Painted-line detection:** consume these frames locally; evaluate lightweight
   grayscale/color masks, regions of interest, geometric line evidence, and
   temporal consistency. Return candidate crossings with source timestamps and
   confidence/evidence metadata. Validate against labeled track footage before
   choosing dependencies. Do not infer telemetry offsets here.
3. **Crossing/lap matching:** compare detected crossing intervals with telemetry
   lap timing, account for recording start differences and missed/false detections,
   and derive a qualified alignment with ambiguity reporting.
4. **UI, verification, and polish:** add opt-in analysis controls, cancellation and
   progress presentation, candidate review, and application of a verified mapping.
   Preserve manual editing and test end-to-end behavior on real recordings.

## Source references

- [Apple: AVAssetReaderOutput](https://developer.apple.com/documentation/avfoundation/avassetreaderoutput)
  documents sample ownership and avoiding unnecessary sample-data copies.
- [Apple: copyNextSampleBuffer](https://developer.apple.com/documentation/avfoundation/avassetreaderoutput/copynextsamplebuffer%28%29?language=objc)
  describes decoded presentation order.
- [Apple: CMSampleBufferGetPresentationTimeStamp](https://developer.apple.com/documentation/coremedia/cmsamplebuffergetpresentationtimestamp(_:))
  provides source sample timing.
- [FFmpeg licensing](https://www.ffmpeg.org/legal.html) explains why a bundled
  FFmpeg build requires a deliberate packaging and license decision.
