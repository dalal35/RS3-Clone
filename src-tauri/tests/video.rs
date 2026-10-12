use apex_telemetry::video::inspect_local_video;
use std::{fs, path::PathBuf};

struct Sandbox(PathBuf);
impl Sandbox {
    fn new(label: &str) -> Self {
        let path = std::env::temp_dir().join(format!("apex-video-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Sandbox {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn missing_reference_is_repairable() {
    let root = Sandbox::new("missing");
    let path = root.0.join("moved.mp4");
    let info = inspect_local_video(&path).unwrap();
    assert_eq!(info.status, "missing");
    assert_eq!(info.path, path.to_str().unwrap());
    assert_eq!(info.size, 0);
    assert_eq!(info.modified_ms, 0);
}

#[test]
fn rejects_directory_and_wrong_extension() {
    let root = Sandbox::new("invalid");
    let directory = root.0.join("directory.mp4");
    fs::create_dir(&directory).unwrap();
    assert!(inspect_local_video(&directory).is_err());
    let wrong = root.0.join("source.txt");
    fs::write(&wrong, b"not a video").unwrap();
    assert!(inspect_local_video(&wrong).is_err());
    assert!(inspect_local_video(&root.0.join("missing.txt")).is_err());
}

#[test]
fn unicode_filename_preserves_metadata() {
    let root = Sandbox::new("unicode");
    let path = root.0.join("走行 café [final].MP4");
    // Container/codec decoding belongs to the player, not this metadata inspector.
    fs::write(&path, b"metadata fixture").unwrap();
    let info = inspect_local_video(&path).unwrap();
    assert_eq!(info.status, "ready");
    assert_eq!(
        info.path,
        fs::canonicalize(&path).unwrap().to_str().unwrap()
    );
    assert_eq!(info.size, 16);
    assert!(info.modified_ms > 0);
    let wire = serde_json::to_value(info).unwrap();
    assert!(wire["modifiedMs"].is_number());
    assert!(wire.get("modified_ms").is_none());
    let mov = root.0.join("second.MoV");
    fs::write(&mov, b"mov").unwrap();
    assert_eq!(inspect_local_video(&mov).unwrap().status, "ready");
}

#[cfg(unix)]
#[test]
fn video_rejects_unreadable_sources_when_permissions_apply() {
    use std::os::unix::fs::PermissionsExt;
    let root = Sandbox::new("permissions");
    let path = root.0.join("unreadable.mp4");
    fs::write(&path, b"fixture").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    // Root can still read mode-000 files; check the host can represent this condition.
    if fs::File::open(&path).is_err() {
        assert!(inspect_local_video(&path).is_err());
    }
}

#[cfg(unix)]
#[test]
fn video_canonicalizes_links_and_rejects_non_video_targets() {
    use std::os::unix::fs::symlink;
    let root = Sandbox::new("links");
    let target = root.0.join("source.mp4");
    fs::write(&target, b"fixture").unwrap();
    let link = root.0.join("linked.mp4");
    symlink(&target, &link).unwrap();
    assert_eq!(
        inspect_local_video(&link).unwrap().path,
        fs::canonicalize(target).unwrap().to_str().unwrap()
    );
    let private = root.0.join("private.txt");
    fs::write(&private, b"not a video").unwrap();
    let invalid = root.0.join("disguised.mp4");
    symlink(private, &invalid).unwrap();
    assert!(inspect_local_video(&invalid).is_err());
}
