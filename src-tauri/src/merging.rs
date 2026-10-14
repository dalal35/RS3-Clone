//! Virtual merge metadata only; source sample buffers never enter these descriptors.
use crate::telemetry::{Channel, Lap, Session};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRef {
    pub session_id: String,
    pub content_version: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapRef {
    pub source_session_id: String,
    pub source_lap_id: String,
}
#[derive(Clone, Debug, PartialEq)]
pub struct RecordingStamp {
    pub day: String,
    pub seconds_from_midnight: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedLap {
    #[serde(flatten)]
    pub lap: Lap,
    pub source_session_id: String,
    pub source_lap_id: String,
    pub display_number: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedChannel {
    #[serde(flatten)]
    pub channel: Channel,
    pub source_session_id: String,
    pub source_channel_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub sources: Vec<SourceRef>,
    pub day: String,
    pub laps: Vec<MergedLap>,
    pub channels: Vec<MergedChannel>,
    pub warnings: Vec<String>,
    pub preview_version: String,
}
pub fn qualified_lap_id(source: &str, lap: &str) -> String {
    serde_json::to_string(&(source, lap)).expect("string pair")
}
pub fn qualified_channel_id(source: &str, channel: &str) -> String {
    format!(
        "source-channel-{:x}",
        Sha256::digest(qualified_lap_id(source, channel).as_bytes())
    )
}
pub fn split_id(id: &str) -> Result<(String, String), String> {
    serde_json::from_str(id).map_err(|_| "Invalid source-qualified identity.".into())
}
// AiM XRK DLL documentation: Date & Time means acquisition start, managed by the logger.
// https://docs.aim-sportline.com/racestudio3/html/xrk-dll.html
// AiM Solo2DL/SW4 manuals allow configurable date formats. Never guess ambiguous slash dates.
// Pinned libxrk spec/docs/companion.md §2 and parser.rs process_laps subtract time_offset
// from logger-power-on milliseconds; exported Lap.start is already session-relative.
pub fn parse_recording_stamp(value: &str) -> Result<RecordingStamp, String> {
    let invalid = || {
        "Recording date/time is missing, invalid or ambiguous. Merging requires an unambiguous XRK recording timestamp; filenames are not used.".to_string()
    };
    let parts: Vec<_> = value.split_whitespace().collect();
    if parts.len() != 2 {
        return Err(invalid());
    }
    let date = parts[0];
    let parse = |s: &str| s.parse::<u32>().map_err(|_| invalid());
    let (year, month, day) = if date.len() == 10
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
        && date.is_ascii()
    {
        (
            parse(&date[0..4])?,
            parse(&date[5..7])?,
            parse(&date[8..10])?,
        )
    } else {
        let d: Vec<_> = date.split('/').collect();
        if d.len() != 3 || d[2].len() != 4 {
            return Err(invalid());
        }
        let a = parse(d[0])?;
        let b = parse(d[1])?;
        let y = parse(d[2])?;
        if a > 12 && b <= 12 {
            (y, b, a)
        } else if b > 12 && a <= 12 {
            (y, a, b)
        } else {
            return Err(invalid());
        }
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let limit = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    if !(1970..=9999).contains(&year) || day == 0 || day > limit {
        return Err(invalid());
    }
    let t: Vec<_> = parts[1].split(':').collect();
    if t.len() != 3 || t.iter().any(|s| s.len() != 2) {
        return Err(invalid());
    }
    let h = parse(t[0])?;
    let m = parse(t[1])?;
    let s = parse(t[2])?;
    if h > 23 || m > 59 || s > 59 {
        return Err(invalid());
    }
    Ok(RecordingStamp {
        day: format!("{year:04}-{month:02}-{day:02}"),
        seconds_from_midnight: h * 3600 + m * 60 + s,
    })
}
pub fn preview_sources(sources: &[&Session], refs: &[SourceRef]) -> Result<MergePreview, String> {
    let mut seen = HashSet::new();
    let mut ordered = vec![];
    for source in sources {
        if seen.insert(source.id.as_str()) {
            let reference = refs
                .iter()
                .find(|r| r.session_id == source.id)
                .ok_or("Source identity missing.")?;
            if reference.content_version.len() != 64
                || !reference
                    .content_version
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit())
            {
                return Err("Invalid source content hash.".into());
            }
            ordered.push((
                *source,
                reference.clone(),
                parse_recording_stamp(&source.recorded_at)?,
            ));
        }
    }
    if ordered.len() < 2 {
        return Err("Select at least two distinct original sessions.".into());
    }
    ordered.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    let day = ordered[0].2.day.clone();
    if ordered.iter().any(|s| s.2.day != day) {
        return Err("Sessions must have the same verified recording day.".into());
    }
    let mut warnings=vec!["Recording times use the logger's local clock; timezone and clock accuracy are not independently verified.".into()];
    for (label, values) in [
        (
            "track",
            ordered
                .iter()
                .map(|s| s.0.track.trim())
                .collect::<HashSet<_>>(),
        ),
        (
            "driver",
            ordered.iter().map(|s| s.0.driver.trim()).collect(),
        ),
        (
            "session metadata",
            ordered.iter().map(|s| s.0.name.trim()).collect(),
        ),
    ] {
        if values.len() > 1 {
            warnings.push(format!("Conflicting {label} across recordings. Compatibility is checked again during comparison."));
        }
        if values.contains("") {
            warnings.push(format!("Missing {label} in a source recording."));
        }
    }
    let mut timed = vec![];
    let mut channels = vec![];
    for (s, _, stamp) in &ordered {
        warnings.extend(s.warnings.iter().map(|w| format!("{}: {w}", s.name)));
        for l in &s.laps {
            if ![l.start, l.end, l.duration].iter().all(|x| x.is_finite())
                || l.end <= l.start
                || l.duration <= 0.
            {
                return Err("A source lap has unreliable timing.".into());
            }
            let mut lap = l.clone();
            lap.id = qualified_lap_id(&s.id, &l.id);
            timed.push((
                stamp.seconds_from_midnight as f64 + l.start,
                stamp.seconds_from_midnight as f64 + l.end,
                MergedLap {
                    lap,
                    source_session_id: s.id.clone(),
                    source_lap_id: l.id.clone(),
                    display_number: 0,
                },
            ));
        }
        for c in &s.channels {
            channels.push(MergedChannel {
                channel: Channel {
                    id: qualified_channel_id(&s.id, &c.id),
                    name: c.name.clone(),
                    unit: c.unit.clone(),
                    times: vec![],
                    values: vec![],
                    gaps: vec![],
                },
                source_session_id: s.id.clone(),
                source_channel_id: c.id.clone(),
            });
        }
    }
    timed.sort_by(|a, b| {
        a.0.total_cmp(&b.0)
            .then(a.2.source_session_id.cmp(&b.2.source_session_id))
            .then(a.2.source_lap_id.cmp(&b.2.source_lap_id))
    });
    for i in 0..timed.len() {
        for j in i + 1..timed.len() {
            let a = &timed[i];
            let b = &timed[j];
            if a.2.source_session_id == b.2.source_session_id {
                continue;
            }
            if b.0 < a.1 && a.0 < b.1 {
                warnings.push("Source lap timestamps overlap; all laps are retained and analyzed in their own source.".into());
            }
            if (a.0 - b.0).abs() < 0.001 && (a.2.lap.duration - b.2.lap.duration).abs() < 0.001 {
                warnings.push("Possible duplicate laps have matching start times and durations; both source identities are retained.".into());
            }
        }
    }
    // Bound repeated warnings while preserving distinct parser/source explanations.
    let mut unique = HashSet::new();
    warnings.retain(|w| unique.insert(w.clone()));
    let mut laps: Vec<_> = timed.into_iter().map(|(_, _, l)| l).collect();
    for (i, l) in laps.iter_mut().enumerate() {
        l.display_number = i + 1;
    }
    let sources = ordered.into_iter().map(|(_, r, _)| r).collect();
    let mut result = MergePreview {
        sources,
        day,
        laps,
        channels,
        warnings,
        preview_version: String::new(),
    };
    result.preview_version = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&result).map_err(|e| e.to_string())?)
    );
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::telemetry::{Channel, Lap, Session};
    fn source(id: &str, stamp: &str) -> Session {
        Session {
            merge: None,
            id: id.into(),
            source: format!("{id}.xrk"),
            name: id.into(),
            driver: "Driver".into(),
            track: "Track".into(),
            recorded_at: stamp.into(),
            channels: vec![Channel {
                id: "channel-1".into(),
                name: "RPM".into(),
                unit: "rpm".into(),
                times: vec![0., 1.],
                values: vec![10., 20.],
                gaps: vec![],
            }],
            laps: vec![Lap {
                id: "lap-1".into(),
                number: 7,
                start: 0.,
                end: 1.,
                duration: 1.,
                complete: false,
            }],
            warnings: vec![],
        }
    }
    fn refs(sources: &[&Session]) -> Vec<SourceRef> {
        sources
            .iter()
            .map(|s| SourceRef {
                session_id: s.id.clone(),
                content_version: "a".repeat(64),
            })
            .collect()
    }
    #[test]
    fn recording_stamp_validation() {
        let stamp = parse_recording_stamp("2024-02-29 18:26:09").unwrap();
        assert_eq!(stamp.day, "2024-02-29");
        assert_eq!(stamp.seconds_from_midnight, 66369);
        for bad in [
            "",
            "2023-02-29 12:00:00",
            "2024-04-31 12:00:00",
            "2024-02-29 24:00:00",
            "07/10/2026 18:26:09",
            "2024-02-29",
        ] {
            assert!(parse_recording_stamp(bad).is_err(), "{bad}");
        }
    }
    #[test]
    fn preview_preserves_sources() {
        let a = source("a", "2026-10-07 18:00:00");
        let b = source("b", "2026-10-07 17:00:00");
        let p = preview_sources(&[&a, &b], &refs(&[&a, &b])).unwrap();
        assert_eq!(p.laps.len(), 2);
        assert_eq!(p.laps[0].source_session_id, "b");
        assert_eq!(p.laps[0].source_lap_id, "lap-1");
        assert_eq!(p.laps[0].lap.number, 7);
        assert_eq!(
            (
                p.laps[0].lap.start,
                p.laps[0].lap.end,
                p.laps[0].lap.duration
            ),
            (0., 1., 1.)
        );
        assert_ne!(p.laps[0].lap.id, p.laps[1].lap.id);
        assert!(p
            .channels
            .iter()
            .all(|c| c.channel.times.is_empty() && c.channel.values.is_empty()));
        assert_ne!(p.channels[0].channel.id, p.channels[1].channel.id);
        let reverse = preview_sources(&[&b, &a], &refs(&[&b, &a])).unwrap();
        assert_eq!(p.preview_version, reverse.preview_version);
        let other = source("c", "2026-10-08 17:00:00");
        assert!(preview_sources(&[&a, &other], &refs(&[&a, &other])).is_err());
        assert!(preview_sources(&[&a, &a], &refs(&[&a, &a])).is_err());
    }
    #[test]
    fn preview_warns_without_deduplication() {
        let a = source("a", "2026-10-07 18:00:00");
        let mut b = source("b", "2026-10-07 18:00:00");
        b.track = "Elsewhere".into();
        let p = preview_sources(&[&b, &a], &refs(&[&b, &a])).unwrap();
        assert_eq!(p.laps.len(), 2);
        assert_eq!(p.laps[0].source_session_id, "a");
        assert!(p.warnings.iter().any(|w| w.contains("overlap")));
        assert!(p.warnings.iter().any(|w| w.contains("duplicate")));
        assert!(p.warnings.iter().any(|w| w.contains("track")));
        assert!(!a.channels[0].times.is_empty());
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeSource {
    #[serde(flatten)]
    pub reference: SourceRef,
    pub session: Session,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeInfo {
    pub preview: MergePreview,
    pub sources: Vec<MergeSource>,
}
pub fn descriptor(s: &Session) -> Session {
    Session {
        id: s.id.clone(),
        source: s.source.clone(),
        name: s.name.clone(),
        driver: s.driver.clone(),
        track: s.track.clone(),
        recorded_at: s.recorded_at.clone(),
        laps: s.laps.clone(),
        warnings: s.warnings.clone(),
        merge: None,
        channels: s
            .channels
            .iter()
            .map(|c| Channel {
                id: c.id.clone(),
                name: c.name.clone(),
                unit: c.unit.clone(),
                times: vec![],
                values: vec![],
                gaps: vec![],
            })
            .collect(),
    }
}
