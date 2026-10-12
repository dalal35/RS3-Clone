//! Local read-only channel/cadence and detector diagnostic; never writes telemetry.
use apex_telemetry::telemetry::{
    advanced::{self, AdvancedRequest},
    analyze, parse_session,
};
fn main() -> Result<(), String> {
    for path in std::env::args_os().skip(1) {
        let s = parse_session(std::path::Path::new(&path))?;
        println!("SOURCE {}", s.source);
        for c in &s.channels {
            let mut dt: Vec<_> = c.times.windows(2).map(|w| w[1] - w[0]).collect();
            dt.sort_by(f64::total_cmp);
            println!(
                "{} | {} | {} | n={} cadence={:?} maxGap={:?} explicitGaps={} range={:?}..{:?}",
                c.id,
                c.name,
                c.unit,
                c.values.len(),
                dt.get(dt.len() / 2),
                dt.last(),
                c.gaps.len(),
                c.values
                    .iter()
                    .copied()
                    .filter(|v| v.is_finite())
                    .reduce(f64::min),
                c.values
                    .iter()
                    .copied()
                    .filter(|v| v.is_finite())
                    .reduce(f64::max)
            );
        }
        let mut laps: Vec<_> = s.laps.iter().filter(|l| l.complete).collect();
        laps.sort_by(|a, b| a.duration.total_cmp(&b.duration));
        if let Some(l) = laps.first() {
            let a = analyze(&s, &l.id, laps.get(1).map(|l| l.id.as_str()), "time", &[])?;
            for tool in ["shifts", "bog"] {
                let before = std::time::Instant::now();
                let result = advanced::analyze(
                    &s,
                    &a,
                    &AdvancedRequest {
                        tool: tool.into(),
                        ..Default::default()
                    },
                )?;
                println!(
                    "{} events={:?} elapsed={:?} notes={:?}",
                    tool,
                    result
                        .laps
                        .iter()
                        .map(|l| l.events.len())
                        .collect::<Vec<_>>(),
                    before.elapsed(),
                    result.notes
                );
            }
        }
    }
    Ok(())
}
