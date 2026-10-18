#!/usr/bin/env python3
"""Offline-only creation/inspection of original Windows decoder test fixtures.

Requires the pinned imageio-ffmpeg 0.6.0 macOS arm64 FFmpeg 7.1 binary,
never a CI or application dependency. See README.md for provenance and hashes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile

BINARY_SHA256 = "6d175a4743ca50256e89a8cdd731100f9cee33bd79aeea46894d209410dc6617"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "windows")
    args = parser.parse_args()
    assert digest(args.ffmpeg.read_bytes()) == BINARY_SHA256, "Use the documented pinned tool"
    args.output.mkdir(parents=True, exist_ok=True)

    def run(options):
        return subprocess.run([str(args.ffmpeg), *options], check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE).stderr.decode()

    pattern = b"".join(bytes((255, 0, 0) if y < 32 else (0, 0, 255)) * 128 for y in range(64))
    colors = b"".join(bytes(c) * 128 * 64 for c in ((255, 0, 0), (0, 255, 0),
                                                 (0, 0, 255), (0, 0, 0)))
    common = ["-c:v", "libx264", "-preset", "veryslow", "-crf", "10", "-pix_fmt", "yuv420p",
              "-profile:v", "main", "-threads:v", "1", "-video_track_timescale", "10000000",
              "-use_editlist", "1", "-movflags", "+faststart", "-fflags", "+bitexact",
              "-flags:v", "+bitexact", "-map_metadata", "-1"]
    expr = "if(eq(N,0),20,if(eq(N,1),21,if(eq(N,2),24,29)))"
    with tempfile.TemporaryDirectory(prefix="ttt-original-media-") as temporary:
        for mode, count in [("vfr", 4), ("pattern", 4), ("cfr", 8), ("bframes", 30), ("long", 600)]:
            raw = Path(temporary) / f"{mode}.rgb"
            raw.write_bytes(colors if mode == "vfr" else pattern * count)
            options = ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
                       "-pixel_format", "rgb24", "-video_size", "128x64", "-framerate", "10",
                       "-i", str(raw)]
            if mode in ("vfr", "pattern"):
                # Audio at presentation zero anchors video at two seconds in the
                # common presentation timeline; a video-only empty edit can be
                # normalized by some system MP4 muxer/source combinations.
                options += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-map", "0:v",
                            "-map", "1:a", "-c:a", "aac", "-b:a", "32k", "-flags:a", "+bitexact",
                            "-t", "3.4", "-bsf:v", f"setts=pts='{expr}':dts='{expr}':"
                            "duration='if(eq(N,0),1,if(eq(N,1),3,5))':time_base=1/10"]
            options += common + ["-bf", "2" if mode == "bframes" else "0"]
            if mode == "bframes":
                options += ["-x264-params", "b-adapt=0:keyint=60:min-keyint=60:scenecut=0"]
            run(options + [str(args.output / f"{mode}.mp4")])

    # Change only the video track's ISO BMFF display matrix, preserving all
    # inspected sample durations, offsets, and audio from pattern.mp4.
    rotated = bytearray((args.output / "pattern.mp4").read_bytes())
    tkhd = rotated.index(b"tkhd") - 4
    assert struct.unpack_from(">9i", rotated, tkhd + 48) == (65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824)
    struct.pack_into(">9i", rotated, tkhd + 48, 0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824)
    (args.output / "rotate.mp4").write_bytes(rotated)
    run(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
         "anullsrc=r=48000:cl=mono", "-t", "0.1", "-c:a", "aac", "-b:a", "32k",
         "-flags:a", "+bitexact", "-fflags", "+bitexact", "-map_metadata", "-1",
         str(args.output / "audio.mp4")])

    manifest = {"original_content": "Original solid RGB fields and digital silence; CC0-1.0",
                "tool": {"distribution": "imageio-ffmpeg 0.6.0 macOS arm64", "ffmpeg": "7.1",
                         "binary_sha256": BINARY_SHA256,
                         "wheel_sha256": "b1ae3173414b5fc5f538a726c4e48ea97edc0d2cdc11f103afee655c463fa742"},
                "files": {}}
    for path in sorted(args.output.glob("*.mp4")):
        item = {"size": path.stat().st_size, "sha256": digest(path.read_bytes())}
        if path.stem == "audio":
            info = run(["-hide_banner", "-copyts", "-i", str(path), "-af", "ashowinfo", "-f", "null", "-"])
            assert "type:video" not in info and "Video:" not in info
            assert re.search(r"n:0 pts:0 pts_time:0", info)
            item.update(audio_only=True, first_decoded_audio_pts=0)
        else:
            # Stream copy reports stored demux packet timestamps; showinfo then
            # independently decodes every frame and reports PTS and picture type.
            packets = run(["-hide_banner", "-debug_ts", "-copyts", "-i", str(path),
                           "-map", "0:v", "-c:v", "copy", "-f", "null", "-"])
            packet_times = [[int(x), int(y)] for x, y in re.findall(
                r"demuxer -> .*?pkt_pts:(-?\d+).*?pkt_dts:(-?\d+)", packets)]
            decoded = run(["-hide_banner", "-copyts", "-threads", "1", "-i", str(path),
                           "-map", "0:v", "-vf", "showinfo", "-f", "null", "-"])
            frames = [(int(t), kind) for t, kind in re.findall(
                r"\bn:\s*\d+ pts:\s*(-?\d+).*? type:([IPB])", decoded)]
            count = {"vfr": 4, "pattern": 4, "rotate": 4, "cfr": 8, "bframes": 30, "long": 600}[path.stem]
            expected = [20000000, 21000000, 24000000, 29000000] if count == 4 else [i * 1000000 for i in range(count)]
            assert [t for t, _ in frames] == expected, (path, frames)
            assert sorted(t for t, _ in packet_times) == expected
            assert len(packet_times) == count
            if path.stem == "bframes":
                assert any(kind == "B" for _, kind in frames)
                assert any(pts != dts for pts, dts in packet_times)
            item.update(width=128, height=64, timebase="1/10000000", decoded_frames=count,
                        first_pts=expected[0], last_pts=expected[-1],
                        picture_types={kind: sum(k == kind for _, k in frames) for kind in "IPB"})
            if count <= 30:
                item.update(packet_pts_dts=packet_times, decoded_pts=[t for t, _ in frames])
            if count == 4:
                # The stts table explicitly retains the final half-second sample;
                # FFmpeg's demuxer reports its nominal duration for the last packet.
                data = path.read_bytes()
                start = data.index(b"stts") - 4
                entries = struct.unpack_from(">I", data, start + 12)[0]
                runs = [struct.unpack_from(">II", data, start + 16 + i * 8) for i in range(entries)]
                durations = [duration for n, duration in runs for _ in range(n)]
                assert durations == [1000000, 3000000, 5000000, 5000000]
                item.update(sample_table_durations=durations, presentation_duration_seconds=3.4,
                            anchor_audio_first_decoded_pts=0)
                audio = run(["-hide_banner", "-copyts", "-i", str(path), "-map", "0:a", "-af", "ashowinfo", "-f", "null", "-"])
                assert re.search(r"n:0 pts:0 pts_time:0", audio)
            if path.stem == "rotate":
                assert "rotation of -90.00 degrees" in decoded
                rgb = subprocess.run([str(args.ffmpeg), "-hide_banner", "-loglevel", "error", "-i", str(path),
                                      "-map", "0:v", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                                     check=True, stdout=subprocess.PIPE).stdout
                assert len(rgb) == 64 * 128 * 3 and rgb[2] > 210 and rgb[0] < 50
                assert rgb[63 * 3] > 210 and rgb[63 * 3 + 2] < 50
                item["clockwise_rotation_degrees"] = 90
        manifest["files"][path.name] = item
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Generated and inspected {len(manifest['files'])} original fixtures")


if __name__ == "__main__":
    main()
