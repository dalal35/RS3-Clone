#[cfg(test)]
mod tests {
    use super::*;
    fn c(t: Vec<f64>, v: Vec<f64>) -> Channel {
        Channel {
            gaps: vec![],
            id: "x".into(),
            name: "x".into(),
            unit: "g".into(),
            times: t,
            values: v,
        }
    }
    #[test]
    fn invalid_does_not_bridge() {
        let c = c(vec![0., 1., 2.], vec![1., f64::NAN, 3.]);
        assert_eq!(sample(&c, 0.5), None);
        assert_eq!(sample(&c, 1.5), None);
    }
    #[test]
    fn gap_does_not_bridge() {
        let mut c = c(vec![0., 0.1, 0.2, 0.3, 3., 3.1], vec![1.; 6]);
        c.gaps = super::super::source_gaps(&c);
        assert_eq!(sample(&c, 1.), None);
    }
    #[test]
    fn converts_acceleration() {
        assert!((acceleration("m/s²").unwrap() * 9.80665 - 1.).abs() < 1e-12);
        assert_eq!(acceleration("unknown"), None);
    }
    #[test]
    fn weighted_linear_distribution() {
        let pieces = vec![(0., 10., 2.)];
        let s = statistics(&[], &pieces, true);
        assert_eq!(s.mean, Some(5.));
        assert!((s.p95.unwrap() - 9.5).abs() < 1e-8);
        assert_eq!(s.duration, 2.);
    }
}

