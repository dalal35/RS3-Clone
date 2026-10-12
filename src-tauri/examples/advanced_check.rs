//! Read-only real-source diagnostic. Output JSON to stdout; callers store only in ignored .tools.
use apex_telemetry::{
    library::Library,
    telemetry::{advanced::AdvancedRequest, expressions::Formula},
};
fn main() -> Result<(), String> {
    let path = std::env::args_os().nth(1).ok_or("Provide XRK path")?;
    let root =
        std::env::temp_dir().join(format!("apex-advanced-diagnostic-{}", std::process::id()));
    let mut lib = Library::open(root.clone())?;
    let s = lib.import(std::path::Path::new(&path))?;
    let mut laps: Vec<_> = s.laps.iter().filter(|l| l.complete).collect();
    laps.sort_by(|a, b| a.duration.total_cmp(&b.duration));
    let primary = &laps[0].id;
    let comparison = laps.get(1).map(|l| l.id.as_str());
    let rpm = s
        .channels
        .iter()
        .find(|c| c.name.to_lowercase().contains("rpm"))
        .ok_or("No RPM")?;
    let speed = s
        .channels
        .iter()
        .find(|c| c.id == "gps-speed")
        .ok_or("No speed")?;
    let accel: Vec<_> = s
        .channels
        .iter()
        .filter(|c| c.unit.eq_ignore_ascii_case("g"))
        .collect();
    let formulas = vec![Formula {
        id: "formula-rpm".into(),
        name: "RPM doubled".into(),
        expression: format!("[{}] * 2", rpm.id),
    }];
    let validation = lib.validate_formulas(&s.id, &formulas)?;
    let channels: Vec<_> = s
        .channels
        .iter()
        .map(|c| c.id.clone())
        .chain(std::iter::once("formula-rpm".into()))
        .collect();
    let analysis =
        lib.analyze_formulas(&s.id, primary, comparison, "distance", &channels, &formulas)?;
    let mut variants = serde_json::Map::new();
    for tool in ["traction", "scatter", "histogram", "shifts", "bog"] {
        let r = AdvancedRequest {
            tool: tool.into(),
            x_channel: Some(if tool == "traction" {
                accel[0].id.clone()
            } else {
                rpm.id.clone()
            }),
            y_channel: Some(if tool == "traction" {
                accel[1].id.clone()
            } else {
                speed.id.clone()
            }),
            hist_channel: Some(rpm.id.clone()),
            ..Default::default()
        };
        variants.insert(
            tool.into(),
            lib.analyze_advanced(&s.id, primary, comparison, "distance", r, &[])?,
        );
    }
    println!("{}",serde_json::to_string(&serde_json::json!({"session":s,"snapshot":lib.snapshot()?,"analysis":analysis,"variants":variants,"validation":validation,"formulas":formulas,"ids":{"rpm":rpm.id,"speed":speed.id,"accelX":accel[0].id,"accelY":accel[1].id}})).map_err(|e|e.to_string())?);
    std::fs::remove_dir_all(root).map_err(|e| e.to_string())?;
    Ok(())
}
