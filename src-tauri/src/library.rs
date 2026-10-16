//! Local references and preferences only: raw telemetry stays in its original XRK.
use crate::merging::{self, MergeInfo, MergePreview, MergeSource, SourceRef};
use crate::persistence::atomic_write;
use crate::telemetry::{self, Analysis, Session};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub merge_sources: Option<Vec<SourceRef>>,
    pub id: String,
    pub source: String,
    pub name: String,
    pub driver: String,
    pub track: String,
    pub recorded_at: String,
    pub lap_count: usize,
    pub channel_count: usize,
    pub content_version: String,
    pub last_used: u64,
    pub workspace: Option<Value>,
    #[serde(default)]
    corners: HashMap<String, CornerOverride>,
    #[serde(skip_deserializing)]
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct CornerOverride {
    #[serde(default)]
    automatic: bool,
    version: u32,
    boundaries: Vec<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergeDefinition {
    #[serde(flatten)]
    entry: LibraryEntry,
    sources: Vec<SourceRef>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    #[serde(default)]
    merges: Vec<MergeDefinition>,
    version: u32,
    entries: Vec<LibraryEntry>,
    active_session_id: Option<String>,
}
impl Default for Manifest {
    fn default() -> Self {
        Self {
            version: 1,
            merges: vec![],
            entries: vec![],
            active_session_id: None,
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub entries: Vec<LibraryEntry>,
    pub active_session_id: Option<String>,
    pub warnings: Vec<String>,
}
pub struct Library {
    directory: PathBuf,
    manifest: Manifest,
    cache: HashMap<String, Arc<Session>>,
    advanced_cache: HashMap<String, Value>,
    warnings: Vec<String>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn read_manifest(path: &Path) -> Result<Manifest, String> {
    let bytes = fs::read(path).map_err(|e| format!("Cannot read local library: {e}"))?;
    // Check version before full decoding: a future schema must never be replaced by an older backup.
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("Local library is damaged: {e}"))?;
    if !matches!(value.get("version").and_then(Value::as_u64), Some(1 | 2)) {
        return Err("Unsupported local library version; update Ten Tenths Telemetry. Your library has not been changed.".into());
    }
    let manifest: Manifest =
        serde_json::from_value(value).map_err(|e| format!("Local library is damaged: {e}"))?;
    let mut ids = std::collections::HashSet::new();
    if manifest
        .entries
        .iter()
        .any(|e| !ids.insert(&e.id) || e.content_version.len() != 64)
    {
        return Err("Local library contains invalid session identities.".into());
    }
    for merge in &manifest.merges {
        if manifest.version < 2
            || !ids.insert(&merge.entry.id)
            || merge.sources.len() < 2
            || merge.entry.content_version.len() != 64
        {
            return Err("Local library contains invalid merged identities.".into());
        }
        let mut members = std::collections::HashSet::new();
        for source in &merge.sources {
            let original = manifest.entries.iter().find(|e| e.id == source.session_id);
            if !members.insert(&source.session_id)
                || original.is_none()
                || source.content_version.len() != 64
                || !source
                    .content_version
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit())
                || original.unwrap().content_version != source.content_version
            {
                return Err("Local library contains invalid merged source references.".into());
            }
        }
    }
    Ok(manifest)
}
fn fingerprint(path: &Path) -> Result<String, String> {
    if !path
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("xrk"))
    {
        return Err("Choose an AiM .xrk telemetry file.".into());
    }
    let mut file = File::open(path).map_err(|e| format!("Cannot open telemetry: {e}"))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 512 * 1024 * 1024 {
        return Err("Choose a regular XRK file smaller than 512 MiB.".into());
    }
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn parse(path: &Path, digest: &str, id: &str) -> Result<Session, String> {
    let mut session = telemetry::parse_session(path)?;
    if fingerprint(path)? != digest {
        return Err(
            "Telemetry changed during loading. Try again after recording has finished.".into(),
        );
    }
    session.id = id.into();
    Ok(session)
}
impl Library {
    pub fn open(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory)
            .map_err(|e| format!("Cannot open local library folder: {e}"))?;
        let primary = directory.join("library.json");
        let backup = directory.join("library.backup.json");
        let mut warnings = vec![];
        let manifest = if primary.exists() {
            match read_manifest(&primary) {
                Ok(m) => m,
                Err(error) if error.starts_with("Unsupported") => return Err(error),
                Err(error) => {
                    let recovered=read_manifest(&backup).map_err(|_|format!("{error} No valid backup is available. Keep these files for recovery: {}",directory.display()))?;
                    warnings.push("Recovered the local library from its backup after a damaged save. The last saved change may need repeating.".into());
                    recovered
                }
            }
        } else if backup.exists() {
            warnings.push("Recovered the local library from its backup.".into());
            read_manifest(&backup)?
        } else {
            Manifest::default()
        };
        Ok(Self {
            directory,
            manifest,
            cache: HashMap::new(),
            advanced_cache: HashMap::new(),
            warnings,
        })
    }
    fn commit(&mut self, next: Manifest) -> Result<(), String> {
        let primary = self.directory.join("library.json");
        // Only rotate a valid previous generation; recovery never destroys its valid backup.
        match read_manifest(&primary) {
            Ok(previous) => atomic_write(
                &self.directory.join("library.backup.json"),
                &serde_json::to_vec(&previous).map_err(|e| e.to_string())?,
            )?,
            Err(error) if error.starts_with("Unsupported") => return Err(error),
            Err(_) => {}
        }
        let bytes = serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?;
        // Windows has no fallible write after the committed primary: memory and disk
        // must advance together. A backup-only interrupted first save is recoverable.
        #[cfg(windows)]
        if !self.directory.join("library.backup.json").exists() {
            atomic_write(&self.directory.join("library.backup.json"), &bytes)?;
        }
        atomic_write(&primary, &bytes)?;
        #[cfg(not(windows))]
        if !self.directory.join("library.backup.json").exists() {
            atomic_write(&self.directory.join("library.backup.json"), &bytes)?;
        }
        self.manifest = next;
        Ok(())
    }
    fn entry(&self, id: &str) -> Result<&LibraryEntry, String> {
        self.manifest
            .entries
            .iter()
            .find(|e| e.id == id)
            .or_else(|| {
                self.manifest
                    .merges
                    .iter()
                    .find(|m| m.entry.id == id)
                    .map(|m| &m.entry)
            })
            .ok_or_else(|| "Session is no longer in the library.".into())
    }
    fn status(entry: &LibraryEntry) -> String {
        let path = Path::new(&entry.source);
        if !path.exists() {
            "missing"
        } else if fingerprint(path).is_ok_and(|hash| hash == entry.content_version) {
            "ready"
        } else {
            "modified"
        }
        .into()
    }
    pub fn snapshot(&mut self) -> Result<LibrarySnapshot, String> {
        let mut entries = self.manifest.entries.clone();
        for entry in &mut entries {
            entry.status = Self::status(entry);
            if entry.status != "ready" {
                self.cache.remove(&entry.id);
            }
        }
        for merge in &self.manifest.merges {
            let mut entry = merge.entry.clone();
            entry.merge_sources = Some(merge.sources.clone());
            entry.status = merge
                .sources
                .iter()
                .map(|r| Self::status(self.entry(&r.session_id).expect("validated reference")))
                .find(|s| s != "ready")
                .unwrap_or("ready".into());
            entries.push(entry);
        }
        entries.sort_by(|a, b| b.last_used.cmp(&a.last_used));
        Ok(LibrarySnapshot {
            entries,
            active_session_id: self.manifest.active_session_id.clone(),
            warnings: self.warnings.clone(),
        })
    }
    fn touch(&mut self, id: &str) -> Result<(), String> {
        let mut next = self.manifest.clone();
        let entry = Self::entry_mut(&mut next, id)?;
        entry.last_used = now();
        next.active_session_id = Some(id.into());
        self.commit(next)
    }
    pub fn import(&mut self, path: &Path) -> Result<Session, String> {
        let path = path
            .canonicalize()
            .map_err(|e| format!("Cannot open telemetry: {e}"))?;
        let digest = fingerprint(&path)?;
        if let Some(existing) = self
            .manifest
            .entries
            .iter()
            .find(|e| e.content_version == digest)
            .cloned()
        {
            // A duplicate at another location may recover a missing/moved original, but never switches a healthy reference.
            if Self::status(&existing) != "ready" {
                return self.locate(&existing.id, &path);
            }
            return self.load(&existing.id);
        }
        if self
            .manifest
            .entries
            .iter()
            .any(|e| Path::new(&e.source) == path)
        {
            return Err("This XRK has changed. Use Refresh on its existing library entry.".into());
        }
        let id = format!("session-{digest}");
        let session = parse(&path, &digest, &id)?;
        let entry = LibraryEntry {
            merge_sources: None,
            id: id.clone(),
            source: path.to_string_lossy().into(),
            name: session.name.clone(),
            driver: session.driver.clone(),
            track: session.track.clone(),
            recorded_at: session.recorded_at.clone(),
            lap_count: session.laps.len(),
            channel_count: session.channels.len(),
            content_version: digest,
            last_used: now(),
            workspace: None,
            corners: HashMap::new(),
            status: "ready".into(),
        };
        let mut next = self.manifest.clone();
        next.entries.push(entry);
        next.active_session_id = Some(id.clone());
        self.commit(next)?;
        self.cache.insert(id, Arc::new(session.clone()));
        Ok(session)
    }
    fn current(&mut self, id: &str) -> Result<Session, String> {
        if let Some(merge) = self
            .manifest
            .merges
            .iter()
            .find(|m| m.entry.id == id)
            .cloned()
        {
            return self.merged_session(&merge);
        }
        Ok((*self.current_shared(id)?).clone())
    }
    fn current_shared(&mut self, id: &str) -> Result<Arc<Session>, String> {
        let entry = self.entry(id)?.clone();
        match Self::status(&entry).as_str() {
            "missing" => {
                self.cache.remove(id);
                return Err("Original XRK is missing. Use Locate to reconnect it.".into());
            }
            "modified" => {
                self.cache.remove(id);
                return Err(
                    "Original XRK has changed. Use Refresh explicitly before analysis.".into(),
                );
            }
            _ => {}
        }
        if let Some(session) = self.cache.get(id) {
            return Ok(session.clone());
        }
        let session = parse(Path::new(&entry.source), &entry.content_version, id)?;
        let session = Arc::new(session);
        self.cache.insert(id.into(), session.clone());
        Ok(session)
    }
    pub fn load(&mut self, id: &str) -> Result<Session, String> {
        let session = self.current(id)?;
        self.touch(id)?;
        Ok(session)
    }
    pub fn remove(&mut self, id: &str) -> Result<LibrarySnapshot, String> {
        if self.manifest.merges.iter().any(|m| m.entry.id == id) {
            return self.unmerge(id);
        }
        self.require_unreferenced(id)?;
        self.advanced_cache.clear();
        self.entry(id)?;
        let mut next = self.manifest.clone();
        next.entries.retain(|e| e.id != id);
        if next.active_session_id.as_deref() == Some(id) {
            next.active_session_id = None;
        }
        self.commit(next)?;
        self.cache.remove(id);
        self.snapshot()
    }
    pub fn locate(&mut self, id: &str, path: &Path) -> Result<Session, String> {
        let entry = self.entry(id)?.clone();
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let digest = fingerprint(&path)?;
        if digest != entry.content_version {
            return Err("The selected file does not match this session. Choose its original XRK or use Refresh on the current source.".into());
        }
        let session = parse(&path, &digest, id)?;
        let mut next = self.manifest.clone();
        let entry = next.entries.iter_mut().find(|e| e.id == id).unwrap();
        entry.source = path.to_string_lossy().into();
        entry.last_used = now();
        next.active_session_id = Some(id.into());
        self.commit(next)?;
        self.cache.insert(id.into(), Arc::new(session.clone()));
        Ok(session)
    }
    pub fn refresh(&mut self, id: &str) -> Result<Session, String> {
        self.advanced_cache.clear();
        let entry = self.entry(id)?.clone();
        let path = Path::new(&entry.source);
        let digest = fingerprint(path)?;
        if digest != entry.content_version {
            self.require_unreferenced(id)?;
        }
        if self
            .manifest
            .entries
            .iter()
            .any(|e| e.id != id && e.content_version == digest)
        {
            return Err("This file matches another session already in the library. Open that session instead.".into());
        }
        let session = parse(path, &digest, id)?;
        let mut next = self.manifest.clone();
        let entry = next.entries.iter_mut().find(|e| e.id == id).unwrap();
        if entry.content_version != digest {
            entry.workspace = None;
            entry.corners.clear();
        }
        entry.content_version = digest;
        entry.name = session.name.clone();
        entry.driver = session.driver.clone();
        entry.track = session.track.clone();
        entry.recorded_at = session.recorded_at.clone();
        entry.lap_count = session.laps.len();
        entry.channel_count = session.channels.len();
        entry.last_used = now();
        next.active_session_id = Some(id.into());
        self.commit(next)?;
        self.cache.insert(id.into(), Arc::new(session.clone()));
        Ok(session)
    }
    pub fn save_workspace_version(
        &mut self,
        id: &str,
        workspace: Value,
        expected_version: &str,
    ) -> Result<(), String> {
        if self.entry(id)?.content_version != expected_version {
            return Err("This session was refreshed; its older workspace was not saved.".into());
        }
        self.save_workspace(id, workspace)
    }
    pub fn save_workspace(&mut self, id: &str, workspace: Value) -> Result<(), String> {
        if !workspace.is_object()
            || serde_json::to_vec(&workspace)
                .map_err(|e| e.to_string())?
                .len()
                > 65536
        {
            return Err("Workspace must be an object smaller than 64 KiB.".into());
        }
        self.entry(id)?;
        let mut next = self.manifest.clone();
        Self::entry_mut(&mut next, id)?.workspace = Some(workspace);
        next.active_session_id = Some(id.into());
        self.commit(next)
    }
    pub fn set_corner_boundaries(
        &mut self,
        id: &str,
        primary: &str,
        boundaries: Option<Vec<f64>>,
    ) -> Result<(), String> {
        if let Some(definition) = self
            .manifest
            .merges
            .iter()
            .find(|m| m.entry.id == id)
            .cloned()
        {
            let (source, lap) = merging::split_id(primary)?;
            if !definition.sources.iter().any(|r| r.session_id == source) {
                return Err("Lap source does not belong to this merge.".into());
            }
            self.merge_sources(&definition.sources)?;
            let session = self.current_shared(&source)?;
            telemetry::analyze_with_boundaries(
                &session,
                &lap,
                None,
                "distance",
                &[],
                boundaries.as_deref(),
            )?;
            let mut next = self.manifest.clone();
            Self::entry_mut(&mut next, id)?.corners.insert(
                primary.into(),
                CornerOverride {
                    version: 1,
                    automatic: boundaries.is_none(),
                    boundaries: boundaries.unwrap_or_default(),
                },
            );
            return self.commit(next);
        }
        let session = self.current(id)?;
        if let Some(values) = &boundaries {
            telemetry::analyze_with_boundaries(
                &session,
                primary,
                None,
                "distance",
                &[],
                Some(values),
            )?;
        }
        let mut next = self.manifest.clone();
        let entry = next.entries.iter_mut().find(|e| e.id == id).unwrap();
        if let Some(boundaries) = boundaries {
            entry.corners.insert(
                primary.into(),
                CornerOverride {
                    automatic: false,
                    version: 1,
                    boundaries,
                },
            );
        } else {
            entry.corners.remove(primary);
        }
        self.commit(next)
    }
    pub fn analyze(
        &mut self,
        id: &str,
        primary: &str,
        comparison: Option<&str>,
        axis: &str,
        channels: &[String],
    ) -> Result<Analysis, String> {
        if self.manifest.merges.iter().any(|m| m.entry.id == id) {
            return self
                .merged_analysis(id, primary, comparison, axis, channels, &[], None)
                .map(|(a, _)| a);
        }
        let session = self.current(id)?;
        let boundaries = self
            .entry(id)?
            .corners
            .get(primary)
            .filter(|c| c.version == 1)
            .map(|c| c.boundaries.as_slice());
        telemetry::analyze_with_boundaries(
            &session, primary, comparison, axis, channels, boundaries,
        )
    }
    pub fn validate_formulas(
        &mut self,
        id: &str,
        formulas: &[telemetry::expressions::Formula],
    ) -> Result<Vec<Value>, String> {
        if let Some(definition) = self
            .manifest
            .merges
            .iter()
            .find(|m| m.entry.id == id)
            .cloned()
        {
            let sources = self.merge_sources(&definition.sources)?;
            let preview = merging::preview_sources(
                &sources.iter().map(|s| s.as_ref()).collect::<Vec<_>>(),
                &definition.sources,
            )?;
            let mut result = vec![];
            for source in &sources {
                let mut metadata = merging::descriptor(source);
                let translated = Self::source_formulas(&mut metadata, &preview, formulas);
                for c in telemetry::expressions::evaluate(&metadata, &translated)? {
                    if !result.iter().any(|v: &Value| v["id"] == c.id) {
                        result.push(serde_json::json!({"id":c.id,"name":c.name,"unit":c.unit}));
                    }
                }
            }
            return Ok(result);
        }
        let session = self.current(id)?;
        Ok(telemetry::expressions::evaluate(&session, formulas)?
            .into_iter()
            .map(|c| serde_json::json!({"id":c.id,"name":c.name,"unit":c.unit}))
            .collect())
    }
    pub fn analyze_formulas(
        &mut self,
        id: &str,
        primary: &str,
        comparison: Option<&str>,
        axis: &str,
        channels: &[String],
        formulas: &[telemetry::expressions::Formula],
    ) -> Result<Analysis, String> {
        if self.manifest.merges.iter().any(|m| m.entry.id == id) {
            return self
                .merged_analysis(id, primary, comparison, axis, channels, formulas, None)
                .map(|(a, _)| a);
        }
        let mut session = self.current(id)?;
        session
            .channels
            .extend(telemetry::expressions::evaluate(&session, formulas)?);
        let boundaries = self
            .entry(id)?
            .corners
            .get(primary)
            .filter(|c| c.version == 1)
            .map(|c| c.boundaries.as_slice());
        telemetry::analyze_with_boundaries(
            &session, primary, comparison, axis, channels, boundaries,
        )
    }
    pub fn analyze_advanced(
        &mut self,
        id: &str,
        primary: &str,
        comparison: Option<&str>,
        axis: &str,
        mut request: telemetry::advanced::AdvancedRequest,
        formulas: &[telemetry::expressions::Formula],
    ) -> Result<Value, String> {
        if self.manifest.merges.iter().any(|m| m.entry.id == id) {
            request.axis = axis.into();
            return self
                .merged_analysis(id, primary, comparison, axis, &[], formulas, Some(&request))
                .and_then(|(_, value)| {
                    value.ok_or_else(|| "Advanced analysis unavailable.".into())
                });
        }
        // Validate original bytes even on a cache hit; a changed file cannot supply stale analysis.
        let mut session = self.current(id)?;
        request.axis = axis.into();
        let boundaries = self
            .entry(id)?
            .corners
            .get(primary)
            .filter(|c| c.version == 1)
            .map(|c| c.boundaries.clone());
        let key = serde_json::to_string(&(
            id,
            &self.entry(id)?.content_version,
            primary,
            comparison,
            axis,
            &request,
            formulas,
            &boundaries,
        ))
        .map_err(|e| e.to_string())?;
        if let Some(cached) = self.advanced_cache.get(&key) {
            return Ok(cached.clone());
        }
        session
            .channels
            .extend(telemetry::expressions::evaluate(&session, formulas)?);
        let analysis = telemetry::analyze_with_boundaries(
            &session,
            primary,
            comparison,
            axis,
            &[],
            boundaries.as_deref(),
        )?;
        let mut value =
            serde_json::to_value(telemetry::advanced::analyze(&session, &analysis, &request)?)
                .map_err(|e| e.to_string())?;
        value["sourceContentVersion"] = Value::String(self.entry(id)?.content_version.clone());
        value["parameterKey"] = Value::String(format!("{:x}", Sha256::digest(key.as_bytes())));
        if self.advanced_cache.len() >= 8 {
            self.advanced_cache.clear();
        }
        self.advanced_cache.insert(key, value.clone());
        Ok(value)
    }
}

impl Library {
    fn entry_mut<'a>(manifest: &'a mut Manifest, id: &str) -> Result<&'a mut LibraryEntry, String> {
        if let Some(entry) = manifest.entries.iter_mut().find(|e| e.id == id) {
            return Ok(entry);
        }
        manifest
            .merges
            .iter_mut()
            .find(|m| m.entry.id == id)
            .map(|m| &mut m.entry)
            .ok_or_else(|| "Session is no longer in the library.".into())
    }
    fn require_unreferenced(&self, id: &str) -> Result<(), String> {
        if self
            .manifest
            .merges
            .iter()
            .any(|m| m.sources.iter().any(|r| r.session_id == id))
        {
            Err(
                "Unmerge referencing sessions before removing or changing this source recording."
                    .into(),
            )
        } else {
            Ok(())
        }
    }
    fn merge_sources(&mut self, refs: &[SourceRef]) -> Result<Vec<Arc<Session>>, String> {
        refs.iter()
            .map(|r| {
                if self.entry(&r.session_id)?.content_version != r.content_version {
                    return Err(
                        "Merged source content changed. Unmerge before refreshing its recording."
                            .into(),
                    );
                }
                self.current_shared(&r.session_id).map_err(|e| {
                    format!(
                        "Merged source {}: {e}",
                        self.entry(&r.session_id)
                            .map(|s| s.name.as_str())
                            .unwrap_or(&r.session_id)
                    )
                })
            })
            .collect()
    }
    pub fn preview_merge(&mut self, ids: &[String]) -> Result<MergePreview, String> {
        let mut refs = vec![];
        for id in ids {
            if self.manifest.merges.iter().any(|m| m.entry.id == *id) {
                return Err("Select original sessions; nested merges are not supported.".into());
            }
            let e = self.entry(id)?;
            if !refs.iter().any(|r: &SourceRef| r.session_id == *id) {
                refs.push(SourceRef {
                    session_id: id.clone(),
                    content_version: e.content_version.clone(),
                });
            }
        }
        let sources = self.merge_sources(&refs)?;
        merging::preview_sources(
            &sources.iter().map(|s| s.as_ref()).collect::<Vec<_>>(),
            &refs,
        )
    }
    fn merged_session(&mut self, definition: &MergeDefinition) -> Result<Session, String> {
        let sources = self.merge_sources(&definition.sources)?;
        let preview = merging::preview_sources(
            &sources.iter().map(|s| s.as_ref()).collect::<Vec<_>>(),
            &definition.sources,
        )?;
        let metadata = sources
            .iter()
            .zip(&definition.sources)
            .map(|(s, r)| MergeSource {
                reference: r.clone(),
                session: merging::descriptor(s),
            })
            .collect();
        let mut warnings = preview.warnings.clone();
        warnings.push("Merged workspace settings are independent. Original workspaces and videos are preserved; incompatible zoom and focused ranges are reset.".into());
        Ok(Session {
            id: definition.entry.id.clone(),
            source: "Virtual merge · original XRKs preserved".into(),
            name: definition.entry.name.clone(),
            driver: definition.entry.driver.clone(),
            track: definition.entry.track.clone(),
            recorded_at: preview.day.clone(),
            channels: preview.channels.iter().map(|c| c.channel.clone()).collect(),
            laps: preview.laps.iter().map(|l| l.lap.clone()).collect(),
            warnings,
            merge: Some(MergeInfo {
                preview,
                sources: metadata,
            }),
        })
    }
    pub fn merge(
        &mut self,
        ids: &[String],
        preview_version: &str,
        acknowledge_warnings: bool,
    ) -> Result<Session, String> {
        let preview = self.preview_merge(ids)?;
        if preview.preview_version != preview_version {
            return Err("Merge preview is stale. Review the recordings again.".into());
        }
        if !preview.warnings.is_empty() && !acknowledge_warnings {
            return Err("Review and acknowledge merge warnings before merging.".into());
        }
        let id = format!("merge-{}-{}", now(), &preview.preview_version[..16]);
        let initial = self
            .manifest
            .active_session_id
            .as_deref()
            .filter(|active| ids.iter().any(|id| id == active))
            .unwrap_or(&ids[0]);
        let original = self.entry(initial)?.clone();
        let mut workspace = original
            .workspace
            .clone()
            .filter(|v| v.is_object())
            .unwrap_or_else(|| serde_json::json!({}));
        fn remap(
            value: &mut Value,
            source: &str,
            laps: &[merging::MergedLap],
            channels: &[merging::MergedChannel],
        ) {
            match value {
                Value::String(text) => {
                    if laps
                        .iter()
                        .any(|l| l.source_session_id == source && l.source_lap_id == *text)
                        || channels
                            .iter()
                            .any(|c| c.source_session_id == source && c.source_channel_id == *text)
                    {
                        *text = channels
                            .iter()
                            .find(|c| c.source_session_id == source && c.source_channel_id == *text)
                            .map(|c| c.channel.id.clone())
                            .unwrap_or_else(|| merging::qualified_lap_id(source, text));
                    } else {
                        for channel in channels.iter().filter(|c| c.source_session_id == source) {
                            *text = text.replace(
                                &format!("[{}]", channel.source_channel_id),
                                &format!("[{}]", channel.channel.id),
                            );
                        }
                    }
                }
                Value::Array(items) => {
                    for item in items {
                        remap(item, source, laps, channels);
                    }
                }
                Value::Object(items) => {
                    for (key, item) in items {
                        if key != "raw" {
                            remap(item, source, laps, channels);
                        }
                    }
                }
                _ => {}
            }
        }
        if let Some(object) = workspace.as_object_mut() {
            object.remove("video");
            object.remove("sourceVideos");
        }
        remap(&mut workspace, initial, &preview.laps, &preview.channels);
        workspace["contentVersion"] = Value::String(preview.preview_version.clone());
        workspace["zoom"] = Value::Null;
        if let Some(config) = workspace
            .pointer_mut("/advanced/config")
            .and_then(Value::as_object_mut)
        {
            config.insert("range".into(), Value::Null);
            config.insert("cornerId".into(), Value::Null);
            config.insert("excludedIds".into(), serde_json::json!([]));
        }
        let mut videos = serde_json::Map::new();
        for r in &preview.sources {
            if let Some(video) = self
                .entry(&r.session_id)?
                .workspace
                .as_ref()
                .and_then(|w| w.get("video"))
            {
                videos.insert(r.session_id.clone(), video.clone());
            }
        }
        workspace["sourceVideos"] = Value::Object(videos);
        if serde_json::to_vec(&workspace)
            .map_err(|e| e.to_string())?
            .len()
            > 65536
        {
            return Err("Combined workspace exceeds 64 KiB. Reduce saved video mappings or advanced preferences before merging; originals are unchanged.".into());
        }
        let definition = MergeDefinition {
            entry: LibraryEntry {
                id: id.clone(),
                source: String::new(),
                name: format!("Merged · {} recordings", preview.sources.len()),
                driver: original.driver,
                track: original.track,
                recorded_at: preview.day.clone(),
                lap_count: preview.laps.len(),
                channel_count: preview.channels.len(),
                content_version: preview.preview_version.clone(),
                last_used: now(),
                workspace: Some(workspace),
                corners: HashMap::new(),
                status: "ready".into(),
                merge_sources: Some(preview.sources.clone()),
            },
            sources: preview.sources,
        };
        let session = self.merged_session(&definition)?;
        let mut next = self.manifest.clone();
        next.version = 2;
        next.active_session_id = Some(id);
        next.merges.push(definition);
        self.commit(next)?;
        Ok(session)
    }
    pub fn unmerge(&mut self, id: &str) -> Result<LibrarySnapshot, String> {
        let definition = self
            .manifest
            .merges
            .iter()
            .find(|m| m.entry.id == id)
            .cloned()
            .ok_or("Merged session no longer exists.")?;
        let mut next = self.manifest.clone();
        next.merges.retain(|m| m.entry.id != id);
        if next.active_session_id.as_deref() == Some(id) {
            next.active_session_id = definition
                .sources
                .iter()
                .find(|r| {
                    self.entry(&r.session_id)
                        .is_ok_and(|e| Self::status(e) == "ready")
                })
                .map(|r| r.session_id.clone());
        }
        self.commit(next)?;
        self.advanced_cache.clear();
        self.snapshot()
    }
}

