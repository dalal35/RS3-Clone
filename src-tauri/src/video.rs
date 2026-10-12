use serde::Serialize;
use std::{fs, io::ErrorKind, path::Path, time::UNIX_EPOCH};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVideoInfo {
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
    pub status: String,
}

pub fn inspect_local_video(path: &Path) -> Result<LocalVideoInfo, String> {
    validate_extension(path)?;
    let original = path
        .to_str()
        .ok_or("Local video path is not valid Unicode")?;
    let canonical = match fs::canonicalize(path) {
        Ok(path) => path,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(LocalVideoInfo {
                path: original.into(),
                size: 0,
                modified_ms: 0,
                status: "missing".into(),
            });
        }
        Err(error) => return Err(format!("Cannot access local video: {error}")),
    };
    // Resolve links before granting access; an MP4 alias cannot expose another file type.
    validate_extension(&canonical)?;
    let metadata =
        fs::metadata(&canonical).map_err(|e| format!("Cannot inspect local video: {e}"))?;
    if !metadata.is_file() {
        return Err("Local video must be a regular MP4 or MOV file".into());
    }
    // Opening verifies readability without loading or hashing the video.
    let file = fs::File::open(&canonical).map_err(|e| format!("Local video is unreadable: {e}"))?;
    let metadata = file
        .metadata()
        .map_err(|e| format!("Cannot inspect local video: {e}"))?;
    let modified_ms = metadata
        .modified()
        .map_err(|e| format!("Cannot read local video modification time: {e}"))?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Invalid local video modification time: {e}"))?
        .as_millis()
        .try_into()
        .map_err(|_| "Local video modification time is too large")?;
    Ok(LocalVideoInfo {
        path: canonical
            .to_str()
            .ok_or("Local video path is not valid Unicode")?
            .into(),
        size: metadata.len(),
        modified_ms,
        status: "ready".into(),
    })
}

fn validate_extension(path: &Path) -> Result<(), String> {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension)
            if extension.eq_ignore_ascii_case("mp4") || extension.eq_ignore_ascii_case("mov") =>
        {
            Ok(())
        }
        _ => Err("Choose a local MP4 or MOV file; codec support is checked by the player".into()),
    }
}

#[tauri::command]
pub async fn authorize_local_video(
    path: String,
    app: tauri::AppHandle,
) -> Result<LocalVideoInfo, String> {
    // Video inspection has its own short blocking task; it never queues behind telemetry parsing.
    let info = tauri::async_runtime::spawn_blocking(move || inspect_local_video(Path::new(&path)))
        .await
        .map_err(|e| format!("Local video inspection failed: {e}"))??;
    if info.status == "ready" {
        app.asset_protocol_scope()
            .allow_file(Path::new(&info.path))
            .map_err(|e| format!("Cannot authorize local video playback: {e}"))?;
    }
    Ok(info)
}
