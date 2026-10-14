# Stage 1 validation

## Reproduce

Use Node 20+, stable Rust, and Apple's Command Line Tools on macOS 13+.
The native media fixture generator uses the same system frameworks as the app;
it runs only in tests and requires no FFmpeg or Python installation.

```sh
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm test
npm run build
npm run test:video
npm run tauri build
```

For the project-local Rust installation, set `RUSTUP_HOME` and `CARGO_HOME`
as shown in the repository README. Browser integration checks need a local
loopback server and Chrome/Playwright. A sandbox refusal to listen on the test
port is an execution constraint, not a test result.

## What the checks establish

Generated, tiny local MOV fixtures exercise native decoding and image data;
container extensions or mocked media clocks alone cannot establish that contract.
The native tests target variable presentation timestamps, an initial video-track
delay, requested-time selection, frame dimensions and pixel values, interval
sampling, invalid input, cancellation, and repeated reader cleanup. They also
exercise rotated and unrotated asymmetric image patterns, consumer-error terminal
progress, rational timestamp consistency through the async worker, audio-only and
truncated media, and intervals below floating-point timestamp precision.

The fixtures use MJPEG MOV files with constant and variable frame timing. They do not establish
H.264/HEVC B-frame behavior, deliberately padded source-row behavior, or
cancellation latency during a long skipped-frame decode scan. Native code handles
row stride through Core Image and polls cancellation between decoded samples;
representative codec and latency measurements remain to be performed.

The existing frontend unit suite and video browser scripts exercise manual
synchronization regressions. Browser scripts simulate media readiness and clock
behavior; they do not establish real WebView codec support or Purdue footage
quality. Building a bundle establishes native link/package integration, not a
manual playback or performance result.

The final implementation run passed all 91 Rust tests (including seven native
video-analysis tests), `cargo check`, targeted Rust formatting, whitespace checks,
161 frontend unit tests, the frontend production build, both video browser
integration scripts, and the macOS release application bundle build. The bundle
was rebuilt after the sampling-grid correction. Rust reports the existing
`binrw 0.14.2` future-Rust-compatibility warning.

Repository-wide `cargo fmt -- --check` fails only on pre-existing formatting in
`src-tauri/examples/inspect.rs` and `src-tauri/src/main.rs`; those unrelated files
were preserved. To reproduce the passing changed-file formatting check:

```sh
rustfmt --edition 2021 --check src-tauri/build.rs src-tauri/src/lib.rs \
  src-tauri/src/video_analysis/mod.rs src-tauri/src/video_analysis/macos.rs \
  src-tauri/tests/video_analysis.rs
```

## Remaining validation for later stages

Measure long-clip throughput and peak decoder memory on representative Purdue
Grand Prix recordings. Label actual crossings and check footage orientation,
lighting, motion blur, shadows, codec variants, and recorder timestamp behavior
before deciding line-detection thresholds. Validate other track footage before
claiming generalization. Windows decoding and Windows packaging remain future
work.
