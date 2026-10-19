//! Public, generated fixtures exercise the real parser and library on hosted OSes.
#[path = "support/synthetic_xrk.rs"]
mod synthetic_xrk;
use apex_telemetry::{
    library::Library,
    telemetry::{advanced::AdvancedRequest, expressions::Formula, parse_session},
};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Sandbox(PathBuf, PathBuf);
impl Sandbox {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "ttt-parity-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let mut root = base.clone();
        // Each component is short; total absolute path exceeds legacy MAX_PATH.
        for _ in 0..9 {
            root = root.join("Unicode 保存 café recording folder");
        }
        synthetic_xrk::write_pair(&root).unwrap();
        Self(root, base)
    }
}
impl Drop for Sandbox {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.1);
    }
}

#[test]
fn generated_xrk_import_analysis_and_math_use_real_parser_on_long_unicode_paths() {
    let root = Sandbox::new();
    assert!(root.0.to_string_lossy().encode_utf16().count() > 260);
    let source = root.0.join("synthetic-a.xrk");
    let parsed = parse_session(&source).unwrap();
    assert_eq!(parsed.driver, "Synthetic Driver");
    assert_eq!(parsed.track, "Synthetic Track");
    assert_eq!(parsed.laps.iter().filter(|l| l.complete).count(), 2);
    let mut lib = Library::open(root.0.join("workspace 保存")).unwrap();
    let session = lib.import(&source).unwrap();
    let analysis = lib
        .analyze(
            &session.id,
            "lap-1",
            Some("lap-2"),
            "distance",
            &["channel-0".into(), "gps-speed".into()],
        )
        .unwrap();
    assert_eq!(
        analysis.alignment.method, "spatial",
        "{:?}",
        analysis.alignment.notes
    );
    assert!(analysis.primary.track.len() >= 190);
    assert!((analysis.primary.length.unwrap() - 388.5).abs() < 2.);
    assert!(analysis.primary.series[0].values.len() >= 190);
    assert!(analysis.primary.series[0]
        .values
        .iter()
        .all(|v| *v == 5000.));
    assert!((analysis.delta.unwrap().values.last().unwrap()).abs() < 0.002);
    assert!(
        (analysis
            .segments
            .iter()
            .map(|s| s.primary.elapsed)
            .sum::<f64>()
            - 20.)
            .abs()
            < 0.002
    );
    let formula = vec![Formula {
        id: "double-rpm".into(),
        name: "Double RPM".into(),
        expression: "[channel-0] * 2".into(),
    }];
    lib.validate_formulas(&session.id, &formula).unwrap();
    let calculated = lib
        .analyze_formulas(
            &session.id,
            "lap-1",
            None,
            "time",
            &["double-rpm".into()],
            &formula,
        )
        .unwrap();
    assert!(calculated.primary.series[0].values.len() >= 190);
    assert!(calculated.primary.series[0]
        .values
        .iter()
        .all(|v| *v == 10000.));
    let mph = vec![Formula {
        id: "speed-mph".into(),
        name: "Speed MPH".into(),
        expression: "convert([gps-speed],\"mph\")".into(),
    }];
    let converted = lib
        .analyze_formulas(
            &session.id,
            "lap-1",
            None,
            "time",
            &["speed-mph".into()],
            &mph,
        )
        .unwrap();
    assert_eq!(converted.primary.series[0].unit, "mph");
    assert!(converted.primary.series[0].values.len() >= 190);
    // Straight velocity is 20m/s scaled by cycle/20, with ECEF rounded to cm/s.
    let expected_mph = (10. + 2. * std::f64::consts::PI * 30. / 12.) / 0.44704;
    assert!((converted.primary.series[0].values[20] - expected_mph).abs() < 0.03);
    let gg = lib
        .analyze_advanced(
            &session.id,
            "lap-1",
            Some("lap-2"),
            "time",
            AdvancedRequest {
                tool: "traction".into(),
                x_channel: Some("channel-1".into()),
                y_channel: Some("channel-2".into()),
                ..Default::default()
            },
            &[],
        )
        .unwrap();
    assert_eq!(gg["xUnit"], "g");
    assert_eq!(gg["yUnit"], "g");
    assert_eq!(gg["laps"].as_array().unwrap().len(), 2);
    assert!(gg["laps"][0]["points"].as_array().unwrap().len() >= 190);
    let mut boundaries: Vec<_> = analysis
        .segments
        .iter()
        .skip(1)
        .map(|s| s.start_meters)
        .collect();
    assert!(boundaries.len() >= 3);
    boundaries[0] += 1.;
    lib.set_corner_boundaries(&session.id, "lap-1", Some(boundaries.clone()))
        .unwrap();
    drop(lib);
    let mut reopened = Library::open(root.0.join("workspace 保存")).unwrap();
    let restored = reopened
        .analyze(&session.id, "lap-1", None, "distance", &[])
        .unwrap()
        .corner_boundaries
        .unwrap();
    assert_eq!(restored.len(), boundaries.len());
    assert!(restored
        .iter()
        .zip(&boundaries)
        .all(|(a, b)| (a - b).abs() < 1e-9));
    reopened
        .set_corner_boundaries(&session.id, "lap-1", None)
        .unwrap();
    assert!(reopened
        .analyze(&session.id, "lap-1", None, "distance", &[])
        .unwrap()
        .corner_boundaries
        .is_none());
}

