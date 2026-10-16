//! Validated, bounded CPU conversion; never retains a borrowed native buffer.
use super::{ErrorKind, PixelFormat, Result, VideoAnalysisError};
pub(super) fn convert(
    bytes: &[u8],
    top: usize,
    stride: i32,
    source: (u32, u32),
    rotation: u32,
    output: (u32, u32),
    format: PixelFormat,
) -> Result<Vec<u8>> {
    let bad = || VideoAnalysisError::new(ErrorKind::Decode, "Invalid decoded pixel layout");
    let (width, height) = source;
    let (ow, oh) = output;
    if width == 0
        || height == 0
        || width > 65536
        || height > 65536
        || ow == 0
        || oh == 0
        || ow > 4096
        || oh > 4096
        || ![0, 90, 180, 270].contains(&rotation)
    {
        return Err(bad());
    }
    let (dw, dh) = if rotation == 90 || rotation == 270 {
        (height, width)
    } else {
        source
    };
    if ow > dw || oh > dh || (stride as i64).abs() < width as i64 * 4 {
        return Err(bad());
    }
    let last = top as i128 + stride as i128 * (height - 1) as i128;
    let low = (top as i128).min(last);
    let high = (top as i128).max(last) + width as i128 * 4;
    if low < 0 || high > bytes.len() as i128 {
        return Err(bad());
    }
    let channels = match format {
        PixelFormat::Rgb8 => 3,
        PixelFormat::Gray8 => 1,
    };
    let length = (ow as usize)
        .checked_mul(oh as usize)
        .and_then(|n| n.checked_mul(channels))
        .ok_or_else(bad)?;
    let mut pixels = Vec::new();
    pixels.try_reserve_exact(length).map_err(|_| bad())?;
    let pixel = |x: u32, y: u32| -> [u8; 3] {
        let (sx, sy) = match rotation {
            90 => (y, height - 1 - x),
            180 => (width - 1 - x, height - 1 - y),
            270 => (width - 1 - y, x),
            _ => (x, y),
        };
        let index = (top as i128 + sy as i128 * stride as i128 + sx as i128 * 4) as usize;
        [bytes[index + 2], bytes[index + 1], bytes[index]]
    };
    for y in 0..oh {
        let sy = ((y as f64 + 0.5) * dh as f64 / oh as f64 - 0.5).clamp(0., (dh - 1) as f64);
        let y0 = sy.floor() as u32;
        let y1 = (y0 + 1).min(dh - 1);
        let fy = sy - y0 as f64;
        for x in 0..ow {
            let sx = ((x as f64 + 0.5) * dw as f64 / ow as f64 - 0.5).clamp(0., (dw - 1) as f64);
            let x0 = sx.floor() as u32;
            let x1 = (x0 + 1).min(dw - 1);
            let fx = sx - x0 as f64;
            let (a, b, c, d) = (pixel(x0, y0), pixel(x1, y0), pixel(x0, y1), pixel(x1, y1));
            let mut rgb = [0u8; 3];
            for k in 0..3 {
                rgb[k] = ((a[k] as f64 * (1. - fx) + b[k] as f64 * fx) * (1. - fy)
                    + (c[k] as f64 * (1. - fx) + d[k] as f64 * fx) * fy)
                    .round() as u8;
            }
            match format {
                PixelFormat::Rgb8 => pixels.extend_from_slice(&rgb),
                PixelFormat::Gray8 => pixels.push(
                    ((77 * rgb[0] as u32 + 150 * rgb[1] as u32 + 29 * rgb[2] as u32 + 128) >> 8)
                        as u8,
                ),
            }
        }
    }
    Ok(pixels)
}
#[cfg(test)]
mod tests {
    use super::*;
    const IMAGE: [u8; 16] = [0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0];
    #[test]
    fn bgr_order_and_gray_weights() {
        assert_eq!(
            convert(&IMAGE, 0, 8, (2, 2), 0, (2, 2), PixelFormat::Rgb8).unwrap(),
            [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]
        );
        assert_eq!(
            convert(&IMAGE, 0, 8, (2, 2), 0, (2, 2), PixelFormat::Gray8).unwrap(),
            [77, 149, 29, 255]
        );
    }
    #[test]
    fn padding_and_negative_pitch_use_top_row() {
        let padded = [0, 0, 255, 0, 9, 9, 9, 9, 255, 0, 0, 0, 9, 9, 9, 9];
        assert_eq!(
            convert(&padded, 0, 8, (1, 2), 0, (1, 2), PixelFormat::Rgb8).unwrap(),
            [255, 0, 0, 0, 0, 255]
        );
        assert_eq!(
            convert(&padded, 8, -8, (1, 2), 0, (1, 2), PixelFormat::Rgb8).unwrap(),
            [0, 0, 255, 255, 0, 0]
        );
    }
    #[test]
    fn clockwise_rotations_keep_asymmetric_orientation() {
        for (rotation, want) in [
            (90, vec![0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 255, 0]),
            (180, vec![255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0]),
            (270, vec![0, 255, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255]),
        ] {
            assert_eq!(
                convert(&IMAGE, 0, 8, (2, 2), rotation, (2, 2), PixelFormat::Rgb8).unwrap(),
                want
            );
        }
    }
    #[test]
    fn bilinear_downsample_is_bounded_and_never_upscales() {
        assert_eq!(
            convert(&IMAGE, 0, 8, (2, 2), 0, (1, 1), PixelFormat::Rgb8).unwrap(),
            [128, 128, 128]
        );
        assert!(convert(&IMAGE, 0, 8, (2, 2), 0, (3, 3), PixelFormat::Rgb8).is_err());
    }
    #[test]
    fn malformed_layout_and_truncated_storage_are_rejected() {
        for (top, stride, size, rotation, out) in [
            (0, 3, (2, 2), 0, (2, 2)),
            (0, -8, (2, 2), 0, (2, 2)),
            (0, 8, (0, 2), 0, (1, 2)),
            (0, 8, (2, 2), 45, (2, 2)),
            (usize::MAX, 8, (2, 2), 0, (2, 2)),
            (0, 8, (2, 2), 0, (4097, 1)),
        ] {
            assert!(convert(&IMAGE, top, stride, size, rotation, out, PixelFormat::Rgb8).is_err());
        }
        assert!(convert(&IMAGE[..15], 0, 8, (2, 2), 0, (2, 2), PixelFormat::Rgb8).is_err());
    }
}
