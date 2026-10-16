//! Test-only generated, original media. H.264/AAC MP4 through Windows system encoders.
//! No fixture generation or encoder dependency is shipped with the application.
use std::{os::windows::ffi::OsStrExt, path::Path};
use windows::{
    core::{Interface, GUID, PCWSTR},
    Win32::{
        Media::MediaFoundation::*,
        System::{
            Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
            Variant::VARIANT,
        },
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
const WIDTH: u32 = 64;
const HEIGHT: u32 = 32;
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
            let stream = writer.AddStream(&output)?;
            let input = MFCreateMediaType()?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            input.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
            input.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1)?;
            input.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 44100)?;
            input.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            input.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 2)?;
            input.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 88200)?;
            writer.SetInputMediaType(stream, &input, None)?;
            writer.BeginWriting()?;
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
        let stream = writer.AddStream(&output)?;
        let input = MFCreateMediaType()?;
        input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        input.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)?;
        dimensions(&input)?;
        input.SetUINT32(&MF_MT_DEFAULT_STRIDE, WIDTH * 4)?;
        writer.SetInputMediaType(stream, &input, None)?;
        if mode == "bframes" {
            let mut raw = std::ptr::null_mut();
            writer.GetServiceForStream(stream, &GUID::zeroed(), &ICodecAPI::IID, &mut raw)?;
            let codec = ICodecAPI::from_raw(raw);
            codec.SetValue(&CODECAPI_AVEncMPVDefaultBPictureCount, &VARIANT::from(2u32))?;
            let selected = codec.GetValue(&CODECAPI_AVEncMPVDefaultBPictureCount)?;
            assert_eq!(
                u32::try_from(&selected).expect("B-frame property is u32"),
                2,
                "Encoder must enable B frames, not silently use baseline profile"
            );
        }
        writer.BeginWriting()?;
        let ticks: Vec<i64> = match mode {
            "cfr" => (0..8).collect(),
            "bframes" => (0..30).collect(),
            "long" => (0..600).collect(),
            _ => vec![20, 21, 24, 29],
        };
        for (i, tick) in ticks.iter().enumerate() {
            let mut bytes = vec![0u8; (WIDTH * HEIGHT * 4) as usize];
            for y in 0..HEIGHT {
                for x in 0..WIDTH {
                    let p = &mut bytes[((y * WIDTH + x) * 4) as usize..][..4];
                    let rgb = if !mode.is_empty() {
                        if y < HEIGHT / 2 {
                            [255, 0, 0]
                        } else {
                            [0, 0, 255]
                        }
                    } else {
                        match i {
                            0 => [255, 0, 0],
                            1 => [0, 255, 0],
                            2 => [0, 0, 255],
                            _ => [0, 0, 0],
                        }
                    };
                    p.copy_from_slice(&[rgb[2], rgb[1], rgb[0], 255]);
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
        writer.Finalize()
    }
}
