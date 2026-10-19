//! Deterministic, invented XRK data; no bytes or metadata from private recordings.
//! Header/CHS/LAP/S framing follows the pinned libxrk parser's synthetic unit tests;
//! GPS records follow its documented 56-byte NAV-SOL layout. This intentionally
//! covers a small supported subset, not every logger, decoder or calibration.
use std::{fs, path::Path};

fn header(token: &str, payload: &[u8]) -> Vec<u8> {
    let mut token_bytes = [b' '; 4];
    token_bytes[..token.len()].copy_from_slice(token.as_bytes());
    let checksum = payload
        .iter()
        .fold(0u16, |sum, b| sum.wrapping_add(*b as u16));
    let mut bytes = b"<h".to_vec();
    bytes.extend(token_bytes);
    bytes.extend((payload.len() as i32).to_le_bytes());
    bytes.extend([0, b'>']);
    bytes.extend(payload);
    bytes.push(b'<');
    bytes.extend(token_bytes);
    bytes.extend(checksum.to_le_bytes());
    bytes.push(b'>');
    bytes
}

pub fn recording(second: bool) -> Vec<u8> {
    let mut bytes = vec![];
    for (token, value) in [
        ("RCR", "Synthetic Driver"),
        ("VTY", "Synthetic Parity"),
        ("TMD", "2026-10-14"),
        ("TMT", if second { "12:05:00" } else { "12:00:00" }),
    ] {
        bytes.extend(header(token, format!("{value}\0").as_bytes()));
    }
    let mut track = vec![0; 44];
    track[..15].copy_from_slice(b"Synthetic Track");
    track[36..40].copy_from_slice(&400_000_000i32.to_le_bytes());
    track[40..44].copy_from_slice(&(-860_000_000i32).to_le_bytes()); // S/F at origin
    bytes.extend(header("TRK", &track));
    for (index, name, unit) in [
        (0u16, "RPM", 15),
        (1, "Lateral Acc", 3),
        (2, "Inline Acc", 3),
    ] {
        let mut chs = vec![0; 112];
        chs[..2].copy_from_slice(&index.to_le_bytes());
        chs[12] = unit;
        chs[20] = 6; // float32
        chs[24..27].copy_from_slice(b"SYN");
        chs[32..32 + name.len()].copy_from_slice(name.as_bytes());
        chs[64..68].copy_from_slice(&100_000u32.to_le_bytes());
        chs[72] = 4;
        bytes.extend(header("CHS", &chs));
    }
    // Out lap 0..10s, two complete laps 10..30s and 30..50s, then in lap.
    for (number, duration, end) in [
        (1u16, 10_000u32, 10_000u32),
        (2, 20_000, 30_000),
        (3, 20_000, 50_000),
    ] {
        let mut lap = vec![0; 20];
        lap[2..4].copy_from_slice(&number.to_le_bytes());
        lap[4..8].copy_from_slice(&duration.to_le_bytes());
        lap[16..20].copy_from_slice(&end.to_le_bytes());
        bytes.extend(header("LAP", &lap));
    }
    let mut gps = vec![];
    let latitude = 40f64.to_radians();
    let longitude = (-86f64).to_radians();
    let n = 6_378_137. / (1. - 0.00669437999014 * latitude.sin().powi(2)).sqrt();
    let origin = [
        n * latitude.cos() * longitude.cos(),
        n * latitude.cos() * longitude.sin(),
        n * (1. - 0.00669437999014) * latitude.sin(),
    ];
    let east = [-longitude.sin(), longitude.cos(), 0.];
    let north = [
        -latitude.sin() * longitude.cos(),
        -latitude.sin() * longitude.sin(),
        latitude.cos(),
    ];
    for i in 0..=600 {
        let time = i * 100i32;
        let angle = std::f64::consts::TAU * (time as f64 / 1000. - 10.) / 20.;
        let mut fix = [0u8; 56];
        fix[..4].copy_from_slice(&time.to_le_bytes());
        fix[4..8].copy_from_slice(&(time as u32).to_le_bytes());
        fix[14] = 3;
        fix[15] = 1;
        // Stadium: two 100m straights and two radius-30m hairpins.
        let turn_time = std::f64::consts::PI * 30. / 12.;
        let cycle = 10. + 2. * turn_time;
        let phase = ((time as f64 / 1000. - 10.) / 20.).rem_euclid(1.) * cycle;
        let (x, y, vx, vy) = if phase <= 5. {
            (phase * 20., 0., 20., 0.)
        } else if phase <= 5. + turn_time {
            let a = -std::f64::consts::FRAC_PI_2 + (phase - 5.) * 12. / 30.;
            (
                100. + 30. * a.cos(),
                30. + 30. * a.sin(),
                -12. * a.sin(),
                12. * a.cos(),
            )
        } else if phase <= 10. + turn_time {
            (100. - (phase - 5. - turn_time) * 20., 60., -20., 0.)
        } else {
            let a = std::f64::consts::FRAC_PI_2 + (phase - 10. - turn_time) * 12. / 30.;
            (
                30. * a.cos(),
                30. + 30. * a.sin(),
                -12. * a.sin(),
                12. * a.cos(),
            )
        };
        for axis in 0..3 {
            let position = 100. * (origin[axis] + east[axis] * x + north[axis] * y);
            let velocity = 100. * cycle / 20. * (east[axis] * vx + north[axis] * vy);
            fix[16 + axis * 4..20 + axis * 4]
                .copy_from_slice(&(position.round() as i32).to_le_bytes());
            fix[32 + axis * 4..36 + axis * 4]
                .copy_from_slice(&(velocity.round() as i32).to_le_bytes());
        }
        fix[28..32].copy_from_slice(&60u32.to_le_bytes());
        fix[44..48].copy_from_slice(&10u32.to_le_bytes());
        fix[51] = 12;
        gps.extend(fix);
        let rpm = if second { 7000. } else { 5000. };
        for (index, value) in [
            (0u16, rpm),
            (1, angle.cos() as f32),
            (2, angle.sin() as f32),
        ] {
            bytes.extend(b"(S");
            bytes.extend(time.to_le_bytes());
            bytes.extend(index.to_le_bytes());
            bytes.extend(value.to_le_bytes());
            bytes.push(b')');
        }
    }
    bytes.extend(header("GPS", &gps));
    bytes
}

pub fn write_pair(output: &Path) -> std::io::Result<()> {
    fs::create_dir_all(output)?;
    fs::write(output.join("synthetic-a.xrk"), recording(false))?;
    fs::write(output.join("synthetic-b.xrk"), recording(true))
}
