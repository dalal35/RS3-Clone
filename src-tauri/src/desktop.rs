//! Window geometry validation shared by tests; native restoration is Windows-only.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn visible_rect(window: Rect, areas: &[Rect]) -> Option<Rect> {
    let overlap = |area: &Rect| {
        let width = (i64::from(window.x) + i64::from(window.width))
            .min(i64::from(area.x) + i64::from(area.width))
            - i64::from(window.x).max(i64::from(area.x));
        let height = (i64::from(window.y) + i64::from(window.height))
            .min(i64::from(area.y) + i64::from(area.height))
            - i64::from(window.y).max(i64::from(area.y));
        i128::from(width.max(0)) * i128::from(height.max(0))
    };
    let mut areas = areas
        .iter()
        .filter(|area| area.width > 0 && area.height > 0);
    // The caller orders the primary monitor first for disconnected/offscreen restores.
    let mut area = areas.next()?;
    for candidate in areas {
        if overlap(candidate) > overlap(area) {
            area = candidate;
        }
    }
    let width = window.width.clamp(1, area.width);
    let height = window.height.clamp(1, area.height);
    Some(Rect {
        x: i64::from(window.x).clamp(
            i64::from(area.x),
            i64::from(area.x) + i64::from(area.width - width),
        ) as i32,
        y: i64::from(window.y).clamp(
            i64::from(area.y),
            i64::from(area.y) + i64::from(area.height - height),
        ) as i32,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const MAIN: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    #[test]
    fn normal_restored_window_keeps_its_geometry() {
        let window = Rect {
            x: 120,
            y: 50,
            width: 1440,
            height: 920,
        };
        assert_eq!(visible_rect(window, &[MAIN]), Some(window));
    }
    #[test]
    fn disconnected_display_and_oversized_window_fit_current_work_area() {
        assert_eq!(
            visible_rect(
                Rect {
                    x: 5000,
                    y: -2000,
                    width: 3840,
                    height: 2160
                },
                &[MAIN]
            ),
            Some(MAIN)
        );
    }
    #[test]
    fn negative_monitor_coordinates_are_preserved_but_titlebar_is_visible() {
        let left = Rect {
            x: -1280,
            y: 0,
            width: 1280,
            height: 984,
        };
        assert_eq!(
            visible_rect(
                Rect {
                    x: -1200,
                    y: -100,
                    width: 900,
                    height: 700
                },
                &[MAIN, left]
            ),
            Some(Rect {
                x: -1200,
                y: 0,
                width: 900,
                height: 700
            })
        );
    }
    #[test]
    fn partial_sliver_is_moved_fully_onscreen() {
        assert_eq!(
            visible_rect(
                Rect {
                    x: 1900,
                    y: 1000,
                    width: 600,
                    height: 500
                },
                &[MAIN]
            ),
            Some(Rect {
                x: 1320,
                y: 540,
                width: 600,
                height: 500
            })
        );
    }
    #[test]
    fn absent_or_invalid_monitor_geometry_does_not_guess_a_position() {
        assert_eq!(visible_rect(MAIN, &[]), None);
        assert_eq!(visible_rect(MAIN, &[Rect { width: 0, ..MAIN }]), None);
    }
}

#[cfg(windows)]
pub(crate) fn restore(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{Manager, PhysicalPosition, PhysicalSize};
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    // Plugin cache is initialized before application setup. Restore explicitly so
    // geometry correction runs after restoration, instead of racing a ready hook.
    window.restore_state(StateFlags::SIZE | StateFlags::POSITION)?;
    let mut monitors = window.available_monitors()?;
    if let Some(primary) = window.primary_monitor()? {
        monitors.sort_by_key(|monitor| monitor.position() != primary.position());
    }
    let areas: Vec<_> = monitors
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            Rect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            }
        })
        .collect();
    let position = window.outer_position()?;
    let outer = window.outer_size()?;
    let current = Rect {
        x: position.x,
        y: position.y,
        width: outer.width,
        height: outer.height,
    };
    if let Some(fitted) = visible_rect(current, &areas).filter(|rect| *rect != current) {
        let inner = window.inner_size()?;
        let width = fitted
            .width
            .saturating_sub(outer.width.saturating_sub(inner.width))
            .max(1);
        let height = fitted
            .height
            .saturating_sub(outer.height.saturating_sub(inner.height))
            .max(1);
        let scale = window.scale_factor()?;
        // Preserve the configured logical minimum where the work area permits it.
        let configured = app
            .config()
            .app
            .windows
            .iter()
            .find(|config| config.label == window.label());
        window.set_min_size(Some(PhysicalSize::new(
            width.min(
                (configured
                    .and_then(|config| config.min_width)
                    .unwrap_or(0.0)
                    * scale) as u32,
            ),
            height.min(
                (configured
                    .and_then(|config| config.min_height)
                    .unwrap_or(0.0)
                    * scale) as u32,
            ),
        )))?;
        window.set_size(PhysicalSize::new(width, height))?;
        window.set_position(PhysicalPosition::new(fitted.x, fitted.y))?;
    }
    window.restore_state(StateFlags::MAXIMIZED)?;
    Ok(())
}
