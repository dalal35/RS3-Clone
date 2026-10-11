use super::*;
fn sample() -> Session {
    Session {
        id: "test".into(),
        source: "".into(),
        name: "".into(),
        driver: "".into(),
        track: "".into(),
        recorded_at: "".into(),
        warnings: vec![],
        laps: vec![
            Lap {
                id: "a".into(),
                number: 1,
                start: 0.,
                end: 10.,
                duration: 10.,
                complete: true,
            },
            Lap {
                id: "b".into(),
                number: 2,
                start: 10.,
                end: 20.,
                duration: 10.,
                complete: true,
            },
        ],
        channels: vec![
            Channel {
                id: "gps-speed".into(),
                name: "GPS Speed".into(),
                unit: "m/s".into(),
                times: (0..=20).map(|i| i as f64).collect(),
                values: vec![10.; 21],
            },
            Channel {
                id: "rpm".into(),
                name: "RPM".into(),
                unit: "rpm".into(),
                times: vec![0., 2., 4., 6., 8., 10., 12., 14., 16., 18., 20.],
                values: vec![5000.; 11],
            },
        ],
    }
}
#[test]
fn different_sample_rates_and_distance() {
    let s = sample();
    let a = analyze(&s, "a", Some("b"), "distance", &["rpm".into()]).unwrap();
    assert_eq!(a.primary.length, Some(100.));
    assert_eq!(a.primary.series[0].x, vec![0., 20., 40., 60., 80., 100.]);
    assert!(a.delta.unwrap().values.iter().all(|v| v.abs() < 1e-9));
}
#[test]
fn time_axis_without_distance() {
    let mut s = sample();
    s.channels.remove(0);
    let a = analyze(&s, "a", Some("b"), "time", &["rpm".into()]).unwrap();
    assert_eq!(a.primary.series[0].x.last(), Some(&10.));
    assert!(a.primary.length.is_none());
    assert!(a.delta.is_none());
    assert!(analyze(&s, "a", None, "distance", &[]).is_err());
}
#[test]
fn interpolation_does_not_extrapolate() {
    assert_eq!(interpolate(&[1., 2.], &[10., 20.], 0.), None);
    assert_eq!(interpolate(&[1., 2.], &[10., 20.], 1.5), Some(15.));
}
#[test]
fn delta_positive_means_primary_slower() {
    let mut s = sample();
    s.laps[0].end = 10.2;
    s.laps[0].duration = 10.2;
    s.laps[1].start = 10.2;
    s.laps[1].end = 20.;
    s.laps[1].duration = 9.8;
    let a = analyze(&s, "a", Some("b"), "distance", &[]).unwrap();
    assert!((a.delta.unwrap().values.last().unwrap() - 0.4).abs() < 1e-9);
}
#[test]
fn incompatible_distances_disable_delta() {
    let mut s = sample();
    s.laps[0].end = 12.;
    s.laps[0].duration = 12.;
    s.laps[1].start = 12.;
    s.laps[1].duration = 8.;
    assert!(analyze(&s, "a", Some("b"), "distance", &[])
        .unwrap()
        .delta
        .is_none());
}
#[test]
fn speed_gaps_disable_distance() {
    let mut s = sample();
    s.channels[0].times.drain(4..8);
    s.channels[0].values.drain(4..8);
    assert!(analyze(&s, "a", None, "distance", &[]).is_err());
}
#[test]
fn incomplete_laps_disable_delta() {
    let mut s = sample();
    s.laps[0].complete = false;
    assert!(analyze(&s, "a", Some("b"), "distance", &[])
        .unwrap()
        .delta
        .is_none());
}

#[test]
fn gps_speed_takes_priority_over_other_speed_channels() {
    let mut s = sample();
    let mut other = s.channels[0].clone();
    other.id = "wheel-speed".into();
    other.name = "Wheel Speed".into();
    other.values = vec![200.; 21];
    s.channels.insert(0, other);
    assert_eq!(
        analyze(&s, "a", None, "distance", &[])
            .unwrap()
            .primary
            .length,
        Some(100.)
    );
}
#[test]
fn invalid_gps_fix_disables_distance() {
    let mut s = sample();
    s.channels.push(Channel {
        id: "gps-fix".into(),
        name: "GPS Fix".into(),
        unit: "".into(),
        times: vec![0., 10., 20.],
        values: vec![2., 2., 2.],
    });
    assert!(analyze(&s, "a", None, "distance", &[]).is_err());
}

fn rpm_with_gap(s: &mut Session) {
    s.channels[1].times = (0..=200)
        .filter(|i| !(40..70).contains(i))
        .map(|i| i as f64 / 10.)
        .collect();
    s.channels[1].values = vec![5000.; s.channels[1].times.len()];
}
#[test]
fn ordinary_channel_gaps_are_reported_without_losing_source_samples() {
    let mut s = sample();
    rpm_with_gap(&mut s);
    let a = analyze(&s, "a", None, "time", &["rpm".into()]).unwrap();
    assert!(a
        .primary
        .warnings
        .iter()
        .any(|w| w.contains("RPM") && w.contains("gap")));
    let series = serde_json::to_value(&a.primary.series[0]).unwrap();
    assert_eq!(series["gaps"], serde_json::json!([[3.9, 7.0]]));
    assert!(a.primary.series[0].x.contains(&3.9));
    assert!(a.primary.series[0].x.contains(&7.));
    let a = analyze(&s, "a", None, "distance", &["rpm".into()]).unwrap();
    let series = serde_json::to_value(&a.primary.series[0]).unwrap();
    assert_eq!(series["gaps"], serde_json::json!([[39.0, 70.0]]));
}
#[test]
fn lap_edges_inside_source_gaps_are_not_interpolated() {
    let mut s = sample();
    rpm_with_gap(&mut s);
    s.laps[0].start = 5.;
    s.laps[0].duration = 5.;
    let a = analyze(&s, "a", None, "time", &["rpm".into()]).unwrap();
    assert_eq!(a.primary.series[0].x.first(), Some(&2.));
    let series = serde_json::to_value(&a.primary.series[0]).unwrap();
    assert_eq!(series["gaps"], serde_json::json!([[0.0, 2.0]]));
    s.laps[0].start = 0.;
    s.laps[0].end = 5.;
    s.laps[0].duration = 5.;
    let a = analyze(&s, "a", None, "time", &["rpm".into()]).unwrap();
    assert_eq!(a.primary.series[0].x.last(), Some(&3.9));
}
#[test]
fn stationary_distance_interpolation_stays_finite() {
    assert_eq!(
        interpolate(&[0., 0., 10., 10.], &[0., 1., 2., 3.], 0.),
        Some(0.)
    );
    assert_eq!(
        interpolate(&[0., 0., 10., 10.], &[0., 1., 2., 3.], 10.),
        Some(2.)
    );
}
