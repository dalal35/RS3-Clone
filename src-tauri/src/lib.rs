pub mod library;
pub mod telemetry;
pub mod video;
pub mod video_analysis;

use library::{Library, LibrarySnapshot};
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
use telemetry::{Analysis, Session};
type Store = Arc<Mutex<Result<Library, String>>>;

// Parsing, hashing, analysis and disk writes never run on the WebView/UI thread.
// One serialized owner keeps manifest generations and workspace mutations ordered.
async fn task<T: Send + 'static>(
    store: &Store,
    operation: impl FnOnce(&mut Library) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let store = store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = store
            .lock()
            .map_err(|_| "Local library storage unavailable")?;
        let library = guard.as_mut().map_err(|e| e.clone())?;
        operation(library)
    })
    .await
    .map_err(|e| format!("Local library operation failed: {e}"))?
}
#[tauri::command]
async fn library_snapshot(state: State<'_, Store>) -> Result<LibrarySnapshot, String> {
    task(state.inner(), |library| library.snapshot()).await
}
#[tauri::command]
async fn import_session(path: String, state: State<'_, Store>) -> Result<Session, String> {
    task(state.inner(), move |library| {
        library.import(&PathBuf::from(path))
    })
    .await
}
#[tauri::command]
async fn load_library_session(
    session_id: String,
    state: State<'_, Store>,
) -> Result<Session, String> {
    task(state.inner(), move |library| library.load(&session_id)).await
}
#[tauri::command]
async fn remove_library_session(
    session_id: String,
    state: State<'_, Store>,
) -> Result<LibrarySnapshot, String> {
    task(state.inner(), move |library| library.remove(&session_id)).await
}
#[tauri::command]
async fn refresh_library_session(
    session_id: String,
    state: State<'_, Store>,
) -> Result<Session, String> {
    task(state.inner(), move |library| library.refresh(&session_id)).await
}
#[tauri::command]
async fn locate_library_session(
    session_id: String,
    path: String,
    state: State<'_, Store>,
) -> Result<Session, String> {
    task(state.inner(), move |library| {
        library.locate(&session_id, &PathBuf::from(path))
    })
    .await
}
#[tauri::command]
async fn save_workspace(
    session_id: String,
    workspace: Value,
    expected_content_version: String,
    state: State<'_, Store>,
) -> Result<(), String> {
    task(state.inner(), move |library| {
        library.save_workspace_version(&session_id, workspace, &expected_content_version)
    })
    .await
}
#[tauri::command]
async fn set_corner_boundaries(
    session_id: String,
    primary_id: String,
    boundaries: Option<Vec<f64>>,
    state: State<'_, Store>,
) -> Result<(), String> {
    task(state.inner(), move |library| {
        library.set_corner_boundaries(&session_id, &primary_id, boundaries)
    })
    .await
}
#[tauri::command]
async fn analyze_session(
    session_id: String,
    primary_id: String,
    comparison_id: Option<String>,
    axis: String,
    channel_ids: Vec<String>,
    formulas: Option<Vec<telemetry::expressions::Formula>>,
    state: State<'_, Store>,
) -> Result<Analysis, String> {
    task(state.inner(), move |library| {
        library.analyze_formulas(
            &session_id,
            &primary_id,
            comparison_id.as_deref(),
            &axis,
            &channel_ids,
            &formulas.unwrap_or_default(),
        )
    })
    .await
}
#[tauri::command]
async fn analyze_advanced(
    session_id: String,
    primary_id: String,
    comparison_id: Option<String>,
    axis: String,
    request: telemetry::advanced::AdvancedRequest,
    formulas: Vec<telemetry::expressions::Formula>,
    state: State<'_, Store>,
) -> Result<Value, String> {
    task(state.inner(), move |library| {
        library.analyze_advanced(
            &session_id,
            &primary_id,
            comparison_id.as_deref(),
            &axis,
            request,
            &formulas,
        )
    })
    .await
}
#[tauri::command]
async fn validate_formulas(
    session_id: String,
    formulas: Vec<telemetry::expressions::Formula>,
    state: State<'_, Store>,
) -> Result<Vec<Value>, String> {
    task(state.inner(), move |library| {
        library.validate_formulas(&session_id, &formulas)
    })
    .await
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let library = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Cannot locate local library folder: {e}"))
                .and_then(Library::open);
            // A damaged/unsupported library stays read-only and is reported to the UI.
            app.manage(Arc::new(Mutex::new(library)) as Store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            video::authorize_local_video,
            import_session,
            analyze_session,
            analyze_advanced,
            validate_formulas,
            library_snapshot,
            load_library_session,
            remove_library_session,
            refresh_library_session,
            locate_library_session,
            save_workspace,
            set_corner_boundaries
        ])
        .run(tauri::generate_context!())
        .expect("Could not launch Apex Telemetry");
}
