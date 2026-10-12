use apex_telemetry::{
    library::Library,
    telemetry::{advanced::AdvancedRequest, expressions::Formula},
};
use std::{fs, path::PathBuf};
fn fixture(n: u32) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "../data/yash dalal_59_PURDUE GP IN_Warm-up_a_0{n}.xrk"
    ))
}
#[test]
fn real_xrk_advanced_library_contract_and_restart() {
    for n in [361, 362] {
        let root = std::env::temp_dir().join(format!("apex-advanced-{n}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let file = root.join("copy.xrk");
        fs::copy(fixture(n), &file).unwrap();
        let mut lib = Library::open(root.join("store")).unwrap();
        let s = lib.import(&file).unwrap();
        let lap = &s
            .laps
            .iter()
            .filter(|l| l.complete)
            .min_by(|a, b| a.duration.total_cmp(&b.duration))
            .unwrap()
            .id;
        let rpm = s
            .channels
            .iter()
            .find(|c| c.name.to_lowercase().contains("rpm"))
            .unwrap();
        let speed = s.channels.iter().find(|c| c.id == "gps-speed").unwrap();
        let accel: Vec<_> = s
            .channels
            .iter()
            .filter(|c| c.unit.eq_ignore_ascii_case("g"))
            .collect();
        assert!(accel.len() >= 2, "actual accelerometers available");
        let run = |lib: &mut Library, r: AdvancedRequest| {
            lib.analyze_advanced(&s.id, lap, None, "time", r, &[])
                .unwrap()
        };
        let scatter = run(
            &mut lib,
            AdvancedRequest {
                x_channel: Some(rpm.id.clone()),
                y_channel: Some(speed.id.clone()),
                ..Default::default()
            },
        );
        assert!(scatter["laps"][0]["points"].as_array().unwrap().len() > 100);
        assert_eq!(scatter["xUnit"], rpm.unit);
        assert_eq!(scatter["yUnit"], speed.unit);
        let gg = run(
            &mut lib,
            AdvancedRequest {
                tool: "traction".into(),
                x_channel: Some(accel[0].id.clone()),
                y_channel: Some(accel[1].id.clone()),
                ..Default::default()
            },
        );
        assert_eq!(gg["xUnit"], "g");
        assert!(gg["notes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap().contains("orientation")));
        assert!(!gg["laps"][0]["points"].as_array().unwrap().is_empty());
        for weighting in ["time", "samples"] {
            let h = run(
                &mut lib,
                AdvancedRequest {
                    tool: "histogram".into(),
                    hist_channel: Some(rpm.id.clone()),
                    weighting: weighting.into(),
                    percentage: false,
                    range: Some([1.25, 2.75]),
                    ..Default::default()
                },
            );
            let l = &h["laps"][0];
            let mass: f64 = l["histogram"]
                .as_array()
                .unwrap()
                .iter()
                .map(|b| b["value"].as_f64().unwrap())
                .sum();
            let expected = if weighting == "time" {
                l["stats"]["duration"].as_f64().unwrap()
            } else {
                l["points"].as_array().unwrap().len() as f64
            };
            assert!(mass > 0.);
            assert!((mass - expected).abs() < 1e-6);
            if weighting == "time" {
                assert!((mass - 1.5).abs() < 0.01);
            }
        }
        let shifts = run(
            &mut lib,
            AdvancedRequest {
                tool: "shifts".into(),
                ..Default::default()
            },
        );
        let events = shifts["laps"][0]["events"].as_array().unwrap();
        assert!(!events.is_empty());
        assert!(events.iter().all(|e| e["kind"] == "calculated-gear-shift"
            && e["evidence"].as_str().unwrap().contains("unverified")));
        let excluded = run(
            &mut lib,
            AdvancedRequest {
                tool: "shifts".into(),
                excluded_ids: vec![events[0]["id"].as_str().unwrap().into()],
                ..Default::default()
            },
        );
        assert_eq!(
            excluded["laps"][0]["events"].as_array().unwrap().len(),
            events.len() - 1
        );
        let filtered = run(
            &mut lib,
            AdvancedRequest {
                x_channel: Some(rpm.id.clone()),
                y_channel: Some(speed.id.clone()),
                range: Some([1., 2.]),
                ..Default::default()
            },
        );
        assert!(filtered["laps"][0]["points"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| (1.0..=2.0).contains(&p["position"].as_f64().unwrap())));
        let missing = run(
            &mut lib,
            AdvancedRequest {
                x_channel: Some("missing".into()),
                ..Default::default()
            },
        );
        assert!(missing["laps"].as_array().unwrap().is_empty());
        assert!(!missing["notes"].as_array().unwrap().is_empty());
        let formulas = vec![Formula {
            id: "test-rpm".into(),
            name: "RPM identity".into(),
            expression: format!("[{}] * 2", rpm.id),
        }];
        let metadata = lib.validate_formulas(&s.id, &formulas).unwrap();
        assert_eq!(metadata[0]["id"], "test-rpm");
        let a = lib
            .analyze_formulas(&s.id, lap, None, "time", &["test-rpm".into()], &formulas)
            .unwrap();
        assert!(!a.primary.series.is_empty());
        assert!(lib
            .validate_formulas(
                &s.id,
                &[Formula {
                    id: "bad".into(),
                    name: "Bad".into(),
                    expression: "[missing]".into()
                }]
            )
            .is_err());
        let derived = lib
            .analyze_advanced(
                &s.id,
                lap,
                None,
                "time",
                AdvancedRequest {
                    x_channel: Some("test-rpm".into()),
                    y_channel: Some(speed.id.clone()),
                    ..Default::default()
                },
                &formulas,
            )
            .unwrap();
        assert!(!derived["laps"][0]["points"].as_array().unwrap().is_empty());
        assert_eq!(derived["xUnit"], "rpm");
        let old = serde_json::json!({"axis":"time","channelIds":[rpm.id]});
        lib.save_workspace(&s.id, old.clone()).unwrap();
        drop(lib);
        let mut lib = Library::open(root.join("store")).unwrap();
        assert_eq!(
            lib.snapshot().unwrap().entries[0]
                .workspace
                .as_ref()
                .unwrap(),
            &old
        );
        let workspace = serde_json::json!({"axis":"time","advanced":{"version":1,"formulas":formulas,"presets":[{"id":"custom","name":"My RPM","config":{"tool":"scatter"}}],"lastPreset":"custom","defaultPreset":"custom"}});
        lib.save_workspace(&s.id, workspace.clone()).unwrap();
        drop(lib);
        let mut lib = Library::open(root.join("store")).unwrap();
        assert_eq!(
            lib.snapshot().unwrap().entries[0]
                .workspace
                .as_ref()
                .unwrap(),
            &workspace
        );
        run(
            &mut lib,
            AdvancedRequest {
                tool: "shifts".into(),
                ..Default::default()
            },
        );
        let mut bytes = fs::read(&file).unwrap();
        bytes[0] ^= 1;
        fs::write(&file, bytes).unwrap();
        assert!(
            lib.analyze_advanced(
                &s.id,
                lap,
                None,
                "time",
                AdvancedRequest {
                    tool: "shifts".into(),
                    ..Default::default()
                },
                &[]
            )
            .is_err(),
            "cache must reject stale original bytes"
        );
        assert!(lib.validate_formulas(&s.id, &formulas).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
