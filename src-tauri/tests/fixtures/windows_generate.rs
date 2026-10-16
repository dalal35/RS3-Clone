//! Test-only generated, original media. H.264/AAC MP4 through Windows system encoders.
//! No fixture generation or encoder dependency is shipped with the application.
use std::{os::windows::ffi::OsStrExt, path::Path};
use windows::{
    core::{Interface, GUID, PCWSTR},
    Win32::{
        Media::MediaFoundation::*,
        System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
    },
};
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
struct Runtime {
    _apartment: Apartment,
}
impl Drop for Runtime {
    fn drop(&mut self) {
        unsafe {
            let _ = MFShutdown();
        }
    }
}
// The Windows system H.264 decoder requires at least 48x48 pixels.
// Preserve the asymmetric 2:1 field and resize contracts above that OS minimum.
const WIDTH: u32 = 128;
const HEIGHT: u32 = 64;
unsafe fn dimensions(media: &IMFMediaType) -> windows::core::Result<()> {
    media.SetUINT64(&MF_MT_FRAME_SIZE, ((WIDTH as u64) << 32) | HEIGHT as u64)?;
    media.SetUINT64(&MF_MT_FRAME_RATE, (10u64 << 32) | 1)?;
    media.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1)?;
    media.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
}
unsafe fn sample(bytes: &[u8], time: i64, duration: i64) -> windows::core::Result<IMFSample> {
    let buffer = MFCreateMemoryBuffer(bytes.len() as u32)?;
    let mut address = std::ptr::null_mut();
    buffer.Lock(&mut address, None, None)?;
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), address, bytes.len());
    buffer.Unlock()?;
    buffer.SetCurrentLength(bytes.len() as u32)?;
    let sample = MFCreateSample()?;
    sample.AddBuffer(&buffer)?;
    sample.SetSampleTime(time)?;
    sample.SetSampleDuration(duration)?;
    Ok(sample)
}
pub fn generate(path: &Path, mode: &str) -> windows::core::Result<()> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        let apartment = Apartment;
        MFStartup(MF_VERSION, MFSTARTUP_FULL)?;
        let _runtime = Runtime {
            _apartment: apartment,
        };
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut attributes = None;
        MFCreateAttributes(&mut attributes, 3)?;
        let attributes = attributes.unwrap();
        attributes.SetGUID(&MF_TRANSCODE_CONTAINERTYPE, &MFTranscodeContainerType_MPEG4)?;
        attributes.SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1)?;
        attributes.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 0)?;
        let writer = MFCreateSinkWriterFromURL(PCWSTR(wide.as_ptr()), None, &attributes)?;
        if mode == "audio" {
            let output = MFCreateMediaType()?;
            output.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            output.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)?;
            output.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1)?;
            output.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 44100)?;
            output.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            output.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 12000)?;
            let stream = writer.AddStream(&output).map_err(|e| {
                windows::core::Error::new(e.code(), format!("Add {mode:?} fixture stream: {e}"))
            })?;
            let input = MFCreateMediaType()?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            input.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
            input.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1)?;
            input.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 44100)?;
            input.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            input.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 2)?;
            input.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 88200)?;
            writer
                .SetInputMediaType(stream, &input, None)
                .map_err(|e| {
                    windows::core::Error::new(
                        e.code(),
                        format!("Configure {mode:?} fixture input: {e}"),
                    )
                })?;
            writer.BeginWriting().map_err(|e| {
                windows::core::Error::new(e.code(), format!("Begin {mode:?} fixture encoding: {e}"))
            })?;
            writer.WriteSample(stream, &sample(&vec![0; 8820], 0, 1_000_000)?)?;
            return writer.Finalize();
        }
        let output = MFCreateMediaType()?;
        output.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        output.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
        output.SetUINT32(&MF_MT_AVG_BITRATE, 1_000_000)?;
        dimensions(&output)?;
        // MP4 rotation metadata; the shared asymmetric test must prove runtime handling.
        if mode == "rotate" {
            output.SetUINT32(&MF_MT_VIDEO_ROTATION, 90)?;
        }
        if mode == "bframes" {
            output.SetUINT32(&MF_MT_MPEG2_PROFILE, 77)?;
        }
        let stream = writer.AddStream(&output).map_err(|e| {
            windows::core::Error::new(e.code(), format!("Add {mode:?} fixture stream: {e}"))
        })?;
        let input = MFCreateMediaType()?;
        input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        // Feed the software H.264 encoder one of its native input subtypes.
        // RGB32 needs an additional converter that Sink Writer does not guarantee.
        input.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)?;
        dimensions(&input)?;
        input.SetUINT32(&MF_MT_DEFAULT_STRIDE, WIDTH)?;
        let mut encoding = None;
        if mode == "bframes" {
            // Sink Writer applies these parameters while configuring the encoder;
            // BPictureCount must precede the encoder's SetOutputType call.
            MFCreateAttributes(&mut encoding, 1)?;
            encoding
                .as_ref()
                .unwrap()
                .SetUINT32(&CODECAPI_AVEncMPVDefaultBPictureCount, 2)?;
        }
        writer
            .SetInputMediaType(stream, &input, encoding.as_ref())
            .map_err(|e| {
                windows::core::Error::new(
                    e.code(),
                    format!("Configure {mode:?} fixture input: {e}"),
                )
            })?;
        if mode == "bframes" {
            let mut raw = std::ptr::null_mut();
            writer.GetServiceForStream(stream, &GUID::zeroed(), &ICodecAPI::IID, &mut raw)?;
            let codec = ICodecAPI::from_raw(raw);
            let selected = codec.GetValue(&CODECAPI_AVEncMPVDefaultBPictureCount)?;
            assert_eq!(
                u32::try_from(&selected).expect("B-frame property is u32"),
                2,
                "Encoder must enable B frames, not silently use baseline profile"
            );
        }
        writer.BeginWriting().map_err(|e| {
            windows::core::Error::new(e.code(), format!("Begin {mode:?} fixture encoding: {e}"))
        })?;
        let ticks: Vec<i64> = match mode {
            "cfr" => (0..8).collect(),
            "bframes" => (0..30).collect(),
            "long" => (0..600).collect(),
            _ => vec![20, 21, 24, 29],
        };
        for (i, tick) in ticks.iter().enumerate() {
            // Original BT.601 limited-range NV12 color fields: one luma plane,
            // then interleaved U/V at half resolution. The half-image boundary
            // is chroma-aligned, so the top-down and rotation checks stay exact.
            let mut bytes = vec![0u8; (WIDTH * HEIGHT * 3 / 2) as usize];
            for y in 0..HEIGHT {
                let color = if !mode.is_empty() {
                    if y < HEIGHT / 2 {
                        0
                    } else {
                        2
                    }
                } else {
                    i.min(3)
                };
                let [luma, u, v] = match color {
                    0 => [81, 90, 240],  // red
                    1 => [145, 54, 34],  // green
                    2 => [41, 240, 110], // blue
                    _ => [16, 128, 128], // black
                };
                bytes[(y * WIDTH) as usize..((y + 1) * WIDTH) as usize].fill(luma);
                if y % 2 == 0 {
                    let start = (WIDTH * HEIGHT + y / 2 * WIDTH) as usize;
                    for chroma in bytes[start..start + WIDTH as usize].chunks_exact_mut(2) {
                        chroma.copy_from_slice(&[u, v]);
                    }
                }
            }
            let duration = ticks.get(i + 1).map(|next| next - tick).unwrap_or(
                if mode.is_empty() || mode == "pattern" || mode == "rotate" {
                    5
                } else {
                    1
                },
            );
            writer.WriteSample(
                stream,
                &sample(&bytes, tick * 1_000_000, duration * 1_000_000)?,
            )?;
        }
        writer.Finalize().map_err(|e| {
            windows::core::Error::new(e.code(), format!("Finalize {mode:?} fixture: {e}"))
        })
    }
}
