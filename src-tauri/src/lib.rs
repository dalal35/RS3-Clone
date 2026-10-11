pub mod telemetry;

use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex}};
use tauri::State;
use telemetry::{Analysis, Session};
type Sessions = Arc<Mutex<HashMap<String, Session>>>;

#[tauri::command]
async fn import_session(path: String, state: State<'_, Sessions>) -> Result<Session, String> {
    let sessions = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("xrk")) {
            return Err("Choose an AiM .xrk telemetry file.".into());
        }
        let metadata = std::fs::metadata(&path).map_err(|e| format!("Cannot open telemetry: {e}"))?;
        if !metadata.is_file() || metadata.len() > 512 * 1024 * 1024 {
            return Err("Choose a regular XRK file smaller than 512 MiB.".into());
        }
        let session = telemetry::parse_session(&path)?;
        sessions.lock().map_err(|_| "Session storage unavailable")?.insert(session.id.clone(), session.clone());
        Ok(session)
    }).await.map_err(|e| format!("Import failed: {e}"))?
}

#[tauri::command]
async fn analyze_session(session_id: String, primary_id: String, comparison_id: Option<String>, axis: String, channel_ids: Vec<String>, state: State<'_, Sessions>) -> Result<Analysis, String> {
    let sessions = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let storage = sessions.lock().map_err(|_| "Session storage unavailable")?;
        let session = storage.get(&session_id).ok_or("Import this session again; it is no longer available.")?;
        telemetry::analyze(session, &primary_id, comparison_id.as_deref(), &axis, &channel_ids)
    }).await.map_err(|e| format!("Analysis failed: {e}"))?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Sessions::default())
        .invoke_handler(tauri::generate_handler![import_session, analyze_session])
        .run(tauri::generate_context!())
        .expect("Could not launch Apex Telemetry");
}
