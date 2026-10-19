# Windows-only development

Keep the published macOS 0.1.3 application and production release workflow intact.
Use the manually dispatched **Windows development** workflow on `windows-latest`:

```sh
git commit -m "Describe the Windows change [skip ci]"
git push origin main
gh workflow run windows-dev.yml --ref main -f suite=runtime
```

The skip marker prevents the unchanged production workflow's macOS push job.
Manual dispatch still runs. Do not dispatch the production release workflow for
Windows development and do not create release tags.

Choose `runtime` for the optimized executable and actual WebView2/IPC/media check
without an installer; `native` for Rust parity, persistence, paths and Media
Foundation; or `browser` for simulated UI regressions. npm and Rust dependencies
are cached. Set `packaging=true` only for packaging changes. Once targeted checks
pass, dispatch `suite=full` once to run the entire hosted Windows validation,
including NSIS inspection and disposable install/update/uninstall. The `ttt-windows`
artifact is a validation build, not a published release.

The runtime harness refuses non-hosted machines and existing application profiles.
It uses invented XRKs and synthetic video, retains real IPC and media assertions,
and removes only its initially absent application profiles. CDP startup failures
and media readiness/errors are reported separately from application feature checks.
Private XRK suites (`test:plots`, `test:advanced` and private native integrations)
remain local; never upload private recordings to obtain hosted coverage.

Hosted validation cannot replace physical Windows 10/11 acceptance of native
dialogs/drop, real monitor DPI changes, standard-user deployment, missing codecs,
network shares, old-version upgrades or large private recordings. See
[existing native evidence](windows-validation.md) for the retained baseline.
