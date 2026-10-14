use apex_telemetry::library::Library;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn setup(label: &str) -> (PathBuf, Library, Vec<String>) {
    let p = std::env::temp_dir().join(format!("apex-merging-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    let mut lib = Library::open(p.join("store")).unwrap();
    let mut ids = vec![];
    for n in [361, 362] {
        let original = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
            "../data/yash dalal_59_PURDUE GP IN_Warm-up_a_0{n}.xrk"
        ));
        let mut bytes = fs::read(original).unwrap();
        let offset = bytes.windows(10).position(|s| s == b"10/07/2026").unwrap();
        bytes[offset..offset + 10].copy_from_slice(b"10/14/2026");
        // Header footer checksum covers the date payload including its NUL terminator.
        let checksum = bytes[offset..offset + 11]
            .iter()
            .fold(0u16, |sum, b| sum.wrapping_add(*b as u16));
        bytes[offset + 16..offset + 18].copy_from_slice(&checksum.to_le_bytes());
        let file = p.join(format!("{n}.xrk"));
        fs::write(&file, bytes).unwrap();
        ids.push(lib.import(&file).unwrap().id);
    }
    (p, lib, ids)
}
fn create(lib: &mut Library, ids: &[String]) -> String {
    let p = lib.preview_merge(ids).unwrap();
    lib.merge(ids, &p.preview_version, true).unwrap().id
}
#[test]
fn merge_reopen_unmerge_preserves_originals() {
    let (p, mut lib, ids) = setup("restore");
    for id in &ids {
        lib.save_workspace(
            id,
            json!({"axis":"time","video":{"version":999,"opaque":"preserved"}}),
        )
        .unwrap();
    }
    let before: Vec<_> = lib
        .snapshot()
        .unwrap()
        .entries
        .iter()
        .map(|e| (e.id.clone(), e.workspace.clone()))
        .collect();
    let id = create(&mut lib, &ids);
    let s = lib.load(&id).unwrap();
    assert_eq!(s.laps.len(), 24);
    assert!(s.channels.iter().all(|c| c.times.is_empty()));
    let text = fs::read_to_string(p.join("store/library.json")).unwrap();
    assert!(!text.contains("\"values\""));
    assert!(!text.contains("\"times\""));
    let mut lib = Library::open(p.join("store")).unwrap();
    assert_eq!(lib.snapshot().unwrap().active_session_id, Some(id.clone()));
    assert_eq!(lib.load(&id).unwrap().laps.len(), 24);
    let snapshot = lib.unmerge(&id).unwrap();
    assert_eq!(snapshot.entries.len(), 2);
    for (id, w) in before {
        assert_eq!(
            snapshot
                .entries
                .iter()
                .find(|e| e.id == id)
                .unwrap()
                .workspace,
            w
        );
    }
    assert!(lib.save_workspace(&id, json!({})).is_err());
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn merge_missing_locate() {
    let (p, mut lib, ids) = setup("missing");
    let id = create(&mut lib, &ids);
    fs::rename(p.join("361.xrk"), p.join("moved.xrk")).unwrap();
    assert_eq!(
        lib.snapshot()
            .unwrap()
            .entries
            .iter()
            .find(|e| e.id == id)
            .unwrap()
            .status,
        "missing"
    );
    assert!(lib.load(&id).is_err());
    lib.locate(&ids[0], &p.join("moved.xrk")).unwrap();
    assert!(lib.load(&id).is_ok());
    fs::remove_file(p.join("moved.xrk")).unwrap();
    assert!(lib.unmerge(&id).is_ok());
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn merge_stale_preview() {
    let (p, mut lib, ids) = setup("stale");
    let preview = lib.preview_merge(&ids).unwrap();
    assert!(lib.merge(&ids, &preview.preview_version, false).is_err());
    let mut bytes = fs::read(p.join("361.xrk")).unwrap();
    bytes[0] ^= 1;
    fs::write(p.join("361.xrk"), bytes).unwrap();
    assert!(lib.merge(&ids, &preview.preview_version, true).is_err());
    assert_eq!(lib.snapshot().unwrap().entries.len(), 2);
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn merge_dependency_policy() {
    let (p, mut lib, ids) = setup("dependencies");
    let id = create(&mut lib, &ids);
    assert!(lib.remove(&ids[0]).is_err());
    assert!(lib.refresh(&ids[0]).is_ok());
    let bytes = fs::read(p.join("362.xrk")).unwrap();
    fs::write(p.join("361.xrk"), bytes).unwrap();
    assert!(lib.refresh(&ids[0]).unwrap_err().contains("Unmerge"));
    lib.unmerge(&id).unwrap();
    assert!(lib.remove(&ids[0]).is_ok());
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn merge_schema_recovery() {
    let (p, mut lib, ids) = setup("schema");
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(p.join("store/library.json")).unwrap()).unwrap()
            ["version"],
        1
    );
    let id = create(&mut lib, &ids);
    lib.save_workspace(&id, json!({"axis":"time"})).unwrap();
    let primary = p.join("store/library.json");
    let saved = fs::read(&primary).unwrap();
    let mut value: Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(value["version"], 2);
    fs::write(p.join("store/library.tmp"), b"interrupted").unwrap();
    assert!(Library::open(p.join("store")).is_ok());
    for bad in [
        json!({"sessionId":"missing","contentVersion":"a".repeat(64)}),
        json!({"sessionId":id,"contentVersion":"bad"}),
    ] {
        let mut v = value.clone();
        v["merges"][0]["sources"][0] = bad;
        fs::write(&primary, serde_json::to_vec(&v).unwrap()).unwrap();
        assert!(!Library::open(p.join("store"))
            .unwrap()
            .snapshot()
            .unwrap()
            .warnings
            .is_empty());
    }
    value["version"] = json!(999);
    fs::write(&primary, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(Library::open(p.join("store")).is_err());
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(&primary).unwrap()).unwrap()["version"],
        999
    );
    fs::write(&primary, b"damaged").unwrap();
    assert!(!Library::open(p.join("store"))
        .unwrap()
        .snapshot()
        .unwrap()
        .warnings
        .is_empty());
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn merge_settings_bounds() {
    let (p, mut lib, ids) = setup("bounds");
    let id = create(&mut lib, &ids);
    lib.save_workspace(&id, json!({"retained":true})).unwrap();
    assert!(lib
        .save_workspace(&id, json!({"big":"x".repeat(65536)}))
        .is_err());
    assert_eq!(
        lib.snapshot()
            .unwrap()
            .entries
            .iter()
            .find(|e| e.id == id)
            .unwrap()
            .workspace
            .as_ref()
            .unwrap()["retained"],
        true
    );
    assert!(lib
        .save_workspace_version(&id, json!({}), &"0".repeat(64))
        .is_err());
    fs::remove_dir_all(p).unwrap();
}
