# Ten Tenths Telemetry 0.1.2 — macOS Apple Silicon

This release consolidates all implemented application features into `main`, including the work previously outside the Windows release candidate. Requires Apple Silicon and macOS 13 or later.

- Ten Tenths Telemetry branding and TTT application icons.
- Session explorer with persisted navigation modes, sorting/grouping, compact lap rows and contextual session management. Responsive Telemetry, Advanced and Video layouts, including a narrow-window drawer and 600×500 minimum window.
- Local AiM XRK import, persistent session references and workspaces, safe missing-file relocation and explicit refresh, atomic saves and backup recovery. Original XRKs and videos stay in place.
- Reversible virtual session merging/unmerging with previews, provenance, source-isolated channels and video mappings.
- Synchronized telemetry plots, GPS track maps, lap comparisons, spatial alignment, corner/straight analysis and editable section boundaries.
- Dedicated Advanced workspace: G-G traction, scatter plots, distributions, shift analysis, RPM recovery, unit-checked math channels and saved presets.
- Local MP4/MOV playback, manual synchronization anchors and edited video segments, bidirectional telemetry/video seeking and persisted mappings. Native AVFoundation frame decoding supports future analysis.
- Existing Windows code, compatibility keys and future cross-platform automation are preserved. This release contains macOS assets only.

## Installation and compatibility

Download the Apple Silicon DMG or app archive. Drag Ten Tenths Telemetry into Applications. The existing `com.dalal35.apextelemetry` identity preserves the local library; do not delete Application Support or your original recordings. When upgrading from Apex Telemetry, quit it and remove only the old app bundle to avoid keeping two app versions.

The app is ad-hoc signed, without Developer ID signing or Apple notarization. Gatekeeper may require System Settings → Privacy & Security → Open Anyway. No development tools are required to run it. SHA256SUMS accompanies the installers.

## Known limitations

- YouTube playback has a known packaged macOS error 153; use local footage. Video downloading and automatic visual synchronization have never been implemented.
- Local video support depends on system codecs. Automatic corner and shift interpretation has the uncertainty/evidence limits shown in the UI.
- Session references use absolute paths; moving recordings requires Locate. No automatic updater or simultaneous multi-process editing guarantee.
- Windows compilation, installer work and physical Windows acceptance are outside this release.

See the checked-in macOS validation record for test and packaged-application acceptance evidence.

The earlier v0.1.1 tag is preserved as an unpublished validation attempt. Its hosted sidebar check sampled an in-progress resize; bounded geometry convergence now replaces that fixed-delay assertion, with the same layout tolerances.
