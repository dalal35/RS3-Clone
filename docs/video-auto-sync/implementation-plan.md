# Stage 1 implementation plan

## Scope and decisions

Implement only local video frame analysis infrastructure. The supplied Stage 1
request is the specification: no detection, lap matching, offset estimation, UI
controls, or manual synchronization changes. Preserve unrelated working-tree edits.

Use macOS AVFoundation behind a small Objective-C C ABI and an idiomatic Rust
service. Compile the bridge into the application and link system frameworks;
require no extra media binaries or runtime installation. A platform boundary
reports unsupported backends explicitly and permits a future Windows decoder.

## Work and acceptance

- [x] Write failing tests using tiny generated local video fixtures, including
  real variable presentation timestamps and invalid inputs.
- [x] Implement metadata, actual timestamped frame extraction, bounded resizing,
  and sequential interval sampling. Keep pixels inside Rust/native memory.
- [x] Add cancellation, progress, structured errors, resource ownership, and an
  asynchronous blocking-task entry point independent of the telemetry store.
- [x] Verify generated CFR/VFR media, timestamp selection, interval boundaries,
  corrupt/missing/unsupported files, cancellation, and repeated cleanup.
- [x] Run Rust tests/checks and existing frontend/video integration checks.
- [x] Independently review the stable diff, fix blocking findings, document actual
  limits and the four-stage roadmap, then commit only Stage 1 files. Do not push.

## Review focus

Preserve asset timeline semantics when video starts after zero; never manufacture
PTS from nominal FPS. Respect rotation and native row stride. Distinguish decode
failure from EOF. Bound buffers and native autorelease lifetimes. Cancellation
must release a reader, with its current native-call latency stated honestly.

The parent owns architecture, documentation, acceptance, and commit. A dedicated
worker owns native/Rust implementation and tests; a read-only advisor challenges
the decoder choice, and a separate reviewer evaluates the integrated artifact.
