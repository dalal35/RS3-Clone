# RS3-Clone milestone design

Build a local-first Apple Silicon macOS telemetry analyzer from the user's supplied brief. Preserve all data/ fixtures byte-for-byte and never stage or upload them. No AI, device communication, fabricated telemetry, or placeholder controls.

Use Tauri 2, Rust, React/TypeScript and uPlot. Evaluate upstream libxrk and xrk-rs before choosing ingestion; isolate parser from deterministic numerical analysis. Avoid SQLite until persistence requires it. Native imports run off the UI thread and report malformed/unsupported inputs explicitly.

One cohesive workspace: quiet session/lap sidebar, fastest complete lap highlighted; primary and comparison lap selection; speed/RPM and selectable channels in stacked synchronized plots; time/distance toggle; shared zoom/pan/cursor; GPS racing lines and shared position. Default dark graphite theme with cyan/amber lap colors, light theme, compact typography and thin dividers. Empty state explains importing. Missing channels and unreliable alignment remain visibly unavailable.

Raw channel timestamps and values remain unmodified. Interpolate only within valid bounds, preserve differing frequencies, derive distance from valid speed/GPS, and gate lap delta on reliable comparable distance. GPS projection uses a local planar projection. Render data may be reduced, but numerical processing uses full data.

Acceptance: real fixtures import with credible metadata, channels, lap boundaries and GPS; isolated numerical tests and fixture integration checks pass; app builds arm64 and launches; integrated UI interactions work; source hashes unchanged. Parent owns integration and acceptance; at most two workers.
