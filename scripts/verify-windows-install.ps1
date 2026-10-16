# Hosted-runner packaging smoke only. Never launches the desktop application.
# NSIS /D and _?= must be the final, unquoted command-line arguments.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP) {
    throw 'Installer smoke is restricted to disposable GitHub-hosted Windows runners.'
}
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$release = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/target/x86_64-pc-windows-msvc/release'))
$installers = @(Get-ChildItem -LiteralPath (Join-Path $release 'bundle/nsis') -Filter "*_$($config.version)_x64-setup.exe")
if ($installers.Count -ne 1) { throw 'Expected exactly one current-version Windows installer.' }
$binary = Join-Path $release 'apex-telemetry.exe'
$expectedHash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Apex Telemetry'
$profiles = @([Environment]::GetFolderPath('ApplicationData'), [Environment]::GetFolderPath('LocalApplicationData')) |
    ForEach-Object { Join-Path $_ $config.identifier }
$shortcuts = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('DesktopDirectory')) |
    ForEach-Object { Join-Path $_ "$($config.productName).lnk" }
$legacyShortcuts = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('DesktopDirectory')) |
    ForEach-Object { Join-Path $_ 'Apex Telemetry.lnk' }
$otherUninstallKeys = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Apex Telemetry',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Apex Telemetry',
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($config.productName)",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($config.productName)",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$($config.productName)"
)
foreach ($path in @($uninstallKey) + $otherUninstallKeys + $profiles + $shortcuts + $legacyShortcuts) {
    if (Test-Path -LiteralPath $path) { throw "Refusing runner with existing installation or user data: $path" }
}
# A prior installation can retain its manufacturer key after preserving app data.
$legacyKeys = @(Get-ChildItem 'HKCU:\Software' | ForEach-Object {
    $path = Join-Path $_.PSPath 'Apex Telemetry'
    if (Test-Path -LiteralPath $path) { $path }
})
if ($legacyKeys.Count) { throw 'Refusing runner with existing legacy manufacturer registry keys.' }
$root = Join-Path $env:RUNNER_TEMP ("ttt installer smoke " + [Guid]::NewGuid().ToString('N'))
$install = Join-Path $root 'Ten Tenths Telemetry'
$installedBinary = Join-Path $install 'apex-telemetry.exe'
$marker = [Guid]::NewGuid().ToString('N')
$manufacturerKey = $null
$createdProfiles = @()
New-Item -ItemType Directory -Path $root | Out-Null
function Invoke-Bounded([string]$File, [string]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
    if (-not $process.WaitForExit(300000)) {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
        throw "Installer process exceeded five minutes: $File"
    }
    if ($process.ExitCode -ne 0) { throw "Installer process failed ($($process.ExitCode)): $File" }
}
function Assert-ProfilePreserved {
    foreach ($profile in $profiles) {
        if ((Get-Content -LiteralPath (Join-Path $profile 'ci-preservation-sentinel.txt') -Raw) -cne $marker) {
            throw 'Installer changed disposable application-data sentinel.'
        }
    }
}
function Assert-Installed {
    if ((Get-FileHash -LiteralPath $installedBinary -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Installed executable differs from the native build.'
    }
    $metadata = (Get-Item -LiteralPath $installedBinary).VersionInfo
    if ($metadata.ProductName -ne $config.productName -or
        ($metadata.FileVersion -ne $config.version -and -not $metadata.FileVersion.StartsWith("$($config.version)."))) {
        throw 'Installed executable has wrong product branding or version.'
    }
    $record = Get-ItemProperty -LiteralPath $uninstallKey
    if ($record.DisplayName -ne $config.productName -or $record.DisplayVersion -ne $config.version -or
        $record.InstallLocation.Trim('"') -ne $install) { throw 'Incorrect per-user uninstall metadata.' }
    $notices = @(Get-ChildItem -LiteralPath $install -Recurse -File -Filter 'THIRD_PARTY_NOTICES.md')
    if ($notices.Count -ne 1 -or (Get-FileHash -LiteralPath $notices[0].FullName).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../THIRD_PARTY_NOTICES.md')).Hash) {
        throw 'Installed third-party notices are missing or differ.'
    }
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in $shortcuts) {
            if (-not (Test-Path -LiteralPath $shortcut) -or $shell.CreateShortcut($shortcut).TargetPath -ne $installedBinary) {
                throw "Missing or incorrect branded shortcut: $shortcut"
            }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
    Assert-ProfilePreserved
}
try {
    foreach ($profile in $profiles) {
        New-Item -ItemType Directory -Path $profile | Out-Null
        $createdProfiles += $profile
        [IO.File]::WriteAllText((Join-Path $profile 'ci-preservation-sentinel.txt'), $marker)
    }
    Invoke-Bounded $installers[0].FullName "/S /D=$install"
    Assert-Installed
    $publisher = (Get-ItemProperty -LiteralPath $uninstallKey).Publisher
    if (-not $publisher -or $publisher -match '[\\/]') { throw 'Unexpected installer publisher key.' }
    $manufacturerKey = "HKCU:\Software\$publisher\Apex Telemetry"
    if ((Get-Item -LiteralPath $manufacturerKey).GetValue('') -ne $install) { throw 'Unexpected manufacturer install location.' }
    # Tauri's /UPDATE avoids deleting app data or recreating shortcut preferences.
    Invoke-Bounded $installers[0].FullName "/S /UPDATE /D=$install"
    Assert-Installed
    $uninstaller = Join-Path $root 'smoke-uninstall.exe'
    Copy-Item -LiteralPath (Join-Path $install 'uninstall.exe') -Destination $uninstaller
    Invoke-Bounded $uninstaller "/S _?=$install"
    if (Test-Path -LiteralPath $installedBinary) { throw 'Uninstaller left application executable behind.' }
    if (Test-Path -LiteralPath $uninstallKey) { throw 'Uninstaller left per-user uninstall record behind.' }
    foreach ($shortcut in $shortcuts) {
        if (Test-Path -LiteralPath $shortcut) { throw 'Uninstaller left branded shortcuts behind.' }
    }
    Assert-ProfilePreserved
    Write-Host 'Hosted Windows smoke passed: install, same-version update, executable/notices/metadata/shortcuts, uninstall, app-data retention.'
    Write-Host 'Physical Windows, standard-user permissions, GUI/WebView2 and previous-version upgrade acceptance remain separate.'
} finally {
    # Cleanup is limited to locations that were absent at preflight and owned here.
    # Keep unknown profile contents rather than deleting files this script did not create.
    foreach ($profile in $createdProfiles) {
        $sentinel = Join-Path $profile 'ci-preservation-sentinel.txt'
        if ((Test-Path -LiteralPath $sentinel) -and (Get-Content -LiteralPath $sentinel -Raw) -ceq $marker) {
            Remove-Item -LiteralPath $sentinel
            if (@(Get-ChildItem -LiteralPath $profile -Force).Count -eq 0) { Remove-Item -LiteralPath $profile }
        }
    }
    $recordLocation = if (Test-Path -LiteralPath $uninstallKey) { (Get-Item -LiteralPath $uninstallKey).GetValue('InstallLocation') } else { $null }
    if ($recordLocation -and $recordLocation.Trim('"') -eq $install) {
        Remove-Item -LiteralPath $uninstallKey -Recurse
    }
    if ($manufacturerKey -and (Test-Path -LiteralPath $manufacturerKey) -and
        (Get-Item -LiteralPath $manufacturerKey).GetValue('') -eq $install) {
        Remove-Item -LiteralPath $manufacturerKey -Recurse
    }
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in $shortcuts) {
            if ((Test-Path -LiteralPath $shortcut) -and $shell.CreateShortcut($shortcut).TargetPath -eq $installedBinary) {
                Remove-Item -LiteralPath $shortcut
            }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
    Remove-Item -LiteralPath $root -Recurse -Force
}
