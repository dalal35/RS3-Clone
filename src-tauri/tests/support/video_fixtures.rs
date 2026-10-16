use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
pub fn fixture() -> PathBuf {
    fixture_mode("")
}
#[cfg(target_os = "macos")]
pub fn fixture_mode(mode: &str) -> PathBuf {
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

#[cfg(windows)]
#[path = "../fixtures/windows_generate.rs"]
mod windows_generate;
#[cfg(windows)]
pub fn fixture_mode(mode: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "apex-video-{}-{}.mp4",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    windows_generate::generate(&path, mode)
        .expect("Windows MF fixture generation must succeed; no skipped native tests");
    path
}