impl Library {
    fn channel_for_source(preview: &MergePreview, source: &Session, id: &str) -> Option<String> {
        if let Some(origin) = preview.channels.iter().find(|c| c.channel.id == id) {
            if origin.source_session_id == source.id {
                return Some(origin.source_channel_id.clone());
            }
            if preview
                .channels
                .iter()
                .filter(|c| {
                    c.source_session_id == origin.source_session_id
                        && c.channel.name == origin.channel.name
                        && c.channel.unit == origin.channel.unit
                })
                .count()
                != 1
            {
                return None;
            }
            let matches: Vec<_> = source
                .channels
                .iter()
                .filter(|c| c.name == origin.channel.name && c.unit == origin.channel.unit)
                .collect();
            if matches.len() == 1 {
                Some(matches[0].id.clone())
            } else {
                None
            }
        } else {
            source
                .channels
                .iter()
                .find(|c| c.id == id)
                .map(|c| c.id.clone())
        }
    }
    fn source_formulas(
        session: &mut Session,
        preview: &MergePreview,
        formulas: &[telemetry::expressions::Formula],
    ) -> Vec<telemetry::expressions::Formula> {
        formulas.iter().map(|f|{
            let mut formula=f.clone();
            for descriptor in &preview.channels {
                let token=format!("[{}]",descriptor.channel.id);
                if !formula.expression.contains(&token){continue;}
                let local=Self::channel_for_source(preview,session,&descriptor.channel.id).unwrap_or_else(||{
                    // An empty dependency retains its known unit but cannot supply a sample.
                    // This exists only inside formula evaluation, never as measured telemetry.
                    let id=format!("unavailable-{}",descriptor.channel.id);
                    if !session.channels.iter().any(|c|c.id==id){session.channels.push(telemetry::Channel{id:id.clone(),name:descriptor.channel.name.clone(),unit:descriptor.channel.unit.clone(),times:vec![],values:vec![],gaps:vec![]});}
                    session.warnings.push(format!("{}: formula dependency {} is unavailable or ambiguous in this source.",session.name,descriptor.channel.name));id
                });
                formula.expression=formula.expression.replace(&token,&format!("[{local}]"));
            }formula
        }).collect()
    }
    fn merged_boundaries(
        &self,
        definition: &MergeDefinition,
        primary: &str,
        source: &str,
        lap: &str,
    ) -> Option<Vec<f64>> {
        match definition.entry.corners.get(primary) {
            Some(c) if c.version == 1 => {
                if c.automatic {
                    None
                } else {
                    Some(c.boundaries.clone())
                }
            }
            Some(_) => None,
            None => self
                .entry(source)
                .ok()
                .and_then(|e| e.corners.get(lap))
                .filter(|c| c.version == 1 && !c.automatic)
                .map(|c| c.boundaries.clone()),
        }
    }
    fn merged_analysis(
        &mut self,
        id: &str,
        primary: &str,
        comparison: Option<&str>,
        axis: &str,
        channels: &[String],
        formulas: &[telemetry::expressions::Formula],
        advanced: Option<&telemetry::advanced::AdvancedRequest>,
    ) -> Result<(Analysis, Option<Value>), String> {
        let definition = self
            .manifest
            .merges
            .iter()
            .find(|m| m.entry.id == id)
            .cloned()
            .ok_or("Merged session no longer exists.")?;
        let sources = self.merge_sources(&definition.sources)?;
        let preview = merging::preview_sources(
            &sources.iter().map(|s| s.as_ref()).collect::<Vec<_>>(),
            &definition.sources,
        )?;
        let (ps, pl) = merging::split_id(primary)?;
        let comparison_ref = comparison.map(merging::split_id).transpose()?;
        let resolve = |source: &str, lap: &str| -> Result<usize, String> {
            sources
                .iter()
                .position(|s| s.id == source && s.laps.iter().any(|l| l.id == lap))
                .ok_or_else(|| "Lap is not part of this merge.".into())
        };
        let pi = resolve(&ps, &pl)?;
        let ci = comparison_ref
            .as_ref()
            .map(|(s, l)| resolve(s, l))
            .transpose()?;
        let mut prepared: Vec<Option<Session>> = vec![None; sources.len()];
        if !formulas.is_empty() {
            for index in [Some(pi), ci].into_iter().flatten() {
                if prepared[index].is_some() {
                    continue;
                }
                let mut laps = vec![];
                if index == pi {
                    laps.push(pl.as_str());
                }
                if ci == Some(index) {
                    laps.push(comparison_ref.as_ref().unwrap().1.as_str());
                }
                let mut source = telemetry::selected_session(&sources[index], &laps);
                let translated = Self::source_formulas(&mut source, &preview, formulas);
                source
                    .channels
                    .extend(telemetry::expressions::evaluate(&source, &translated)?);
                prepared[index] = Some(source);
            }
        }
        let p_session = prepared[pi].as_ref().unwrap_or(&sources[pi]);
        let c_session = ci.map(|i| prepared[i].as_ref().unwrap_or(&sources[i]));
        let p = telemetry::LapSource {
            session: p_session,
            lap: p_session.laps.iter().find(|l| l.id == pl).unwrap(),
        };
        let c = c_session
            .zip(comparison_ref.as_ref())
            .map(|(session, (_, lap))| telemetry::LapSource {
                session,
                lap: session.laps.iter().find(|l| l.id == *lap).unwrap(),
            });
        let mut requested = channels.to_vec();
        if let Some(r) = advanced {
            requested.extend(
                [
                    r.x_channel.clone(),
                    r.y_channel.clone(),
                    r.hist_channel.clone(),
                    r.color_channel.clone(),
                    r.value_filter.as_ref().map(|f| f.channel.clone()),
                ]
                .into_iter()
                .flatten(),
            );
        }
        requested.sort();
        requested.dedup();
        let bindings: Vec<_> = requested
            .iter()
            .map(|channel| telemetry::ChannelBinding {
                output_id: channel.clone(),
                primary_id: Self::channel_for_source(&preview, p_session, channel),
                comparison_id: c_session
                    .and_then(|s| Self::channel_for_source(&preview, s, channel)),
            })
            .collect();
        let boundaries = self.merged_boundaries(&definition, primary, &ps, &pl);
        let mut analysis =
            telemetry::analyze_sources(p, c, axis, &bindings, boundaries.as_deref())?;
        for source in prepared.iter().flatten() {
            analysis.warnings.extend(
                source
                    .warnings
                    .iter()
                    .filter(|w| w.contains("formula dependency"))
                    .cloned(),
            );
        }
        let value = advanced
            .map(|request| {
                let result =
                    telemetry::advanced::analyze_sources(p, c, &analysis, request, &bindings)?;
                let mut value = serde_json::to_value(result).map_err(|e| e.to_string())?;
                value["sourceContentVersion"] =
                    Value::String(definition.entry.content_version.clone());
                let key = serde_json::to_vec(&(
                    id,
                    &definition.sources,
                    primary,
                    comparison,
                    axis,
                    request,
                    formulas,
                    &boundaries,
                ))
                .map_err(|e| e.to_string())?;
                value["parameterKey"] = Value::String(format!("{:x}", Sha256::digest(key)));
                Ok::<_, String>(value)
            })
            .transpose()?;
        analysis.primary.lap_id = primary.into();
        if let (Some(view), Some(id)) = (&mut analysis.comparison, comparison) {
            view.lap_id = id.into();
        }
        Ok((analysis, value))
    }
}

