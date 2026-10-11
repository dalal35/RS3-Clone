# Native Telemetry Implementation Plan

**Goal:** Implement and verify the user's real-XRK analysis milestone.
**Architecture:** Rust ingestion and numerical engine behind Tauri commands; React session workspace with uPlot and GPS SVG.
**Spec:** ../specs/2026-10-11-telemetry-design.md

## Constraints
- Never modify, copy, stage, or upload data/ telemetry.
- Maximum two workers. Use upstream licensed parsing; no fabricated results.
- Work in the existing repository as requested. Project-local ignored toolchain because Rust is absent.

## Tasks
- [x] Research parser accuracy/license/platform support and select implementation.
- [x] Backend worker: parser adapter, normalized session/channel/lap model, numerical lap preparation, deterministic tests and real-fixture integration tests. Own src-tauri/src/telemetry/ and parser dependencies only.
- [x] Frontend worker: React workspace, uPlot synchronization, GPS map, themes, session/lap/channel controls. Own src/ except shared types.ts and bridge.ts. Test numerical UI helpers before implementation.
- [x] Parent: project tooling, Tauri host/import commands, shared interface, integration and failure handling; run build, tests, native launch and UI validation.
- [x] Independent acceptance review, fix demonstrated blockers, update PROGRESS.md, verify fixture hashes, commit and push verified changes where permitted.

## Review focus
Malformed/truncated XRK must not panic; incomplete laps must not be fastest; absent GPS must not invent a track; differing channel rates must not imply common sample times; unreliable distance must not produce a misleading delta.

## Verification
Rust engine unit and fixture tests; frontend tests and TypeScript production build; native Tauri arm64 bundle and launch; interactive inspection of imported sessions and plots; SHA-256 baseline verification. No baseline tests existed in the empty repository.
