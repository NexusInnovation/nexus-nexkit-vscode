#!/usr/bin/env pwsh
# Setup-Environment.ps1
# Installs missing prerequisites and records the validation state.
# Called by Nexkit after the user consents to setup.

param(
    [switch]$Interactive = $false,
    [string]$SettingsPath
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot

if (-not $SettingsPath) {
    $SettingsPath = Join-Path (Join-Path $projectRoot ".vscode") "afeas.local.settings.json"
}

Write-Host "`n===========================================" -ForegroundColor Magenta
Write-Host "  Nexkit - Environment Setup" -ForegroundColor Magenta
Write-Host "===========================================`n" -ForegroundColor Magenta

# Delegate to Validate-Prerequisites, which attempts interactive installs when
# -Interactive is set. In non-interactive mode (VS Code extension) it reports
# what is missing and exits non-zero when required tools are absent.
$validateScript = Join-Path $scriptRoot "Validate-Prerequisites.ps1"
& $validateScript -Interactive:$Interactive -SettingsPath $SettingsPath
exit $LASTEXITCODE
