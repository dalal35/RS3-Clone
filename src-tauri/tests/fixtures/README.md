# Native media fixtures

These fixtures are generated from original color fields and contain no private
recordings or downloaded media. Generation code is test-only and is not bundled
in Ten Tenths Telemetry.

- macOS: `generate.m`, unchanged AVFoundation MJPEG MOV generator.
- Windows: `windows_generate.rs`, Media Foundation Sink Writer, software H.264
  MP4 from original NV12 color fields and AAC audio-only output. Windows system media components are prerequisites.

The macOS MJPEG generator produces 64×32 source images; Windows H.264 uses
128×64 to exceed the [system decoder minimum of 48×48](https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-decoder). Both preserve the same asymmetric 2:1 color fields and the exact 32×16
resized-frame assertions. The default has source PTS
2.0, 2.1, 2.4, 2.9 seconds and a final 0.5-second duration. Frames are red,
green, blue, then black. Pattern and rotation variants use red upper and blue
lower halves; rotation records a clockwise 90-degree display transform.
The CFR variant has eight frames at 0.0 through 0.7 seconds, spaced 0.1 seconds.
Windows additionally generates 30 H.264 frames with Main profile and an explicitly
requested, read-back-verified B-picture count of two, plus 600 CFR frames for
cancellation during skipped-frame scanning.

Windows fixture recipes and decoder sources have been typechecked for the MSVC
Rust target on macOS. The first native CI attempt failed during media-type setup; corrected NV12 input and encoder parameters await the next native run.
In particular, Sink Writer edit-list/start-delay handling, encoded rotation and
actual B-picture output must pass the native assertions on Windows before they
constitute runtime evidence. Encoder property acceptance alone does not prove
bitstream contents. If a Windows system encoder cannot express the required
container timing/rotation, retain failing assertions and introduce a tiny
redistributable fixture with an inspected bitstream and recorded creation recipe;
do not silently normalize timestamps, omit orientation checks, or skip tests.

macOS metadata describes the native track range (including an empty leading
edit); Windows metadata currently records the first actual video presentation
sample. Frame timestamps on both must preserve playback time. The integration
tests assert the corresponding metadata expectation explicitly.
