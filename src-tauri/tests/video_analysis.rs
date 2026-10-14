#![cfg(target_os = "macos")]
use apex_telemetry::video_analysis::*;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
fn fixture() -> PathBuf {
    fixture_mode("")
}
fn fixture_mode(mode: &str) -> PathBuf {
    static GENERATOR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    let generator = GENERATOR.get_or_init(|| {
        let exe = std::env::temp_dir().join(format!("apex-fixture-{}", std::process::id()));
        assert!(std::process::Command::new("clang")
            .args([
                "-fobjc-arc",
                "-framework",
                "Foundation",
                "-framework",
                "AVFoundation",
                "-framework",
                "CoreVideo",
                "-framework",
                "CoreMedia",
                "-framework",
                "CoreGraphics",
                "tests/fixtures/generate.m",
                "-o"
            ])
            .arg(&exe)
            .status()
            .unwrap()
            .success());
        exe
    });
    let path = std::env::temp_dir().join(format!(
        "apex-video-{}-{}.mov",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut command = std::process::Command::new(generator);
    command.arg(&path);
    if !mode.is_empty() {
        command.arg(mode);
    }
    assert!(command.status().unwrap().success());
    path
}
#[test]
fn real_vfr_metadata_frames_sampling_and_cleanup() {
    let path = fixture();
    let cancel = CancellationToken::default();
    let metadata = inspect(&path, &cancel).unwrap();
    assert_eq!((metadata.width, metadata.height), (64, 32));
    assert!(
        metadata.duration_seconds >= 3.3 && metadata.duration_seconds <= 3.5,
        "{metadata:?}"
    );
    assert!(metadata.track_start_seconds.abs() < 0.001, "{metadata:?}");
    for _ in 0..12 {
        let frame = extract_frame(
            &path,
            2.11,
            ResizeOptions {
                max_width: 32,
                max_height: 32,
            },
            PixelFormat::Rgb8,
            &cancel,
        )
        .unwrap();
        assert!((frame.timestamp_seconds - 2.4).abs() < 0.001);
        assert_eq!(
            (frame.width, frame.height, frame.pixels.len()),
            (32, 16, 1536)
        );
        assert!(
            frame.pixels[0] < 50 && frame.pixels[1] < 50 && frame.pixels[2] > 210,
            "{:?}",
            &frame.pixels[..3]
        );
    }
    let mut times = vec![];
    let mut progress = vec![];
    sample_frames(
        &path,
        SamplingOptions {
            start_seconds: 2.0,
            end_seconds: Some(3.0),
            interval_seconds: 0.2,
            resize: ResizeOptions::default(),
            pixel_format: PixelFormat::Gray8,
        },
        &cancel,
        |frame| {
            assert_eq!(frame.pixels.len(), (frame.width * frame.height) as usize);
            times.push(frame.timestamp_seconds);
            Ok(())
        },
        |p| progress.push(p),
    )
    .unwrap();
    assert_eq!(times.len(), 3);
    for (a, b) in times.iter().zip([2.0, 2.4, 2.9]) {
        assert!((*a - b).abs() < 0.001);
    }
    assert_eq!(progress.last().unwrap().status, ProcessingStatus::Completed);
    assert_eq!(progress.last().unwrap().processed_frames, 3);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn invalid_inputs_and_cancellation_are_structured() {
    let path = fixture();
    let cancel = CancellationToken::default();
    assert_eq!(
        extract_frame(
            &path,
            f64::NAN,
            ResizeOptions::default(),
            PixelFormat::Rgb8,
            &cancel
        )
        .unwrap_err()
        .kind,
        ErrorKind::InvalidOptions
    );
    assert_eq!(
        extract_frame(
            &path,
            5.0,
            ResizeOptions::default(),
            PixelFormat::Rgb8,
            &cancel
        )
        .unwrap_err()
        .kind,
        ErrorKind::FrameUnavailable
    );
    assert_eq!(
        extract_frame(
            &path,
            0.0,
            ResizeOptions {
                max_width: 0,
                max_height: 10
            },
            PixelFormat::Rgb8,
            &cancel
        )
        .unwrap_err()
        .kind,
        ErrorKind::InvalidOptions
    );
    assert_eq!(
        sample_frames(
            &path,
            SamplingOptions {
                interval_seconds: 0.0,
                ..Default::default()
            },
            &cancel,
            |_| Ok(()),
            |_| {}
        )
        .unwrap_err()
        .kind,
        ErrorKind::InvalidOptions
    );
    assert_eq!(
        inspect(&PathBuf::from("/does-not-exist.mp4"), &cancel)
            .unwrap_err()
            .kind,
        ErrorKind::InvalidInput
    );
    let bad = path.with_file_name(format!("bad-{}.mp4", std::process::id()));
    std::fs::write(&bad, b"not a movie").unwrap();
    assert_eq!(inspect(&bad, &cancel).unwrap_err().kind, ErrorKind::Decode);
    std::fs::remove_file(bad).unwrap();
    cancel.cancel();
    assert_eq!(
        inspect(&path, &cancel).unwrap_err().kind,
        ErrorKind::Cancelled
    );
    let cancel = CancellationToken::default();
    let mut count = 0;
    assert_eq!(
        sample_frames(
            &path,
            SamplingOptions {
                interval_seconds: 0.01,
                ..Default::default()
            },
            &cancel,
            |_| {
                count += 1;
                cancel.cancel();
                Ok(())
            },
            |_| {}
        )
        .unwrap_err()
        .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(count, 1);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn rotated_pixels_are_top_down_and_consumer_error_finishes_progress() {
    let path = fixture_mode("rotate");
    let token = CancellationToken::default();
    let meta = inspect(&path, &token).unwrap();
    assert_eq!((meta.width, meta.height), (32, 64));
    let frame = extract_frame(
        &path,
        2.0,
        ResizeOptions::default(),
        PixelFormat::Rgb8,
        &token,
    )
    .unwrap();
    // A clockwise quarter turn maps the source lower half to the left side.
    assert!(
        frame.pixels[2] > 210 && frame.pixels[0] < 50,
        "left {:?}",
        &frame.pixels[..3]
    );
    let right = (frame.width as usize - 1) * 3;
    assert!(
        frame.pixels[right] > 210 && frame.pixels[right + 2] < 50,
        "right {:?}",
        &frame.pixels[right..right + 3]
    );
    let mut progress = vec![];
    let error = sample_frames(
        &path,
        SamplingOptions::default(),
        &token,
        |_| {
            Err(VideoAnalysisError::new(
                ErrorKind::Consumer,
                "stop consumer",
            ))
        },
        |p| progress.push(p),
    )
    .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Consumer);
    assert_eq!(progress.last().unwrap().status, ProcessingStatus::Failed);
    // The file can be reopened and removed after an early consumer exit.
    inspect(&path, &token).unwrap();
    std::fs::remove_file(path).unwrap();
}

#[test]
fn async_worker_preserves_pts_and_owned_frames() {
    let path = fixture();
    let timestamps = std::sync::Arc::new(std::sync::Mutex::new(vec![]));
    let captured = timestamps.clone();
    tauri::async_runtime::block_on(sample_frames_async(
        path.clone(),
        SamplingOptions {
            start_seconds: 2.0,
            end_seconds: Some(3.0),
            ..Default::default()
        },
        CancellationToken::default(),
        move |frame| {
            captured.lock().unwrap().push((
                frame.timestamp_seconds,
                frame.timestamp_value as f64 / frame.timestamp_timescale as f64,
            ));
            Ok(())
        },
        |_| {},
    ))
    .unwrap();
    let values = timestamps.lock().unwrap();
    assert_eq!(values.len(), 3);
    assert!(values
        .iter()
        .all(|(seconds, rational)| (seconds - rational).abs() < 1e-12));
    std::fs::remove_file(path).unwrap();
}

#[test]
fn no_video_track_and_truncated_file_fail_without_panics() {
    let audio = fixture_mode("audio");
    let token = CancellationToken::default();
    assert_eq!(inspect(&audio, &token).unwrap_err().kind, ErrorKind::Decode);
    std::fs::remove_file(audio).unwrap();
    let path = fixture();
    let bytes = std::fs::read(&path).unwrap();
    std::fs::write(&path, &bytes[..bytes.len() / 2]).unwrap();
    let result = sample_frames(
        &path,
        SamplingOptions::default(),
        &token,
        |_| Ok(()),
        |_| {},
    );
    assert_eq!(result.unwrap_err().kind, ErrorKind::Decode);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn top_down_layout_and_imprecise_interval_rejection() {
    let path = fixture_mode("pattern");
    let token = CancellationToken::default();
    let frame = extract_frame(
        &path,
        2.0,
        ResizeOptions::default(),
        PixelFormat::Rgb8,
        &token,
    )
    .unwrap();
    assert!(
        frame.pixels[0] > 210 && frame.pixels[2] < 50,
        "top {:?}",
        &frame.pixels[..3]
    );
    let bottom = ((frame.height - 1) * frame.width * 3) as usize;
    assert!(
        frame.pixels[bottom + 2] > 210 && frame.pixels[bottom] < 50,
        "bottom {:?}",
        &frame.pixels[bottom..bottom + 3]
    );
    assert_eq!(
        sample_frames(
            &path,
            SamplingOptions {
                interval_seconds: f64::MIN_POSITIVE,
                ..Default::default()
            },
            &token,
            |_| Ok(()),
            |_| {}
        )
        .unwrap_err()
        .kind,
        ErrorKind::InvalidOptions
    );
    std::fs::remove_file(path).unwrap();
}

#[test]
fn decimal_sampling_grid_preserves_every_exact_cfr_sample() {
    let path = fixture_mode("cfr");
    let token = CancellationToken::default();
    let mut times = vec![];
    sample_frames(
        &path,
        SamplingOptions {
            interval_seconds: 0.1,
            end_seconds: Some(0.8),
            ..Default::default()
        },
        &token,
        |frame| {
            times.push(frame.timestamp_seconds);
            Ok(())
        },
        |_| {},
    )
    .unwrap();
    assert_eq!(times, (0..8).map(|i| i as f64 / 10.0).collect::<Vec<_>>());
    let strict = extract_frame(
        &path,
        0.1 + 0.2,
        ResizeOptions::default(),
        PixelFormat::Rgb8,
        &token,
    )
    .unwrap();
    assert_eq!(strict.timestamp_seconds, 0.4);
    let mut times = vec![];
    sample_frames(
        &path,
        SamplingOptions {
            start_seconds: 0.1 + 0.2,
            interval_seconds: 0.1,
            end_seconds: Some(0.5),
            ..Default::default()
        },
        &token,
        |frame| {
            times.push(frame.timestamp_seconds);
            Ok(())
        },
        |_| {},
    )
    .unwrap();
    assert_eq!(times, vec![0.4]);
    std::fs::remove_file(path).unwrap();
}