#[cfg(test)]
mod merge_mapping_tests {
    use super::*;
    fn source(id: &str, channels: Value) -> Session {
        serde_json::from_value(serde_json::json!({"id":id,"source":"","name":id,"driver":"","track":"","recordedAt":"2026-10-14 12:00:00","warnings":[],"laps":[{"id":"lap","number":1,"start":0,"end":1,"duration":1,"complete":true}],"channels":channels})).unwrap()
    }
    fn channel(id: &str, name: &str, unit: &str) -> Value {
        serde_json::json!({"id":id,"name":name,"unit":unit,"times":[0,1],"values":[10,20]})
    }
    #[test]
    fn cross_source_missing_formula_dependencies_and_channel_collisions() {
        let a = source(
            "a",
            serde_json::json!([channel("c1", "RPM", "rpm"), channel("c2", "Throttle", "%")]),
        );
        let b = source(
            "b",
            serde_json::json!([channel("c1", "Speed", "m/s"), channel("c3", "RPM", "rpm")]),
        );
        let refs = vec![
            SourceRef {
                session_id: "a".into(),
                content_version: "a".repeat(64),
            },
            SourceRef {
                session_id: "b".into(),
                content_version: "b".repeat(64),
            },
        ];
        let preview = merging::preview_sources(&[&a, &b], &refs).unwrap();
        let rpm = merging::qualified_channel_id("a", "c1");
        assert_eq!(
            Library::channel_for_source(&preview, &b, &rpm),
            Some("c3".into())
        );
        let throttle = merging::qualified_channel_id("a", "c2");
        let formula = telemetry::expressions::Formula {
            id: "derived".into(),
            name: "Throttle".into(),
            expression: format!("[{throttle}]+1{{%}}"),
        };
        let mut session = b.clone();
        let translated = Library::source_formulas(&mut session, &preview, &[formula]);
        let output = telemetry::expressions::evaluate(&session, &translated).unwrap();
        assert!(output[0].values.is_empty());
        assert!(session.warnings.iter().any(|w| w.contains("unavailable")));
        assert_eq!(b.channels.len(), 2);
        let mut ambiguous = b.clone();
        ambiguous.channels.push(ambiguous.channels[1].clone());
        assert!(Library::channel_for_source(&preview, &ambiguous, &rpm).is_none());
        let mut incompatible = b.clone();
        incompatible.channels[1].unit = "m/s".into();
        assert!(Library::channel_for_source(&preview, &incompatible, &rpm).is_none());
        let invalid = [telemetry::expressions::Formula {
            id: "derived".into(),
            name: "Invalid".into(),
            expression: format!("[{rpm}]+1{{s}}"),
        }];
        let translated = Library::source_formulas(&mut session, &preview, &invalid);
        assert!(telemetry::expressions::evaluate(&session, &translated).is_err());
        let cycle = [
            telemetry::expressions::Formula {
                id: "f1".into(),
                name: "First".into(),
                expression: "[f2]".into(),
            },
            telemetry::expressions::Formula {
                id: "f2".into(),
                name: "Second".into(),
                expression: "[f1]".into(),
            },
        ];
        assert!(telemetry::expressions::evaluate(&session, &cycle).is_err());
    }
}