use super::{Analysis, Channel, Lap, LapView, Session};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AdvancedRequest {
    pub tool: String,
    pub axis: String,
    pub x_channel: Option<String>,
    pub y_channel: Option<String>,
    pub hist_channel: Option<String>,
    pub color_channel: Option<String>,
    pub bins: usize,
    pub percentage: bool,
    pub bin_width: Option<f64>,
    pub weighting: String,
    pub range: Option<[f64; 2]>,
    pub corner_id: Option<String>,
    pub value_filter: Option<ValueFilter>,
    pub x_sign: f64,
    pub y_sign: f64,
    pub x_offset: f64,
    pub y_offset: f64,
    pub bog_threshold: f64,
    pub min_duration: f64,
    pub sensitivity: f64,
    pub excluded_ids: Vec<String>,
}
impl Default for AdvancedRequest {
    fn default() -> Self {
        Self {
            tool: "scatter".into(),
            axis: "time".into(),
            x_channel: None,
            y_channel: None,
            hist_channel: None,
            color_channel: None,
            bins: 30,
            percentage: true,
            bin_width: None,
            weighting: "time".into(),
            range: None,
            corner_id: None,
            value_filter: None,
            x_sign: 1.,
            y_sign: 1.,
            x_offset: 0.,
            y_offset: 0.,
            bog_threshold: 8200.,
            min_duration: 0.2,
            sensitivity: 1.,
            excluded_ids: vec![],
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueFilter {
    pub channel: String,
    pub min: Option<f64>,
    pub max: Option<f64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedResult {
    pub tool: String,
    pub x_unit: String,
    pub y_unit: String,
    pub laps: Vec<AdvancedLap>,
    pub notes: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedLap {
    pub lap_id: String,
    pub points: Vec<Point>,
    pub stats: Statistics,
    pub y_stats: Option<Statistics>,
    pub histogram: Vec<Bin>,
    pub events: Vec<Event>,
    pub excluded_count: usize,
    pub unsupported_count: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub source_time: f64,
    pub position: Option<f64>,
    pub x: f64,
    pub y: f64,
    pub color: Option<f64>,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Statistics {
    pub count: usize,
    pub duration: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub median: Option<f64>,
    pub p05: Option<f64>,
    pub p95: Option<f64>,
    pub absolute_p95: Option<f64>,
}
#[derive(Debug, Serialize)]
pub struct Bin {
    pub low: f64,
    pub high: f64,
    pub value: f64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub lap_id: String,
    pub kind: String,
    pub evidence: String,
    pub source_time: f64,
    pub end_time: f64,
    pub position: Option<f64>,
    pub end_position: Option<f64>,
    pub rpm_before: Option<f64>,
    pub rpm_after: Option<f64>,
    pub rpm_change: Option<f64>,
    pub min_rpm: Option<f64>,
    pub duration: Option<f64>,
    pub recovery_time: Option<f64>,
    pub corner_id: Option<String>,
}
fn acceleration(unit: &str) -> Option<f64> {
    match unit.to_lowercase().as_str() {
        "g" => Some(1.),
        "m/s²" | "m/s2" | "m/s^2" => Some(1. / 9.80665),
        "ft/s²" | "ft/s2" => Some(0.3048 / 9.80665),
        _ => None,
    }
}
// Channels passed to calculations have the shared inferred/explicit gaps prepared by analyze.
fn connected(c: &Channel, a: f64, b: f64) -> bool {
    b >= a && !c.gaps.iter().any(|g| a < g[1] && b > g[0])
}
fn discrete(c: &Channel) -> bool {
    c.name.to_lowercase().contains("gear")
}
fn sample(c: &Channel, t: f64) -> Option<f64> {
    if discrete(c) {
        return held(c, t);
    }
    if c.gaps.iter().any(|g| t > g[0] && t < g[1]) {
        return None;
    }
    let i = c.times.partition_point(|x| *x < t);
    if i < c.times.len() && c.times[i] == t {
        return c.values.get(i).copied().filter(|v| v.is_finite());
    }
    if i == 0 || i >= c.times.len() || !connected(c, c.times[i - 1], c.times[i]) {
        return None;
    }
    let a = *c.values.get(i - 1)?;
    let b = *c.values.get(i)?;
    if !a.is_finite() || !b.is_finite() {
        return None;
    }
    Some(a + (b - a) * (t - c.times[i - 1]) / (c.times[i] - c.times[i - 1]))
}
fn channel<'a>(s: &'a Session, id: Option<&str>) -> Option<&'a Channel> {
    id.and_then(|id| s.channels.iter().find(|c| c.id == id))
}
fn position(a: &Analysis, v: &LapView, l: &Lap, t: f64, axis: &str) -> Option<f64> {
    let relative = t - l.start;
    if a.alignment.method != "spatial" {
        return if axis == "time" { Some(relative) } else { None };
    }
    let i = v.mapping.partition_point(|p| p.time < relative);
    let meters = if i < v.mapping.len() && v.mapping[i].time == relative {
        Some(v.mapping[i].meters)
    } else if i > 0 && i < v.mapping.len() {
        let x = &v.mapping[i - 1];
        let y = &v.mapping[i];
        Some(x.meters + (y.meters - x.meters) * (relative - x.time) / (y.time - x.time))
    } else {
        None
    }?;
    if axis == "distance" {
        return Some(meters);
    }
    let m = &a.primary.mapping;
    let j = m.partition_point(|p| p.meters < meters);
    if j < m.len() && m[j].meters == meters {
        return Some(m[j].time);
    }
    if j == 0 || j == m.len() {
        return None;
    }
    Some(
        m[j - 1].time
            + (m[j].time - m[j - 1].time) * (meters - m[j - 1].meters)
                / (m[j].meters - m[j - 1].meters),
    )
}
fn selected(s: &Session, a: &Analysis, v: &LapView, l: &Lap, r: &AdvancedRequest, t: f64) -> bool {
    if t < l.start || t > l.end {
        return false;
    }
    let p = position(a, v, l, t, &r.axis);
    if let Some([lo, hi]) = r.range {
        if !p.is_some_and(|p| p >= lo && p <= hi) {
            return false;
        }
    }
    if let Some(id) = &r.corner_id {
        let Some(seg) = a.segments.iter().find(|g| &g.id == id) else {
            return false;
        };
        if !p.is_some_and(|p| p >= seg.start && p <= seg.end) {
            return false;
        }
    }
    if let Some(f) = &r.value_filter {
        if !channel(s, Some(&f.channel))
            .and_then(|c| sample(c, t))
            .is_some_and(|x| f.min.is_none_or(|m| x >= m) && f.max.is_none_or(|m| x <= m))
        {
            return false;
        }
    }
    true
}
// Each piece is a linear value interval and its supported duration, not a display-time interval.
fn quantile(pieces: &[(f64, f64, f64)], q: f64) -> Option<f64> {
    let total: f64 = pieces.iter().map(|p| p.2).sum();
    if total <= 0. {
        return None;
    }
    let mut lo = pieces
        .iter()
        .map(|p| p.0.min(p.1))
        .fold(f64::INFINITY, f64::min);
    let mut hi = pieces
        .iter()
        .map(|p| p.0.max(p.1))
        .fold(f64::NEG_INFINITY, f64::max);
    for _ in 0..80 {
        let mid = (lo + hi) / 2.;
        let mass: f64 = pieces
            .iter()
            .map(|&(a, b, w)| {
                let low = a.min(b);
                let high = a.max(b);
                if high == low {
                    if mid >= low {
                        w
                    } else {
                        0.
                    }
                } else {
                    w * ((mid - low) / (high - low)).clamp(0., 1.)
                }
            })
            .sum();
        if mass < q * total {
            lo = mid
        } else {
            hi = mid
        }
    }
    Some((lo + hi) / 2.)
}
fn statistics(values: &[f64], pieces: &[(f64, f64, f64)], weighted: bool) -> Statistics {
    let sample_pieces: Vec<_> = values.iter().map(|&v| (v, v, 1.)).collect();
    let p = if weighted { pieces } else { &sample_pieces };
    let total: f64 = p.iter().map(|p| p.2).sum();
    let abs: Vec<_> = p
        .iter()
        .flat_map(|&(a, b, w)| {
            if a * b < 0. {
                let f = a.abs() / (a.abs() + b.abs());
                vec![(a.abs(), 0., w * f), (0., b.abs(), w * (1. - f))]
            } else {
                vec![(a.abs(), b.abs(), w)]
            }
        })
        .collect();
    Statistics {
        count: values.len(),
        duration: pieces.iter().map(|p| p.2).sum(),
        min: p.iter().map(|p| p.0.min(p.1)).reduce(f64::min),
        max: p.iter().map(|p| p.0.max(p.1)).reduce(f64::max),
        mean: if total > 0. {
            Some(p.iter().map(|p| (p.0 + p.1) * 0.5 * p.2).sum::<f64>() / total)
        } else {
            None
        },
        median: quantile(p, 0.5),
        p05: quantile(p, 0.05),
        p95: quantile(p, 0.95),
        absolute_p95: quantile(&abs, 0.95),
    }
}
// Split source intervals at every filter boundary. Linear interpolation is exact within each piece.
fn pieces(
    s: &Session,
    a: &Analysis,
    v: &LapView,
    l: &Lap,
    r: &AdvancedRequest,
    c: &Channel,
    edges: &[f64],
) -> Vec<(f64, f64, f64)> {
    let mut out = vec![];
    let is_discrete = discrete(c);
    let mut mapping_cuts: Vec<f64> = v.mapping.iter().map(|m| l.start + m.time).collect();
    if a.alignment.method == "spatial" && r.axis == "time" {
        // Reference-time composition bends wherever a primary distance knot is crossed.
        for reference in &a.primary.mapping {
            let j = v.mapping.partition_point(|m| m.meters < reference.meters);
            if j < v.mapping.len() && v.mapping[j].meters == reference.meters {
                mapping_cuts.push(l.start + v.mapping[j].time);
            } else if j > 0 && j < v.mapping.len() {
                let before = &v.mapping[j - 1];
                let after = &v.mapping[j];
                if after.meters > before.meters {
                    mapping_cuts.push(
                        l.start
                            + before.time
                            + (after.time - before.time) * (reference.meters - before.meters)
                                / (after.meters - before.meters),
                    );
                }
            }
        }
    }
    mapping_cuts.sort_by(f64::total_cmp);
    mapping_cuts.dedup();
    for i in 1..c.times.len().min(c.values.len()) {
        let t0 = c.times[i - 1];
        let t1 = c.times[i];
        let y0 = c.values[i - 1];
        let y1 = if is_discrete { y0 } else { c.values[i] };
        if !connected(c, t0, t1)
            || !y0.is_finite()
            || !c.values[i].is_finite()
            || t1 <= l.start
            || t0 >= l.end
        {
            continue;
        }
        let mut cuts = vec![t0.max(l.start), t1.min(l.end)];
        for &edge in edges {
            if y1 != y0 {
                let t = t0 + (edge - y0) / (y1 - y0) * (t1 - t0);
                if t > cuts[0] && t < cuts[1] {
                    cuts.push(t)
                }
            }
        }
        // Both source-to-distance and distance-to-reference-time knots bound linear pieces.
        let mi = mapping_cuts.partition_point(|t| *t <= t0);
        cuts.extend(mapping_cuts[mi..].iter().take_while(|t| **t < t1).copied());
        if let Some(f) = &r.value_filter {
            if let Some(fc) = channel(s, Some(&f.channel)) {
                let fi = fc.times.partition_point(|t| *t <= t0);
                for &t in fc.times[fi..].iter().take_while(|t| **t < t1) {
                    if t > t0 && t < t1 {
                        cuts.push(t)
                    }
                }
            }
        }
        cuts.sort_by(f64::total_cmp);
        cuts.dedup();
        let mut extra = vec![];
        for w in cuts.windows(2) {
            let (u, z) = (w[0], w[1]);
            if let (Some(p), Some(q)) =
                (position(a, v, l, u, &r.axis), position(a, v, l, z, &r.axis))
            {
                let mut bounds = vec![];
                if let Some(b) = r.range {
                    bounds.extend(b)
                }
                if let Some(seg) = r
                    .corner_id
                    .as_ref()
                    .and_then(|id| a.segments.iter().find(|seg| &seg.id == id))
                {
                    bounds.extend([seg.start, seg.end])
                }
                for b in bounds {
                    if q != p {
                        let t = u + (b - p) / (q - p) * (z - u);
                        if t > u && t < z {
                            extra.push(t)
                        }
                    }
                }
            }
            if let Some(f) = &r.value_filter {
                if let Some(fc) = channel(s, Some(&f.channel)) {
                    if let (Some(p), Some(q)) = (sample(fc, u), sample(fc, z)) {
                        for b in [f.min, f.max].into_iter().flatten() {
                            if q != p && !discrete(fc) {
                                let t = u + (b - p) / (q - p) * (z - u);
                                if t > u && t < z {
                                    extra.push(t)
                                }
                            }
                        }
                    }
                }
            }
        }
        cuts.extend(extra);
        cuts.sort_by(f64::total_cmp);
        cuts.dedup();
        for w in cuts.windows(2) {
            if selected(s, a, v, l, r, (w[0] + w[1]) / 2.) {
                let eval = |t: f64| y0 + (y1 - y0) * (t - t0) / (t1 - t0);
                out.push((eval(w[0]), eval(w[1]), w[1] - w[0]))
            }
        }
    }
    out
}
pub fn analyze(s: &Session, a: &Analysis, r: &AdvancedRequest) -> Result<AdvancedResult, String> {
    // Calibration belongs to the accelerometer view, never to arbitrary channels
    // selected later in the shared workspace.
    let mut effective = r.clone();
    if effective.tool != "traction" {
        effective.x_sign = 1.;
        effective.y_sign = 1.;
        effective.x_offset = 0.;
        effective.y_offset = 0.;
    }
    let r = &effective;
    // Compute the shared source outage policy once, never once per interpolation.
    let mut prepared = s.clone();
    for channel in &mut prepared.channels {
        channel.gaps = super::source_gaps(channel);
    }
    let s = &prepared;
    if !matches!(
        r.tool.as_str(),
        "traction" | "scatter" | "histogram" | "shifts" | "bog"
    ) {
        return Err("Unknown advanced tool".into());
    }
    if !matches!(r.weighting.as_str(), "time" | "sample" | "samples") {
        return Err("Choose time or sample weighting".into());
    }
    if [
        r.x_sign,
        r.y_sign,
        r.x_offset,
        r.y_offset,
        r.bog_threshold,
        r.min_duration,
        r.sensitivity,
    ]
    .iter()
    .any(|v| !v.is_finite())
        || r.min_duration < 0.
        || r.bog_threshold <= 0.
        || r.sensitivity <= 0.
        || r.range
            .is_some_and(|b| !b[0].is_finite() || !b[1].is_finite() || b[1] < b[0])
    {
        return Err("Invalid advanced numeric settings".into());
    }
    let mut result = AdvancedResult {
        tool: r.tool.clone(),
        x_unit: String::new(),
        y_unit: String::new(),
        laps: vec![],
        notes: vec![],
    };
    if r.corner_id.is_some() && a.alignment.method != "spatial" {
        result
            .notes
            .push("Physical corner filter requires validated spatial alignment.".into());
        return Ok(result);
    }
    let event_tool = matches!(r.tool.as_str(), "shifts" | "bog");
    let x = if event_tool {
        s.channels
            .iter()
            .find(|c| c.unit.eq_ignore_ascii_case("rpm") || c.name.to_lowercase().contains("rpm"))
    } else {
        channel(
            s,
            if r.tool == "histogram" {
                r.hist_channel.as_deref()
            } else {
                r.x_channel.as_deref()
            },
        )
    };
    let Some(x) = x else {
        result
            .notes
            .push("Select an available source or derived channel.".into());
        return Ok(result);
    };
    let y = if matches!(r.tool.as_str(), "scatter" | "traction") {
        channel(s, r.y_channel.as_deref())
    } else {
        None
    };
    if matches!(r.tool.as_str(), "scatter" | "traction") && y.is_none() {
        result
            .notes
            .push("Select two available numerical channels.".into());
        return Ok(result);
    }
    let (xf, yf) = if r.tool == "traction" {
        let (Some(xf), Some(yf)) = (acceleration(&x.unit), y.and_then(|y| acceleration(&y.unit)))
        else {
            result.notes.push(
                "Traction requires acceleration channels in verified g, m/s² or ft/s² units."
                    .into(),
            );
            return Ok(result);
        };
        result.notes.push("Raw acceleration: mounting orientation and gravity contamination are unverified; offsets are user supplied.".into());
        (xf, yf)
    } else {
        (1., 1.)
    };
    result.x_unit = if r.tool == "traction" {
        "g".into()
    } else {
        x.unit.clone()
    };
    result.y_unit = if r.tool == "traction" {
        "g".into()
    } else {
        y.map(|y| y.unit.clone()).unwrap_or_default()
    };
    let views: Vec<_> = std::iter::once(&a.primary)
        .chain(a.comparison.iter())
        .collect();
    for v in views {
        let Some(l) = s.laps.iter().find(|l| l.id == v.lap_id) else {
            continue;
        };
        let mut points = vec![];
        let mut excluded = 0;
        for (&t, &vx) in x.times.iter().zip(&x.values) {
            if !selected(s, a, v, l, r, t) {
                continue;
            }
            let vy = if let Some(y) = y {
                sample(y, t)
            } else {
                Some(vx)
            };
            if !vx.is_finite() || vy.is_none() {
                excluded += 1;
                continue;
            }
            points.push(Point {
                source_time: t,
                position: position(a, v, l, t, &r.axis),
                x: vx * xf * r.x_sign - r.x_offset,
                y: vy.unwrap() * yf * r.y_sign - r.y_offset,
                color: channel(s, r.color_channel.as_deref()).and_then(|c| sample(c, t)),
            })
        }
        let values: Vec<_> = points.iter().map(|p| p.x).collect();
        let raw = pieces(s, a, v, l, r, x, &[]);
        let transformed: Vec<_> = raw
            .iter()
            .map(|&(p, q, w)| {
                (
                    p * xf * r.x_sign - r.x_offset,
                    q * xf * r.x_sign - r.x_offset,
                    w,
                )
            })
            .collect();
        let stats = statistics(
            &values,
            &transformed,
            r.weighting == "time" && r.tool == "histogram",
        );
        let y_stats =
            y.map(|_| statistics(&points.iter().map(|p| p.y).collect::<Vec<_>>(), &[], false));
        let mut events = if event_tool {
            detect(s, a, v, l, r, x)
        } else {
            vec![]
        };
        let event_count = events.len();
        events.retain(|event| !r.excluded_ids.contains(&event.id));
        let excluded_count = event_count - events.len();
        result.laps.push(AdvancedLap {
            lap_id: l.id.clone(),
            points,
            stats,
            y_stats,
            histogram: vec![],
            events,
            excluded_count,
            unsupported_count: excluded,
        });
    }
    if r.tool == "histogram" {
        let min = result
            .laps
            .iter()
            .filter_map(|l| l.stats.min)
            .reduce(f64::min);
        let max = result
            .laps
            .iter()
            .filter_map(|l| l.stats.max)
            .reduce(f64::max);
        if let (Some(min), Some(max)) = (min, max) {
            let low = if min == max { min - 0.5 } else { min };
            let high = if min == max { max + 0.5 } else { max };
            let count = if let Some(w) = r.bin_width {
                if !w.is_finite() || w <= 0. {
                    return Err("Bin width must be positive".into());
                }
                ((high - low) / w).ceil().clamp(1., 512.) as usize
            } else {
                r.bins.clamp(1, 512)
            };
            let width = r.bin_width.unwrap_or(0.).max((high - low) / count as f64);
            let edges: Vec<_> = (0..=count).map(|i| low + i as f64 * width).collect();
            for output in &mut result.laps {
                let l = s.laps.iter().find(|l| l.id == output.lap_id).unwrap();
                let v = if a.primary.lap_id == l.id {
                    &a.primary
                } else {
                    a.comparison.as_ref().unwrap()
                };
                output.histogram = edges
                    .windows(2)
                    .map(|b| Bin {
                        low: b[0],
                        high: b[1],
                        value: 0.,
                    })
                    .collect();
                if r.weighting == "time" {
                    let scale = xf * r.x_sign;
                    let raw_edges: Vec<_> = if scale != 0. {
                        edges
                            .iter()
                            .map(|edge| (edge + r.x_offset) / scale)
                            .collect()
                    } else {
                        vec![]
                    };
                    for (p, q, w) in pieces(s, a, v, l, r, x, &raw_edges) {
                        let p = p * scale - r.x_offset;
                        let q = q * scale - r.x_offset;
                        let index = ((((p + q) / 2. - low) / width).floor() as isize)
                            .clamp(0, count as isize - 1)
                            as usize;
                        output.histogram[index].value += w
                    }
                } else {
                    for p in &output.points {
                        let index = (((p.x - low) / width).floor() as isize)
                            .clamp(0, count as isize - 1)
                            as usize;
                        output.histogram[index].value += 1.
                    }
                }
            }
        }
    }
    if r.percentage && r.tool == "histogram" {
        for lap in &mut result.laps {
            let total: f64 = lap.histogram.iter().map(|b| b.value).sum();
            if total > 0. {
                for b in &mut lap.histogram {
                    b.value = b.value / total * 100.
                }
            }
        }
    }
    if event_tool {
        result.notes.push("Events are candidates, not mechanical ground truth. Interruption windows are not mechanical shift durations; ratio/gear-count estimates are withheld without validated stable clusters.".into())
    }
    if result.laps.iter().all(|l| l.points.is_empty()) {
        result
            .notes
            .push("No supported samples in this selection.".into())
    }
    Ok(result)
}
#[cfg(test)]
mod event_tests {
    use super::*;
    #[test]
    fn gear_must_be_integer() {
        assert_eq!(gear_value(2.4), None);
        assert_eq!(gear_value(3.), Some(3));
    }
    #[test]
    fn braking_suppresses_candidate() {
        assert!(!moving_accelerating(10., 8., 0.2));
        assert!(moving_accelerating(10., 10.2, 0.2));
    }
}
fn gear_value(v: f64) -> Option<i32> {
    if v.is_finite() && (v - v.round()).abs() < 0.05 && (0.0..=i32::MAX as f64).contains(&v) {
        Some(v.round() as i32)
    } else {
        None
    }
}
fn moving_accelerating(a: f64, b: f64, dt: f64) -> bool {
    a > 3. && b > 3. && dt > 0. && (b - a) / dt >= -0.15
}
fn detect(
    s: &Session,
    a: &Analysis,
    v: &LapView,
    l: &Lap,
    r: &AdvancedRequest,
    rpm: &Channel,
) -> Vec<Event> {
    let gear = s
        .channels
        .iter()
        .find(|c| c.name.to_lowercase().contains("gear"));
    let speed = super::speed(s);
    let throttle = s.channels.iter().find(|c| {
        let n = c.name.to_lowercase();
        n.contains("throttle") && matches!(c.unit.as_str(), "%" | "percent")
    });
    let brake = s.channels.iter().find(|c| {
        c.name.to_lowercase().contains("brake") && matches!(c.unit.as_str(), "%" | "percent")
    });
    let mut events = vec![];
    let mut push = |start: f64,
                    end: f64,
                    kind: &str,
                    evidence: String,
                    before: Option<f64>,
                    after: Option<f64>,
                    minimum: Option<f64>,
                    recovery: Option<f64>| {
        if !selected(s, a, v, l, r, start) {
            return;
        }
        let id = format!("{}:{}:{:.6}", l.id, kind, start);
        let pos = position(a, v, l, start, &r.axis);
        events.push(Event {
            id,
            lap_id: l.id.clone(),
            kind: kind.into(),
            evidence,
            source_time: start,
            end_time: end,
            position: pos,
            end_position: position(a, v, l, end, &r.axis),
            rpm_before: before,
            rpm_after: after,
            rpm_change: before.zip(after).map(|(a, b)| b - a),
            min_rpm: minimum,
            duration: if kind == "low-rpm-recovery"
                || (kind == "inferred-upshift" && recovery.is_some())
            {
                Some(end - start)
            } else {
                None
            },
            recovery_time: recovery,
            corner_id: pos.and_then(|p| {
                a.segments
                    .iter()
                    .find(|seg| p >= seg.start && p <= seg.end)
                    .map(|seg| seg.id.clone())
            }),
        });
    };
    if r.tool == "shifts" {
        if let Some(g) = gear {
            for i in 1..g.times.len().min(g.values.len()) {
                let t = g.times[i];
                if t < l.start || t > l.end {
                    continue;
                }
                let Some(old) = gear_value(g.values[i - 1]) else {
                    continue;
                };
                let Some(new) = gear_value(g.values[i]) else {
                    continue;
                };
                if old == new || !connected(g, g.times[i - 1], t) {
                    continue;
                }
                if !stable_gear_window(g, t - 0.15, t, old)
                    || !stable_gear_window(g, t, t + 0.15, new)
                {
                    continue;
                }
                let calculated = g.name.to_lowercase().contains("calculat")
                    || g.name.to_lowercase().contains("estimat");
                push(t,t,if calculated{"calculated-gear-shift"}else{"measured-shift"},format!("{} {} integer gear transition {old} → {new}; stable for 150 ms either side. Mechanical duration unavailable.",if calculated{"Calculated channel evidence; unverified"}else{"Measured"}, if new > old {"upshift"} else {"downshift"}),sample(rpm,g.times[i-1]),sample(rpm,t),None,None)
            }
            return events;
        }
        // Conservative RPM drops require supported non-braking speed evidence and sustained lower RPM.
        let Some((sc, factor)) = speed else {
            return events;
        };
        let mut last = f64::NEG_INFINITY;
        for i in 1..rpm.times.len().min(rpm.values.len()) {
            let t = rpm.times[i];
            if t < l.start || t > l.end {
                continue;
            }
            let prev = rpm.times[i - 1];
            let (before, after) = (rpm.values[i - 1], rpm.values[i]);
            // An abrupt, sustained ratio rise at moving, nonincreasing speed is only
            // a candidate: clutch slip/wheelspin cannot be verified from these channels.
            if t - last >= 0.4
                && connected(rpm, prev, t)
                && before.is_finite()
                && after.is_finite()
                && after - before >= 350. / r.sensitivity.clamp(0.25, 4.)
            {
                let context = sample(rpm, prev - 0.15)
                    .zip(sample(sc, prev))
                    .zip(sample(sc, t));
                if let Some(((earlier, sa), sb)) = context {
                    let baseline = before / sa;
                    let mut supported = connected(rpm, prev - 0.15, prev)
                        && connected(sc, prev - 0.15, prev)
                        && (earlier - before).abs() < 150.
                        && sa * factor > 3.
                        && sb * factor > 3.
                        && sb <= sa
                        && baseline.is_finite();
                    let end = t + 0.3;
                    let mut boundary = prev;
                    let mut previous_speed = sa;
                    for u in rpm
                        .times
                        .iter()
                        .copied()
                        .filter(|u| *u >= t && *u < end)
                        .chain(std::iter::once(end))
                    {
                        let pair = sample(rpm, u).zip(sample(sc, u));
                        supported &= connected(rpm, boundary, u)
                            && connected(sc, boundary, u)
                            && pair.is_some_and(|(rpm, speed)| {
                                speed * factor > 3.
                                    && speed <= previous_speed
                                    && rpm / speed >= baseline * 1.05
                            })
                            && throttle.is_none_or(|c| sample(c, u).is_some_and(|v| v <= 30.));
                        if let Some((_, speed)) = pair {
                            previous_speed = speed;
                        }
                        boundary = u;
                    }
                    if supported {
                        push(t,end,"inferred-downshift",format!("RPM-inferred downshift candidate; unverified sustained RPM/speed ratio rise at moving nonincreasing speed. {} Clutch slip/wheelspin remain uncertain; no measured gear or mechanical duration.", if throttle.is_some() {"Supported low throttle."} else {"Throttle unavailable."}),Some(before),Some(after),None,None);
                        last = t;
                        continue;
                    }
                }
            }
            if t - last < 0.4
                || !connected(rpm, prev, t)
                || !before.is_finite()
                || !after.is_finite()
                || sample(rpm, prev - 0.15).is_some_and(|earlier| (earlier - before).abs() > 150.)
                || before - after < 350. / r.sensitivity.clamp(0.25, 4.)
            {
                continue;
            }
            let Some((sa, sb)) = sample(sc, prev).zip(sample(sc, t)) else {
                continue;
            };
            if !moving_accelerating(sa * factor, sb * factor, t - prev)
                || brake.and_then(|b| sample(b, t)).is_some_and(|b| b > 5.)
                || throttle.and_then(|c| sample(c, t)).is_some_and(|x| x < 20.)
            {
                continue;
            }
            let Some(later) = sample(rpm, t + 0.15) else {
                continue;
            };
            if later > before - 150. {
                continue;
            }
            let recovery = rpm
                .times
                .iter()
                .copied()
                .skip(i + 1)
                .take_while(|u| *u <= t + 2.)
                .find(|u| sample(rpm, *u).is_some_and(|x| x >= before));
            let mut supported = true;
            let end = recovery.unwrap_or(t + 0.15);
            for j in i + 1..rpm.times.len() {
                if rpm.times[j] > end {
                    break;
                }
                if !connected(rpm, rpm.times[j - 1], rpm.times[j]) || !rpm.values[j].is_finite() {
                    supported = false;
                    break;
                }
            }
            if !supported {
                continue;
            }
            let mut observed_until = t;
            for j in i + 1..rpm.times.len().min(rpm.values.len()) {
                let u = rpm.times[j];
                if u > t + 2.
                    || !connected(rpm, rpm.times[j - 1], u)
                    || !rpm.values[j].is_finite()
                    || rpm.values[j] >= before
                {
                    break;
                }
                observed_until = u;
            }
            let observed_length = recovery.map_or(observed_until - t, |u| u - t);
            let long = observed_length >= 1. / r.sensitivity.clamp(0.25, 4.);
            let evidence = format!("RPM-inferred upshift candidate; unverified RPM interruption with sustained RPM drop and non-braking moving speed; no measured gear or mechanical duration. {}", if long { "Possible missed/long interruption: observed RPM interruption/recovery exceeds sensitivity threshold; not a confirmed missed shift or mechanical duration." } else { "" });
            push(
                t,
                end,
                "inferred-upshift",
                evidence,
                Some(before),
                Some(after),
                None,
                recovery.map(|u| u - t),
            );
            last = t
        }
        return events;
    }
    let Some((sc, factor)) = speed else {
        return events;
    };
    let mut start: Option<(f64, f64)> = None;
    for i in 1..rpm.times.len().min(rpm.values.len()) {
        let (ta, tb) = (rpm.times[i - 1], rpm.times[i]);
        if tb < l.start || ta > l.end {
            start = None;
            continue;
        }
        let (va, vb) = (rpm.values[i - 1], rpm.values[i]);
        let moving = sample(sc, ta)
            .zip(sample(sc, tb))
            .is_some_and(|(a, b)| moving_accelerating(a * factor, b * factor, tb - ta));
        let supported = connected(rpm, ta, tb)
            && va.is_finite()
            && vb.is_finite()
            && moving
            && !brake.and_then(|c| sample(c, tb)).is_some_and(|b| b > 5.)
            && !throttle
                .and_then(|c| sample(c, tb))
                .is_some_and(|b| b < 20.);
        if !supported {
            start = None;
            continue;
        }
        if va >= r.bog_threshold && vb < r.bog_threshold {
            let cross = ta + (r.bog_threshold - va) / (vb - va) * (tb - ta);
            start = Some((cross, vb))
        } else if vb < r.bog_threshold {
            if let Some((_, min)) = &mut start {
                *min = min.min(vb)
            }
        } else if let Some((st, min)) = start.take() {
            let end = ta + (r.bog_threshold - va) / (vb - va) * (tb - ta);
            if end - st >= r.min_duration {
                let throttle_observed = throttle.is_some_and(|c| {
                    sample(c, st).is_some_and(|value| value >= 20.)
                        && sample(c, end).is_some_and(|value| value >= 20.)
                        && !c.gaps.iter().any(|g| st < g[1] && end > g[0])
                        && rpm
                            .times
                            .iter()
                            .copied()
                            .filter(|t| *t > st && *t < end)
                            .all(|t| sample(c, t).is_some_and(|value| value >= 20.))
                });
                let throttle_note = if throttle_observed {
                    "observed supporting throttle samples"
                } else if throttle.is_some() {
                    "throttle samples unavailable or incomplete"
                } else {
                    "throttle unavailable"
                };
                let gear_note = gear
                    .and_then(|c| {
                        held(c, st)
                            .and_then(gear_value)
                            .zip(held(c, end).and_then(gear_value))
                    })
                    .map(|(before, after)| {
                        format!("; supported gear states at entry/recovery {before} → {after}")
                    })
                    .unwrap_or_else(|| "; gear state unavailable".into());
                push(st,end,"low-rpm-recovery",format!("Low-RPM recovery candidate during moving/non-braking conditions; {throttle_note}{gear_note}. No confirmed bogging diagnosis."),sample(rpm,st),Some(r.bog_threshold),Some(min),Some(end-st))
            }
        }
    }
    events
}
fn held(c: &Channel, t: f64) -> Option<f64> {
    if c.gaps.iter().any(|g| t > g[0] && t < g[1]) {
        return None;
    }
    let i = c.times.partition_point(|x| *x <= t);
    if i == 0 {
        return None;
    }
    let j = i - 1;
    if t > c.times[j]
        && (i >= c.times.len()
            || !connected(c, c.times[j], c.times[i])
            || !c.values.get(i).is_some_and(|v| v.is_finite()))
    {
        return None;
    }
    c.values.get(j).copied().filter(|v| v.is_finite())
}
#[cfg(test)]
mod integration_tests {
    use super::*;
    pub(super) fn fixture(values: Vec<f64>) -> (Session, Analysis) {
        let times: Vec<_> = (0..values.len()).map(|i| 100. + i as f64 * 0.1).collect();
        let end = *times.last().unwrap();
        let s = Session {
            merge: None,
            id: "s".into(),
            source: "".into(),
            name: "".into(),
            driver: "".into(),
            track: "".into(),
            recorded_at: "".into(),
            warnings: vec![],
            laps: vec![Lap {
                id: "lap".into(),
                number: 1,
                start: 100.,
                end,
                duration: end - 100.,
                complete: true,
            }],
            channels: vec![
                Channel {
                    id: "rpm".into(),
                    name: "RPM".into(),
                    unit: "rpm".into(),
                    times: times.clone(),
                    values,
                    gaps: vec![],
                },
                Channel {
                    id: "gps-speed".into(),
                    name: "Speed".into(),
                    unit: "m/s".into(),
                    times,
                    values: vec![10.; ((end - 100.) * 10.).round() as usize + 1],
                    gaps: vec![],
                },
            ],
        };
        let a = super::super::analyze(&s, "lap", None, "time", &[]).unwrap();
        (s, a)
    }
    #[test]
    fn source_time_and_clipped_histogram() {
        let (s, a) = fixture(vec![0., 1., 2., 3., 4., 5.]);
        let r = AdvancedRequest {
            tool: "histogram".into(),
            hist_channel: Some("rpm".into()),
            range: Some([0.15, 0.35]),
            bins: 2,
            percentage: false,
            ..Default::default()
        };
        let out = analyze(&s, &a, &r).unwrap();
        let l = &out.laps[0];
        assert!((l.histogram.iter().map(|b| b.value).sum::<f64>() - 0.2).abs() < 1e-9);
        assert_eq!(l.points[0].source_time, 100.2);
        assert!((l.points[0].position.unwrap() - 0.2).abs() < 1e-9);
        assert!((l.stats.mean.unwrap() - 2.5).abs() < 1e-9);
    }
    #[test]
    fn missing_channel_is_explicit() {
        let (s, a) = fixture(vec![1.; 6]);
        let out = analyze(&s, &a, &AdvancedRequest::default()).unwrap();
        assert!(out.laps.is_empty());
        assert!(!out.notes.is_empty());
    }
    #[test]
    fn low_rpm_requires_observed_entry_and_recovery() {
        let (s, a) = fixture(vec![8500., 8300., 8000., 7900., 8000., 8300., 8500.]);
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "bog".into(),
                min_duration: 0.1,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.laps[0].events.len(), 1);
        assert!(out.laps[0].events[0]
            .evidence
            .contains("throttle unavailable"));
        assert!(out.laps[0].events[0].recovery_time.unwrap() > 0.2);
        let (s, a) = fixture(vec![8000.; 7]);
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "bog".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(out.laps[0].events.is_empty());
    }
    #[test]
    fn measured_gear_debounce() {
        let (mut s, _) = fixture(vec![9000.; 12]);
        s.channels.push(Channel {
            id: "gear".into(),
            name: "Gear".into(),
            unit: "".into(),
            times: s.channels[0].times.clone(),
            values: vec![2., 2., 2., 2., 2., 3., 3., 3., 3., 3., 3., 3.],
            gaps: vec![],
        });
        let a = super::super::analyze(&s, "lap", None, "time", &[]).unwrap();
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "shifts".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.laps[0].events.len(), 1);
        assert_eq!(out.laps[0].events[0].kind, "measured-shift");
        assert!(serde_json::to_value(&out.laps[0].events[0]).unwrap()["duration"].is_null());
    }
}
#[cfg(test)]
mod robustness_tests {
    use super::*;
    #[test]
    fn exact_sample_inside_declared_outage_is_missing() {
        let c = Channel {
            id: "x".into(),
            name: "x".into(),
            unit: "".into(),
            times: vec![0., 0.1, 0.2],
            values: vec![1.; 3],
            gaps: vec![[0., 0.2]],
        };
        assert!(sample(&c, 0.1).is_none());
    }
    #[test]
    fn discrete_gear_is_held() {
        let c = Channel {
            id: "g".into(),
            name: "Gear".into(),
            unit: "".into(),
            times: vec![0., 0.1, 0.2],
            values: vec![2., 3., 3.],
            gaps: vec![],
        };
        assert_eq!(held(&c, 0.05), Some(2.));
    }
    #[test]
    fn constant_distribution_is_defined() {
        let s = statistics(&[2., 2.], &[(2., 2., 1.)], true);
        assert_eq!(s.min, Some(2.));
        assert_eq!(s.median, Some(2.));
        assert_eq!(s.absolute_p95, Some(2.));
    }
}
#[cfg(test)]
mod review_regressions {
    use super::integration_tests::fixture;
    use super::*;
    fn histogram() -> AdvancedRequest {
        AdvancedRequest {
            tool: "histogram".into(),
            hist_channel: Some("rpm".into()),
            bins: 2,
            percentage: false,
            ..Default::default()
        }
    }
    #[test]
    fn gear_bounce_is_not_stable_before_or_after() {
        let (mut s, a) = fixture(vec![9000.; 12]);
        s.channels.push(Channel {
            id: "gear".into(),
            name: "Gear".into(),
            unit: "".into(),
            times: (0..12).map(|i| 100. + i as f64 * 0.05).collect(),
            values: vec![2., 2., 2., 2., 3., 2., 3., 3., 3., 3., 3., 3.],
            gaps: vec![],
        });
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "shifts".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(out.laps[0].events.is_empty(), "{:?}", out.laps[0].events);
    }
    #[test]
    fn histogram_offsets_and_reversed_axes_preserve_duration() {
        let (s, a) = fixture((0..12).map(|i| i as f64).collect());
        for sign in [1., -1.] {
            let out = analyze(
                &s,
                &a,
                &AdvancedRequest {
                    x_offset: 5.,
                    x_sign: sign,
                    ..histogram()
                },
            )
            .unwrap();
            for b in &out.laps[0].histogram {
                assert!(
                    (b.value - 0.55).abs() < 1e-9,
                    "sign {sign}: {:?}",
                    out.laps[0].histogram
                )
            }
        }
    }
    #[test]
    fn reference_time_filter_splits_inverse_mapping_knots() {
        let (mut s, mut a) = fixture((0..12).map(|i| i as f64).collect());
        a.alignment.method = "spatial".into();
        a.primary.mapping = vec![
            super::super::MappingPoint {
                time: 0.,
                meters: 0.,
            },
            super::super::MappingPoint {
                time: 0.05,
                meters: 1.,
            },
            super::super::MappingPoint {
                time: 0.1,
                meters: 10.,
            },
            super::super::MappingPoint {
                time: 1.1,
                meters: 110.,
            },
        ];
        let mut lap = s.laps[0].clone();
        lap.id = "comparison".into();
        s.laps.push(lap);
        let mut v = a.primary.clone();
        v.lap_id = "comparison".into();
        v.mapping = vec![
            super::super::MappingPoint {
                time: 0.,
                meters: 0.,
            },
            super::super::MappingPoint {
                time: 0.1,
                meters: 10.,
            },
            super::super::MappingPoint {
                time: 1.1,
                meters: 110.,
            },
        ];
        a.comparison = Some(v);
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                range: Some([0.02, 0.04]),
                ..histogram()
            },
        )
        .unwrap();
        assert!(
            (out.laps[1].stats.duration - 0.004).abs() < 1e-9,
            "{}",
            out.laps[1].stats.duration
        );
    }
    #[test]
    fn gear_histogram_never_occupies_intermediate_values() {
        let (mut s, a) = fixture(vec![2., 2., 2., 4., 4., 4.]);
        s.channels[0].name = "Calculated_Gear".into();
        s.channels[0].unit = "".into();
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                bins: 4,
                ..histogram()
            },
        )
        .unwrap();
        let bins = &out.laps[0].histogram;
        assert_eq!(bins.len(), 4);
        assert!((bins[0].value - 0.3).abs() < 1e-9, "{bins:?}");
        assert_eq!(bins[1].value, 0.);
        assert_eq!(bins[2].value, 0.);
        assert!((bins[3].value - 0.2).abs() < 1e-9);
        assert!((out.laps[0].stats.mean.unwrap() - 2.8).abs() < 1e-9);
    }
    #[test]
    fn scatter_gear_alignment_holds_discrete_source() {
        let (mut s, a) = fixture(vec![1.; 6]);
        let times = s.channels[0].times.clone();
        s.channels.push(Channel {
            id: "gear".into(),
            name: "Gear".into(),
            unit: "".into(),
            times: vec![100., 100.2, 100.4, 100.6, 100.8, 101.],
            values: vec![2., 4., 4., 4., 4., 4.],
            gaps: vec![],
        });
        s.channels[0].times = times;
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "scatter".into(),
                x_channel: Some("rpm".into()),
                y_channel: Some("gear".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.laps[0].points[1].y, 2.);
    }
    #[test]
    fn discrete_alignment_respects_declared_and_invalid_spans() {
        let mut c = Channel {
            id: "gear".into(),
            name: "Gear".into(),
            unit: "".into(),
            times: vec![0., 0.1, 0.2],
            values: vec![2., 3., 4.],
            gaps: vec![[0., 0.2]],
        };
        assert_eq!(sample(&c, 0.1), None);
        c.gaps.clear();
        c.values[1] = f64::NAN;
        assert_eq!(sample(&c, 0.05), None);
    }
    #[test]
    fn inferred_shift_without_recovery_has_no_duration() {
        let (s, a) = fixture(vec![9000., 9000., 8500., 8500., 8500., 8500., 8500., 8500.]);
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "shifts".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.laps[0].events.len(), 1);
        let json = serde_json::to_value(&out.laps[0].events[0]).unwrap();
        assert!(json["duration"].is_null());
    }
    #[test]
    fn bog_evidence_distinguishes_missing_throttle_samples() {
        let (mut s, a) = fixture(vec![8500., 8300., 8000., 7900., 8000., 8300., 8500.]);
        s.channels.push(Channel {
            id: "throttle".into(),
            name: "Throttle".into(),
            unit: "%".into(),
            times: vec![99., 99.1],
            values: vec![80., 80.],
            gaps: vec![],
        });
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                tool: "bog".into(),
                min_duration: 0.1,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.laps[0].events.len(), 1);
        assert!(out.laps[0].events[0]
            .evidence
            .contains("throttle samples unavailable"));
    }
    #[test]
    fn ordinary_slow_cadence_is_not_an_outage() {
        let (mut s, mut a) = fixture((0..12).map(|i| i as f64).collect());
        for t in &mut s.channels[0].times {
            *t = 100. + (*t - 100.) * 20.
        }
        s.laps[0].end = 122.;
        s.laps[0].duration = 22.;
        a.primary.duration = 22.;
        let out = analyze(&s, &a, &histogram()).unwrap();
        assert!((out.laps[0].stats.duration - 22.).abs() < 1e-9);
    }
}
// Held state must match throughout the half-open interval, including its left edge.
// Checking only endpoint gears misses a bounce that returns to the expected state.
fn stable_gear_window(c: &Channel, start: f64, end: f64, expected: i32) -> bool {
    if start >= end
        || held(c, start).and_then(gear_value) != Some(expected)
        || end > c.times.last().copied().unwrap_or(f64::NEG_INFINITY)
    {
        return false;
    }
    c.times
        .windows(2)
        .zip(c.values.windows(2))
        .filter(|(t, _)| t[0] < end && t[1] > start)
        .all(|(t, v)| {
            connected(c, t[0], t[1]) && gear_value(v[0]) == Some(expected) && v[1].is_finite()
        })
}

