use apex_telemetry::telemetry::{analyze, parse_session};
use std::path::Path;
#[test]
fn real_xrk_sessions_preserve_laps_samples_and_gps() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../data");
    for (name, best) in [
        ("yash dalal_59_PURDUE GP IN_Warm-up_a_0361.xrk", 26.676_f64),
        ("yash dalal_59_PURDUE GP IN_Warm-up_a_0362.xrk", 26.585_f64),
    ] {
        let path = root.join(name);
        assert!(path.exists(), "Required local fixture is missing: {name}");
        let s = parse_session(&path).unwrap();
        assert_eq!(s.laps.len(), 12);
        assert!(!s.laps[0].complete);
        assert!(!s.laps.last().unwrap().complete);
        assert_eq!(s.driver, "yash dalal");
        assert_eq!(s.track, "PURDUE GP IN");
        for c in &s.channels {
            assert_eq!(c.times.len(), c.values.len());
            assert!(c.times.windows(2).all(|w| w[1] > w[0]));
            assert!(c.values.iter().all(|v| v.is_finite()));
        }
        let fastest = s
            .laps
            .iter()
            .filter(|l| l.complete)
            .min_by(|a, b| a.duration.total_cmp(&b.duration))
            .unwrap();
        assert!((fastest.duration - best).abs() < 0.001);
        let rpm = s
            .channels
            .iter()
            .find(|c| c.name.to_lowercase().contains("rpm"))
            .unwrap();
        assert!(rpm.values.iter().any(|v| *v > 3000. && *v < 20000.));
        let comparison = s
            .laps
            .iter()
            .find(|l| l.complete && l.id != fastest.id)
            .unwrap();
        let a = analyze(
            &s,
            &fastest.id,
            Some(&comparison.id),
            "distance",
            &[rpm.id.clone(), "gps-speed".into()],
        )
        .unwrap();
        assert!(a.primary.length.unwrap() > 300. && a.primary.length.unwrap() < 1500.);
        assert!(a.primary.track.len() > 100);
        assert_eq!(a.primary.series.len(), 2);
        assert!(a.delta.is_some());
        let d = a.delta.unwrap();
        assert!(
            (d.values.last().unwrap() - (fastest.duration - comparison.duration)).abs() < 0.002
        );
    }
}
#[test]
fn malformed_file_is_rejected() {
    let p = std::env::temp_dir().join(format!("apex-invalid-{}.xrk", std::process::id()));
    std::fs::write(&p, b"not an xrk file").unwrap();
    assert!(parse_session(&p).is_err());
    std::fs::remove_file(p).unwrap();
}
