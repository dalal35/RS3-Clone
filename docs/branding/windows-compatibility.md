# Windows rebrand compatibility

Ten Tenths Telemetry retains the existing bundle identifier
`com.dalal35.apextelemetry`, executable `apex-telemetry.exe`,
per-user NSIS installation mode, WebView2 bootstrapper configuration, and Windows
window-state implementation. Application data remains under the same Tauri
identifier-based directories. No data migration or source-file modification is
part of this change. The release candidate advances the package version to `0.1.1`; the existing `v0.1.0` tag is preserved.

## Installer identity

Tauri's default NSIS template derives its uninstall registry key and stored
installation-location key from `productName`. Renaming only the product would
prevent recognition of an existing installation. The custom template keeps
these two internal identities stable:

- `Software\Microsoft\Windows\CurrentVersion\Uninstall\Apex Telemetry`
- `Software\<unchanged publisher>\Apex Telemetry`

All visible names, installer metadata, Add/Remove Programs `DisplayName`, and new
shortcut names still use the new `productName`. Existing installations reuse
their stored installation directory, including a legacy `Apex Telemetry`
directory. Fresh installations use the new product-name directory. Keeping the
legacy directory avoids moving an installed executable or duplicating its
installation. The unchanged publisher is derived from the existing bundle ID;
changing it later would also require preserving the location registry identity.

The post-install hook migrates the previous root Start Menu and desktop
shortcuts only when their target matches the installed executable. It does not
create a shortcut when none existed, preserving `/UPDATE` and `/NS` behavior.
Legacy pinned shortcuts are unpinned before migration; users may repin the new
shortcut. Unrelated shortcut targets are left alone. This supports the previous
configuration, which did not set a custom Start Menu folder.

## Upstream source and maintenance

`src-tauri/windows/installer.nsi` is vendored from the official
[Tauri CLI 2.12.2 template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.2/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi),
matching the installed and locked CLI. Its original SHA-256 is
`166f9677d42e81c7f712a1bf80d9d8c089c21d2967d8398474768b5eac14b494`.
Only the two registry-key definitions differ; the upstream MIT license is
preserved alongside it. The regression test reverses those two substitutions
and verifies the original hash, ensuring all other upstream behavior stays
intact. Rebase this template and update the recorded hash when upgrading the
locked CLI. Do not bypass a version mismatch.

Tauri renders custom templates through the same Handlebars renderer, data,
helpers (`or`, `association-description`, `no-escape`), and NSIS escaping as its
built-in template. It also supplies `utils.nsh` and `FileAssociation.nsh` beside
the rendered script. The custom template retains all upstream includes and
placeholders. The hook is included before constants are defined, but its macros
expand at the existing post-install insertion point after those definitions
and shortcut utilities are available.

## Verification and remaining native acceptance

Run `node --test scripts/windows-branding-tests.mjs` for configuration, template
integrity, metadata/upgrade-key use and shortcut-migration checks. These source
checks do not execute NSIS or prove native installer behavior.

**Native Windows build, installer execution, and upgrade validation were not
available on this macOS host.** Before distribution, build on Windows using
`npm run build:windows` and run the existing artifact inspection script. In a
standard-user Windows test account:

1. Install the previous Apex Telemetry package and save sessions, workspace,
   formulas, presets, corner edits, video mappings, theme and sidebar settings.
2. Install the new package over that installation; test interactive, `/P` and
   `/UPDATE` modes, as well as an installation with shortcuts disabled.
3. Confirm the legacy install path is reused and Add/Remove Programs has one
   entry displaying Ten Tenths Telemetry. Confirm shortcuts and executable
   metadata use the new name and the new icon.
4. Reopen the saved state and repeat the installer to confirm idempotence.
5. Verify uninstall with its data-deletion checkbox unselected retains the
   existing application data. The standard opt-in data-removal behavior remains
   upstream behavior; never select it when validating data retention.
6. Verify a fresh installation uses the new directory and branding. Confirm
   unrelated same-name shortcuts are not modified.

No successful Windows installer or upgrade claim is made by the source checks.
