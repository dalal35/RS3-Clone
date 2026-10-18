//! Original pinned H.264/AAC test data; see fixtures/README.md and windows/manifest.json.
//! Copy into unique temporary paths so every native test can prove handle cleanup.
use sha2::{Digest, Sha256};
use std::path::Path;

pub fn generate(path: &Path, mode: &str) -> std::io::Result<()> {
    let (name, bytes): (&str, &[u8]) = match mode {
        "" => ("vfr.mp4", include_bytes!("windows/vfr.mp4")),
        "pattern" => ("pattern.mp4", include_bytes!("windows/pattern.mp4")),
        "rotate" => ("rotate.mp4", include_bytes!("windows/rotate.mp4")),
        "cfr" => ("cfr.mp4", include_bytes!("windows/cfr.mp4")),
        "bframes" => ("bframes.mp4", include_bytes!("windows/bframes.mp4")),
        "long" => ("long.mp4", include_bytes!("windows/long.mp4")),
        "audio" => ("audio.mp4", include_bytes!("windows/audio.mp4")),
        _ => panic!("Unknown synthetic media fixture mode: {mode:?}"),
    };
    let manifest: serde_json::Value = serde_json::from_str(include_str!("windows/manifest.json"))
        .expect("Synthetic fixture manifest must be valid JSON");
    assert_eq!(
        format!("{:x}", Sha256::digest(bytes)),
        manifest["files"][name]["sha256"].as_str().unwrap(),
        "Synthetic fixture bytes must match their inspected provenance"
    );
    std::fs::write(path, bytes)
}
