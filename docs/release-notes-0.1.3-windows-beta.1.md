# Ten Tenths Telemetry — Windows beta 0.1.3-windows-beta.1

Windows x64 NSIS installer for Windows 10/11. This prerelease distributes the
verified Windows build of application version **0.1.3**. The Windows beta release
label is **v0.1.3-windows-beta.1**; the embedded application version and original
installer filename remain 0.1.3. Existing release tags and the macOS v0.1.3 release
are preserved.

## Installer and provenance

- Installer: `Ten-Tenths-Telemetry_0.1.3_x64-setup.exe`.
- Build revision: `1773937ba576368442d68bc52f9b2ac5b3d7002d`.
- Required full Windows validation: **PASS**, [Actions run 39297826514](https://github.com/dalal35/Ten-Tenths-Telemetry/actions/runs/39297826514).
- Earlier targeted runtime validation: [Actions run 39296405451](https://github.com/dalal35/Ten-Tenths-Telemetry/actions/runs/39296405451).
- Installer bytes are taken directly from the full run's `ttt-windows` artifact;
  no rebuild, binary modification or installer renaming is performed.
- Attached `manifest.json` records the build revision, run, size and SHA-256;
  `SHA256SUMS` provides download integrity checks. Checksums are not signatures.
- Installer SHA-256: `2fbea5343ab98c24a560b8ddbaaadfb1d93fc365b84c5b0d274ed644b9d9dafd`
  (2,669,459 bytes).

The full hosted Windows validation covers native compilation and tests, frontend
and release/branding checks, browser regressions, NSIS packaging, x64 GUI PE and
product/version metadata inspection, embedded executable and dependency-notice
integrity, actual WebView2 startup/local video playback/runtime functionality, and
disposable installation, same-version update and uninstallation. Hosted runner
evidence does not establish physical Windows 10/11 acceptance.

## Installation

Run the setup executable for your current user. WebView2 is required; setup
downloads its bootstrapper if absent, requiring internet for that step. Windows N
requires Microsoft's Media Feature Pack before launch. Local video compatibility
depends on the installed system codecs. Windows ARM64 and 32-bit builds are not
provided.

## Known limitations

- **Unsigned Windows installer/application.** No Windows signing certificate is
  configured. Windows may display publisher or reputation warnings.
- **Physical Windows 10/11 testing remains unverified**, including standard-user
  desktop acceptance, real file dialogs/drop, native resize/restore, disconnected
  monitors and accessible UNC/network shares.
- **Mixed-DPI and physical monitor transitions remain unverified.** Browser and
  WebView2 DPR emulation are not physical mixed-monitor validation.
- **Large private XRK performance remains unverified**, including peak memory,
  logger/calibration diversity, private-recording numerical parity and long-clip
  cancellation latency. CI uses disposable synthetic recordings.
- Codec/container diversity, MOV variants, HDR/color management, Windows N and
  missing-WebView2/offline bootstrap acceptance remain unverified on physical PCs.
- Previous-version upgrades and uninstall retention with real user profiles remain
  unverified; hosted lifecycle checks use disposable profiles and same-version updates.
- Packaged Windows YouTube availability remains unverified. YouTube downloading
  and automatic visual synchronization are not implemented.

This is a Windows beta, not a claim of complete physical-hardware validation.