#[test]
fn generated_xrk_merge_restart_relocate_unmerge_and_recovery_preserve_workspaces() {
    let root = Sandbox::new();
    let store = root.0.join("store");
    let mut lib = Library::open(store.clone()).unwrap();
    let a = lib.import(&root.0.join("synthetic-a.xrk")).unwrap();
    let b = lib.import(&root.0.join("synthetic-b.xrk")).unwrap();
    let source_bytes = fs::read(root.0.join("synthetic-a.xrk")).unwrap();
    let workspace = json!({"axis":"distance", "advanced":{"formulas":[{"id":"math","expression":"[channel-0]*2"}]},
        "video":{"version":1,"source":{"type":"local","path":"C:\\保存 café\\camera.mp4"},"segments":[{"anchorTelemetryTime":12,"anchorVideoTime":4}]},
        "futureOpaque":{"preserve":true}});
    lib.save_workspace(&a.id, workspace.clone()).unwrap();
    let ids = vec![a.id.clone(), b.id.clone()];
    let preview = lib.preview_merge(&ids).unwrap();
    let merged = lib.merge(&ids, &preview.preview_version, true).unwrap();
    assert_eq!(merged.laps.len(), 8);
    drop(lib);
    let mut lib = Library::open(store.clone()).unwrap();
    assert_eq!(
        lib.snapshot().unwrap().active_session_id,
        Some(merged.id.clone())
    );
    assert_eq!(lib.load(&merged.id).unwrap().laps.len(), 8);
    let primary = apex_telemetry::merging::qualified_lap_id(&a.id, "lap-1");
    let comparison = apex_telemetry::merging::qualified_lap_id(&b.id, "lap-1");
    let channel = apex_telemetry::merging::qualified_channel_id(&a.id, "channel-0");
    let analysis = lib
        .analyze(&merged.id, &primary, Some(&comparison), "time", &[channel])
        .unwrap();
    assert!(analysis.primary.series[0].values.len() >= 190);
    assert!(analysis.primary.series[0]
        .values
        .iter()
        .all(|v| *v == 5000.));
    let comparison = analysis.comparison.unwrap();
    assert!(comparison.series[0].values.len() >= 190);
    assert!(comparison.series[0].values.iter().all(|v| *v == 7000.));
    let moved = root.0.join("relocated 保存.xrk");
    fs::rename(root.0.join("synthetic-a.xrk"), &moved).unwrap();
    assert!(lib.load(&merged.id).is_err());
    lib.locate(&a.id, &moved).unwrap();
    assert_eq!(lib.load(&merged.id).unwrap().laps.len(), 8);
    lib.unmerge(&merged.id).unwrap();
    let snapshot = lib.snapshot().unwrap();
    assert_eq!(snapshot.entries.len(), 2);
    assert_eq!(
        snapshot
            .entries
            .iter()
            .find(|e| e.id == a.id)
            .unwrap()
            .workspace
            .as_ref(),
        Some(&workspace)
    );
    lib.save_workspace(&a.id, workspace.clone()).unwrap();
    lib.save_workspace(&a.id, json!({"revision":2})).unwrap();
    drop(lib);
    fs::write(store.join("library.json"), b"interrupted").unwrap();
    let snapshot = Library::open(store).unwrap().snapshot().unwrap();
    assert!(!snapshot.warnings.is_empty());
    assert_eq!(
        snapshot
            .entries
            .iter()
            .find(|e| e.id == a.id)
            .unwrap()
            .workspace
            .as_ref(),
        Some(&workspace)
    );
    assert_eq!(fs::read(&moved).unwrap(), source_bytes);
    assert!(root.0.join("synthetic-b.xrk").exists());
}
