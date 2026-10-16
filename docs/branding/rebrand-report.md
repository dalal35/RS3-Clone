# Ten Tenths Telemetry rebrand delivery — 2026-10-16

![Finished logo](ttt-preview.png)

The application is branded Ten Tenths Telemetry across its shell, browser/window titles, user-facing error messages, Tauri display metadata, installer configuration, release artifact validation, release title and current README. The original repository name, architecture, typography and theme are preserved. The new custom Shared Beam TTT mark was selected from three ImageGen explorations, refined once, and rebuilt as clean editable vector polygons. See [design sources and complete icon inventory](README.md) and [Windows compatibility](windows-compatibility.md).

## Compatibility findings

- Bundle ID remains `com.dalal35.apextelemetry`; version remains `0.1.0`.
- Cargo package/binary `apex-telemetry`, Rust library `apex_telemetry`, frontend package `rs3-clone`, `apex-theme` and `apex-telemetry:session-explorer` remain unchanged.
- Native library access still uses Tauri `app_data_dir()` and `library.json`, with the same schema, backups and source references. No user-data migration is needed. Tests reopen representative legacy workspace JSON and retain formulas, custom channels, corner boundaries, video mappings and extension fields; existing library/merge tests cover full persisted workflows.
- Windows NSIS defaults use product name for registry identity. A version-matched upstream template retains only the two old registry identity values; display names use the new product name. Target-checked hooks migrate old shortcuts. Native Windows installation/upgrade validation is still required.
- macOS upgrade instructions explicitly handle the differently named old/new `.app` bundles while preserving Application Support and recordings.
- `src/styles.css` is byte-for-byte identical to the pre-task snapshot. New branding CSS uses existing tokens and fonts. A short-height brand-row adjustment preserves the original lap-list space at 500px height.
- Existing uncommitted session-explorer and Windows work was preserved. The baseline was saved at `/tmp/ttt-rebrand-baseline`; only intentional branding integration overlaps that work. Recordings, videos and datasets were not edited. No commit, push, tag or publication occurred.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | 257 tests passed across 15 files |
| `npm run test:release` | 22 tests passed, including metadata, icons, theme/storage and Windows template/upgrade identity checks |
| Full `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 123 tests passed; native media access required outside sandbox |
| `npm run test:branding` | Passed at 1440×920, 1024×768, 900×600 and 600×500; legacy theme/sidebar preferences retained |
| `npm run test:sidebar` | Passed 100-session/24-lap navigation and Telemetry/Advanced/Video resizing at 600×500 through 2560×1440 |
| `npm run test:workflow` | Passed |
| `npm run test:canvas` | Passed |
| `npm run test:plots` | Passed with local real-XRK output |
| `npm run test:advanced` | Passed with local real-XRK output |
| `npm run test:video` | Both video workflows passed |
| `npm run build:mac` | Final production TypeScript/Vite build and Apple Silicon app/DMG passed |
| Native video test enumeration | Seven enabled native-video tests; actual suite passed |
| Asset validation | SVG geometry, PNG dimensions, ICO sizes, ICNS structure; rendered actual-size visual inspection |
| Bundle validation | New CFBundleName/DisplayName, retained identifier/version/binary, arm64 Mach-O, matching bundled ICNS, codesign strict verification |
| DMG validation | Integrity verified; read-only mounted image contains Ten Tenths Telemetry.app and Applications link |
| Release staging | Final macOS app archive/DMG and notices/signature/architecture checks passed |
| `git diff --check` and release version check | Passed |
| Lint | No lint command configured; TypeScript checking runs in production build |
| Independent acceptance review | No unresolved material source/design findings; macOS upgrade README finding corrected and re-reviewed |

Initial sandboxed native-media fixture generation failed with AVFoundation errors; the full suite passed with native media access. The sidebar suite initially exposed insufficient lap-list height, fixed by reducing only new branding-row padding at short heights. One intermediate rerun missed a Locate popover; the final complete sidebar run passed. Browser process cleanup was temporarily slow; final commands exited successfully without changing existing browser support code.

## Build outputs

Paths are relative to the repository root:

- App: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Ten Tenths Telemetry.app`
- Requested plain-name installer: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Ten Tenths Telemetry.dmg`
- Automation-compatible installer: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Ten Tenths Telemetry_0.1.0_aarch64.dmg`
- Final staged artifacts and local manifest: `.tools/ttt-rebrand-final/macos/`
- Responsive app screenshots: `.tools/branding/app-{1440,1024,900,600}.png`

The plain-name DMG is a copy of the final versioned DMG; CI continues using version/architecture names. The local staging manifest records the current HEAD revision plus `runId=local`; the artifacts include the uncommitted working tree and are not a tagged release.

## Remaining validation limits

No genuine Windows build, installer execution, upgrade/uninstall retention or Start Menu acceptance was performed on this macOS host. Windows source/configuration is updated and regression-tested, but native acceptance remains outstanding. The version-pinned NSIS template must be rebased when upgrading Tauri CLI. Migrated pinned shortcuts may require repinning.

The macOS app uses the existing ad-hoc signing configuration and is not notarized. No new signing requirements were introduced. Bundle/package inspection and browser UI acceptance passed; an interactive native Finder/Dock/menu launch/upgrade acceptance was not performed against the user's normal library. Historical progress/spec/validation documents retain factual old branding and artifact paths. Internal compatibility names intentionally retain Apex.

## Rebrand file inventory

The obsolete `src-tauri/icons/apex.svg` was removed. All other entries below were added or edited for this task; preexisting unrelated dirty files are excluded.

- `.github/workflows/release.yml`
- `README.md`
- `docs/branding/README.md`
- `docs/branding/preview.html`
- `docs/branding/ttt-exploration.png`
- `docs/branding/ttt-preview.png`
- `docs/branding/ttt-refinement.png`
- `docs/branding/windows-compatibility.md`
- `index.html`
- `package.json`
- `public/brand/favicon.svg`
- `public/brand/ttt-compact.svg`
- `public/brand/ttt-dark.svg`
- `public/brand/ttt-light.svg`
- `public/brand/ttt-primary.svg`
- `scripts/branding-tests.mjs`
- `scripts/generate-brand-assets.mjs`
- `scripts/publish-release.mjs`
- `scripts/release-tests.mjs`
- `scripts/stage-release-artifacts.mjs`
- `scripts/verify-branding.mjs`
- `scripts/verify-release-artifacts.mjs`
- `scripts/windows-branding-tests.mjs`
- `src-tauri/icons/1024x1024.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/16x16.png`
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/64x64.png`
- `src-tauri/icons/apex.svg`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/icon.ico`
- `src-tauri/icons/icon.png`
- `src-tauri/icons/ttt.svg`
- `src-tauri/src/lib.rs`
- `src-tauri/src/library.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.windows.conf.json`
- `src-tauri/tests/fixtures/README.md`
- `src-tauri/tests/persistence.rs`
- `src-tauri/windows/LICENSE-MIT`
- `src-tauri/windows/branding-hooks.nsh`
- `src-tauri/windows/installer.nsi`
- `src/Advanced.tsx`
- `src/App.tsx`
- `src/Brand.tsx`
- `src/SessionSidebar.tsx`
- `src/advancedState.ts`
- `src/branding.css`
- `src/video/state.ts`
- `docs/branding/rebrand-report.md`