#[cfg(all(windows, test))]
mod windows_commit_tests {
    use super::*;
    #[test]
    fn primary_failure_after_backup_rotation_preserves_memory_then_retries() {
        let root = std::env::temp_dir().join(format!("apex-commit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut library = Library::open(root.clone()).unwrap();
        library.commit(Manifest::default()).unwrap();
        let before = fs::read(root.join("library.json")).unwrap();
        let mut next = Manifest::default();
        next.version = 2;
        crate::persistence::FAIL_REPLACE
            .with(|f| *f.borrow_mut() = Some(root.join("library.json")));
        assert!(library.commit(next.clone()).is_err());
        crate::persistence::FAIL_REPLACE.with(|f| *f.borrow_mut() = None);
        assert_eq!(library.manifest.version, 1);
        assert_eq!(fs::read(root.join("library.json")).unwrap(), before);
        assert_eq!(
            fs::read(root.join("library.backup.json")).unwrap(),
            serde_json::to_vec(&Manifest::default()).unwrap()
        );
        library.commit(next).unwrap();
        assert_eq!(Library::open(root.clone()).unwrap().manifest.version, 2);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn backup_preparation_failure_does_not_change_primary_or_memory() {
        let root = std::env::temp_dir().join(format!("apex-backup-fail-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut library = Library::open(root.clone()).unwrap();
        library.commit(Manifest::default()).unwrap();
        let before = fs::read(root.join("library.json")).unwrap();
        let mut next = Manifest::default();
        next.version = 2;
        crate::persistence::FAIL_REPLACE
            .with(|f| *f.borrow_mut() = Some(root.join("library.backup.json")));
        assert!(library.commit(next).is_err());
        crate::persistence::FAIL_REPLACE.with(|f| *f.borrow_mut() = None);
        assert_eq!(library.manifest.version, 1);
        assert_eq!(fs::read(root.join("library.json")).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn first_save_backup_only_interruption_is_recoverable() {
        let root = std::env::temp_dir().join(format!("apex-first-save-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut library = Library::open(root.clone()).unwrap();
        crate::persistence::FAIL_REPLACE
            .with(|f| *f.borrow_mut() = Some(root.join("library.json")));
        assert!(library.commit(Manifest::default()).is_err());
        crate::persistence::FAIL_REPLACE.with(|f| *f.borrow_mut() = None);
        assert!(!root.join("library.json").exists());
        let recovered = Library::open(root.clone()).unwrap();
        assert_eq!(recovered.manifest.version, 1);
        assert!(!recovered.warnings.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