#[cfg(test)]
mod tool_isolation_tests {
    use super::*;
    #[test]
    fn distribution_ignores_unrelated_y_and_traction_calibration() {
        let (mut s, a) =
            super::integration_tests::fixture(vec![1000., 2000., 3000., 4000., 5000., 6000.]);
        s.channels[1].times = vec![100., 100.1];
        s.channels[1].values = vec![1., 1.];
        let r = AdvancedRequest {
            tool: "histogram".into(),
            hist_channel: Some("rpm".into()),
            y_channel: Some("gps-speed".into()),
            weighting: "samples".into(),
            x_sign: -1.,
            x_offset: 5.,
            ..Default::default()
        };
        let out = analyze(&s, &a, &r).unwrap();
        assert_eq!(
            out.laps[0].stats.count, 6,
            "histogram must not depend on scatter Y support"
        );
        assert_eq!(
            out.laps[0].stats.mean,
            Some(3500.),
            "hidden traction corrections must not change RPM distribution"
        );
    }
}

#[cfg(test)]
mod final_event_tests {
    use super::integration_tests::fixture;
    use super::*;
    fn request() -> AdvancedRequest {
        AdvancedRequest {
            tool: "shifts".into(),
            ..Default::default()
        }
    }
    #[test]
    fn event_exclusion_counts_source_events() {
        let (s, a) = fixture(vec![9000., 9000., 9000., 8400., 8400., 8400., 8400.]);
        let out = analyze(&s, &a, &request()).unwrap();
        let id = out.laps[0].events[0].id.clone();
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                excluded_ids: vec![id],
                ..request()
            },
        )
        .unwrap();
        assert!(out.laps[0].events.is_empty());
        assert_eq!(out.laps[0].excluded_count, 1);
    }
    #[test]
    fn sustained_ratio_rise_is_candidate_only_at_nonincreasing_speed() {
        let (mut s, a) = fixture(vec![7000., 7000., 7000., 7800., 7800., 7800., 7800., 7800.]);
        let out = analyze(&s, &a, &request()).unwrap();
        assert_eq!(out.laps[0].events.len(), 1);
        assert_eq!(out.laps[0].events[0].kind, "inferred-downshift");
        assert!(out.laps[0].events[0].evidence.contains("unverified"));
        s.channels[1].values = (0..8).map(|i| 10. + i as f64).collect();
        assert!(analyze(&s, &a, &request()).unwrap().laps[0]
            .events
            .is_empty());
        s.channels[1].values = vec![10.; 8];
        s.channels[0].values = vec![7000., 7000., 7000., 7800., 7000., 7000., 7000., 7000.];
        assert!(analyze(&s, &a, &request()).unwrap().laps[0]
            .events
            .is_empty());
    }
    #[test]
    fn gear_range_is_not_transmission_count() {
        assert_eq!(gear_value(15.), Some(15));
    }
    #[test]
    fn long_observed_recovery_is_flagged() {
        let mut values = vec![9000.; 3];
        values.extend(vec![8400.; 12]);
        values.extend(vec![9000.; 3]);
        let (s, a) = fixture(values);
        let out = analyze(&s, &a, &request()).unwrap();
        assert!(out.laps[0].events[0]
            .evidence
            .contains("Possible missed/long interruption"));
    }
    #[test]
    fn long_unrecovered_interruption_keeps_duration_unknown_and_sensitivity_applies() {
        let mut values = vec![9000.; 3];
        values.extend(vec![8000.; 16]);
        let (s, a) = fixture(values);
        let out = analyze(&s, &a, &request()).unwrap();
        assert!(out.laps[0].events[0]
            .evidence
            .contains("Possible missed/long interruption"));
        assert!(out.laps[0].events[0].duration.is_none());
        let out = analyze(
            &s,
            &a,
            &AdvancedRequest {
                sensitivity: 0.5,
                ..request()
            },
        )
        .unwrap();
        assert!(!out.laps[0].events[0]
            .evidence
            .contains("Possible missed/long interruption"));
    }
    #[test]
    fn downshift_rejects_outages_and_high_or_missing_throttle() {
        let (mut s, a) = fixture(vec![7000., 7000., 7000., 7800., 7800., 7800., 7800., 7800.]);
        let mut throttle = s.channels[1].clone();
        throttle.id = "throttle".into();
        throttle.name = "Throttle".into();
        throttle.unit = "%".into();
        throttle.values = vec![90.; 8];
        s.channels.push(throttle);
        assert!(analyze(&s, &a, &request()).unwrap().laps[0]
            .events
            .is_empty());
        s.channels[2].values = vec![f64::NAN; 8];
        assert!(analyze(&s, &a, &request()).unwrap().laps[0]
            .events
            .is_empty());
        s.channels.pop();
        s.channels[0].gaps = vec![[100.4, 100.6]];
        assert!(analyze(&s, &a, &request()).unwrap().laps[0]
            .events
            .is_empty());
    }
    #[test]
    fn measured_and_calculated_evidence_names_direction() {
        for calculated in [false, true] {
            for (old, new, direction) in [(2., 3., "upshift"), (3., 2., "downshift")] {
                let (mut s, a) = fixture(vec![9000.; 12]);
                let mut gear = s.channels[0].clone();
                gear.id = "gear".into();
                gear.name = if calculated {
                    "Calculated gear"
                } else {
                    "Gear"
                }
                .into();
                gear.unit = "".into();
                gear.values = vec![old; 5];
                gear.values.extend(vec![new; 7]);
                s.channels.push(gear);
                let out = analyze(&s, &a, &request()).unwrap();
                assert_eq!(out.laps[0].events.len(), 1);
                assert!(out.laps[0].events[0].evidence.contains(direction));
            }
        }
    }
}
