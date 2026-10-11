# Milestone progress — 2026-10-11

## Completed
- Native Apple Silicon macOS app: Tauri 2, Rust, React/TypeScript, uPlot. Original graphite/cyan/amber workspace with dark/light themes.
- Native multi-file picker, Cmd+O and native file-drop handler; local session list, channel discovery, lap selection and fastest complete lap.
- Pinned MIT libxrk core imports both real XRKs: 12 recorded laps and 27 available channels each. Best complete laps: 26.676 s / 26.585 s. Initial/final partial laps excluded from ranking.
- Independent channel timestamps, full-precision speed integration, distance/time axes, two-lap overlays, synchronized zoom/pan/reset/cursor values, projected GPS racing lines and position markers.
- Estimated normalized-distance delta only for complete laps with reliable speed and compatible measured lengths; explicit uncertainty notes.
- Missing samples, invalid GPS fixes, unknown calibration, unsupported channels and malformed files receive guarded calculations or visible notes. Declared channel outages break chart lines and suppress interpolated readouts.

## Verification
- `npm test`: 7 presentation/numerical helper tests pass.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`: 12 numerical unit tests + 2 integration tests pass (both actual XRKs and malformed import).
- `npm run test:plots`: actual XRK-derived plots pass synchronized zoom, shift-pan, reset and live cursor checks in local headless Chrome.
- `npm run build` and `npm run tauri build`: pass; native arm64 app bundle approximately 10.7 MiB.
- Native app launched; picker imported both files; inspected session switching, correct lap times, two-lap overlays, live readouts and synchronized GPS markers, time axis, channel selector and both themes.
- Independent acceptance review: ship after correcting channel-gap interpolation/disclosure.
- Original fixtures remain byte-for-byte unchanged, ignored and untracked:
  - 0361 SHA-256: b46294e5cbf4df0ad946b33c1e3810f141c00afc5b2c0784c3a2a2e5ae6abc38
  - 0362 SHA-256: cd749e4279b6fab0c36e8f43ff7b187614c8e63c37ca8777460d09b9b6390a64

## Limits / next steps
- Delta is an estimate at normalized progress, not exact same-location timing; overlays retain measured distance. Generic channel calibration is parser-backed and validation is scoped to these fixtures; no claim of universal device support.
- Sessions remain in memory; reimport after reopening. No database, AI analysis or device communication.
- Very sparse channels may lack enough intervals to classify outages reliably. GPS outages are disclosed; GPS trace segments may visually connect across them.
- Native file-drop handler is implemented; physical Finder-to-app drop was not exercised. Native picker, real imports and chart/track synchronization were exercised.
- Local app is ad-hoc signed; distribution signing/notarization is outside this milestone. Upstream binrw 0.14.2 emits a future-Rust compatibility warning; current build/tests pass.
- Frontend initial five tests were written before implementation but no red assertion was observed because Vitest was not installed yet. Subsequent gap regression tests completed red-green verification.
- Future optional work: persisted sessions, wider logger/calibration fixtures and more precise spatial lap alignment. Stop at this verified milestone.
