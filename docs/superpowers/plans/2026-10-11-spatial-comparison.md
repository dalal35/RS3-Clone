# Spatial lap comparison milestone

Goal: Extend the existing native viewer into a local, position-aligned lap comparison tool without redesign, AI, persistence, or telemetry mutation.

Design: Use a common session-local metric frame and a smoothed reference lap trajectory. Project each lap geometrically with ordering and direction constraints; reject unsupported alignment rather than equating lap percentages. Validate start/finish positions before accepting cumulative time delta and verify its endpoint against recorded lap durations. Retain explicitly estimated normalized-distance fallback. Detect approximate corners from smoothed geometric heading changes supported by speed; expose boundary and timing uncertainty rather than claim exactness.

Implementation and acceptance:
- [x] Rust worker: tests first for spatial alignment, differing trajectories, noisy/invalid/missing GPS, start/finish, segmentation and delta endpoints; implement isolated spatial calculations and integrate existing analysis.
- [x] Frontend: add compact segment metrics within current inspector; selecting a map segment or metric row synchronizes plots and marker. Preserve existing zoom/pan/reset and themes; communicate alignment method and units.
- [x] Verify both real sessions locally, frontend tests and real-session interaction checks, Rust suite, web build and native macOS bundle. Exercise native app.
- [x] Independent read-only acceptance review, correct blocking findings, document evidence/limits, verify fixture hashes, commit milestone and stop.

No ground-truth corners or positional accuracy are available in these files. Synthetic cases test known geometry; real-session tests assert invariants and observed quality only. Manual boundary correction is optional if it can preserve numerical validity; ordinary chart zoom remains available.

Background checked: PROJ local tangent-frame definition (https://proj.org/en/stable/operations/conversions/topocentric.html); GPS.gov distinguishes receiver accuracy from satellite signal accuracy (https://www.gps.gov/gps-accuracy). Algorithm thresholds are engineering validity gates, not externally certified accuracy guarantees.
