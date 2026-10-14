use std::{env, path::PathBuf, process::Command};
fn main() {
    println!("cargo:rerun-if-changed=src/video_analysis/decoder.m");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
        let target = env::var("TARGET").expect("Cargo TARGET");
        let arch = if target.starts_with("aarch64") {
            "arm64"
        } else {
            "x86_64"
        };
        let status = Command::new("xcrun")
            .args([
                "clang",
                "-fobjc-arc",
                "-mmacosx-version-min=13.0",
                "-arch",
                arch,
                "-Wno-deprecated-declarations",
                "-c",
                "src/video_analysis/decoder.m",
                "-o",
            ])
            .arg(out.join("decoder.o"))
            .status()
            .expect("Xcode command line tools are required");
        assert!(status.success(), "AVFoundation decoder compilation failed");
        assert!(Command::new("xcrun")
            .args(["ar", "crs"])
            .arg(out.join("libapex_video.a"))
            .arg(out.join("decoder.o"))
            .status()
            .expect("Apple archiver")
            .success());
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=apex_video");
        for framework in [
            "Foundation",
            "AVFoundation",
            "CoreMedia",
            "CoreVideo",
            "CoreImage",
            "CoreGraphics",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::build()
}
