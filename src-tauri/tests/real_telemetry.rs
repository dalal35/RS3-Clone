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
        assert_eq!(
            a.alignment.method,
            "spatial",
            "{}",
            a.alignment.notes.join("; ")
        );
        assert!(a.alignment.coverage > 0.98);
        assert!(a.alignment.position_uncertainty_m.unwrap() > 0.);
        assert!(a.alignment.timing_uncertainty_s.unwrap() > 0.);
        assert!(a.segments.iter().any(|s| s.kind == "corner"));
        assert!(a.segments.iter().any(|s| s.kind == "straight"));
        assert!(a.segments.iter().all(|s| s.comparison.is_some()));
        assert!(a
            .segments
            .windows(2)
            .all(|s| (s[0].end_meters - s[1].start_meters).abs() < 1e-6));
        assert!(
            (a.segments.iter().map(|s| s.primary.elapsed).sum::<f64>() - fastest.duration).abs()
                < 0.002
        );
        assert!(
            (a.segments
                .iter()
                .map(|s| s.delta_seconds.unwrap())
                .sum::<f64>()
                - (fastest.duration - comparison.duration))
                .abs()
                < 0.002
        );
        assert!(a
            .primary
            .mapping
            .windows(2)
            .all(|s| s[1].meters > s[0].meters));
        assert!(a
            .comparison
            .as_ref()
            .unwrap()
            .mapping
            .windows(2)
            .all(|s| s[1].meters > s[0].meters));
        assert!(a.delta.is_some());
        let d = a.delta.unwrap();
        assert_eq!(d.method, "spatial");
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

#[test]
fn real_gps_corruption_fails_conservatively_and_preserves_recorded_durations() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../data");
    for name in [
        "yash dalal_59_PURDUE GP IN_Warm-up_a_0361.xrk",
        "yash dalal_59_PURDUE GP IN_Warm-up_a_0362.xrk",
    ] {
        let original = parse_session(&root.join(name)).unwrap();
        let mut laps = original
            .laps
            .iter()
            .filter(|l| l.complete)
            .collect::<Vec<_>>();
        laps.sort_by(|a, b| a.duration.total_cmp(&b.duration));
        let p = laps[0];
        let c = laps[1];
        for mode in ["fix", "accuracy", "missing"] {
            let mut s = original.clone();
            let id = if mode == "fix" {
                "gps-fix"
            } else if mode == "accuracy" {
                "gps-accuracy"
            } else {
                "gps-latitude"
            };
            let ch = s.channels.iter_mut().find(|ch| ch.id == id).unwrap();
            let i = ch.times.partition_point(|t| *t < c.start + 2.);
            if mode == "missing" {
                ch.times.drain(i..i + 15);
                ch.values.drain(i..i + 15);
            } else {
                ch.values[i..i + 15].fill(if mode == "fix" { 2. } else { 40. });
            }
            let a = analyze(&s, &p.id, Some(&c.id), "time", &["gps-speed".into()]).unwrap();
            assert_ne!(a.alignment.method, "spatial", "{name}: {mode}");
            assert!(a.segments.iter().all(|seg| seg.comparison.is_none()));
            assert_eq!(a.primary.duration, p.duration);
            if let Some(d) = a.delta {
                assert_eq!(d.method, "estimated");
                assert!((d.values.last().unwrap() - (p.duration - c.duration)).abs() < 0.002);
            }
        }
        // An isolated large spike is removed only when surrounding valid fixes
        // establish a short bridge. No fixture bytes are edited.
        let mut s = original.clone();
        let lat = s
            .channels
            .iter_mut()
            .find(|ch| ch.id == "gps-latitude")
            .unwrap();
        let i = lat.times.partition_point(|t| *t < c.start + 3.);
        lat.values[i] += 0.03;
        let a = analyze(&s, &p.id, Some(&c.id), "time", &[]).unwrap();
        assert_eq!(a.alignment.method, "spatial");
        assert!(a.alignment.coverage < 1.);
        assert!(a.alignment.notes.iter().any(|s| s.contains("rejected")));
        assert!(
            (a.delta.unwrap().values.last().unwrap() - (p.duration - c.duration)).abs() < 0.002
        );
    }
}
