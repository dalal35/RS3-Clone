# Native media fixtures

All fixture content is original solid color fields and digital silence, dedicated
under CC0-1.0. No private recordings, downloaded media, logos, or music are included.
Fixtures and creation tools are test-only and are not bundled in Ten Tenths Telemetry.

- macOS uses the unchanged `generate.m` AVFoundation MJPEG MOV generator, at 64×32.
- Windows copies the seven pinned H.264/AAC MP4 files in `windows/` to unique
  temporary files. Their SHA256 hashes are checked before every copy. Windows
  tests require the system Media Foundation decoder, with no encoder or FFmpeg
  dependency on the runner or in the application.

Windows sources are 128×64, above the [H.264 decoder's 48×48 minimum](https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-decoder).
Both platforms retain asymmetric 2:1 fields and exact 32×16 resize assertions.
The Windows VFR fixture has exactly four video frames, red/green/blue/black, at
presentation timestamps 2.0, 2.1, 2.4 and 2.9 seconds. Its MP4 sample-duration table
is 0.1, 0.3, 0.5 and 0.5 seconds, ending at 3.4. Silent AAC starts at presentation
zero, anchoring the video's two-second offset in a shared presentation timeline.
The pattern variant has red upper and blue lower halves; rotation changes only
its display matrix to a clockwise quarter turn (blue left, red right).

The CFR variant has eight frames at 0.0 through 0.7 seconds. The B-frame variant
has 30 decoded frames at 0.0 through 2.9 seconds; inspection proves actual B
pictures and reordered packet PTS/DTS, beyond merely requesting encoder settings.
The 600-frame CFR variant exercises cancellation while scanning skipped frames.
The audio-only variant proves structured rejection of media without video.

`windows/manifest.json` records byte hashes, dimensions, sample counts, actual
packet PTS/DTS and decoded frame PTS for the short fixtures, decoded picture-type
counts, rotation, the VFR duration table, and the audio anchor. FFmpeg's last
packet duration display uses its nominal estimate; the inspected MP4 `stts` table
records the exact final 0.5-second duration. No test assertion was relaxed.

## Reproduction and provenance

Run the offline recipe from the repository root:

```sh
python3 src-tauri/tests/fixtures/generate_windows.py --ffmpeg /path/to/ffmpeg-macos-aarch64-v7.1
```

The pinned tool is FFmpeg 7.1 with libx264, from the public
[imageio-ffmpeg 0.6.0 macOS arm64 wheel](https://pypi.org/project/imageio-ffmpeg/0.6.0/#files),
`imageio_ffmpeg-0.6.0-py3-none-macosx_11_0_arm64.whl`:

- Wheel SHA256: `b1ae3173414b5fc5f538a726c4e48ea97edc0d2cdc11f103afee655c463fa742`
- Extracted binary SHA256: `6d175a4743ca50256e89a8cdd731100f9cee33bd79aeea46894d209410dc6617`

The recipe verifies the binary hash, encodes only generated RGB fields/silence,
uses a single encoder thread and bitexact metadata settings, and inspects every
packet and decoded frame using that same pinned tool. Its `setts` filter explicitly
writes the VFR packet times/durations. Rotation changes the original video track's
ISO BMFF matrix without remuxing or altering timestamps. Tool binaries are not
checked in or redistributed with these test fixtures.

The previous system Sink Writer recipe generated media whose timestamps differed
from its supplied input times: native CI observed VFR beginning at zero and the
B-frame variant beginning at 0.1. Static, independently inspected media isolates
the decoder contract from those test encoder/muxer behaviors. Native Windows CI
must still verify all exact timestamp, color, rotation, resize and cancellation
contracts before these files establish Media Foundation runtime acceptance.
