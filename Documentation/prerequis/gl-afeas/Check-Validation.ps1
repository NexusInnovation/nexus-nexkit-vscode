#!/usr/bin/env pwsh
# Check-Validation.ps1 - Vérifie si les prérequis sont validés

param([string]$SettingsPath)

if (-not $SettingsPath) {
    $SettingsPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) ".vscode\afeas.local.settings.json"
}

$problemMessage = "afeas.local.settings.json: error AFEAS001: Prerequis AFEAS non valides -- lancez la tache 'validate-prerequisites' pour corriger (Ctrl+Shift+P > Executer une tache)."

try {
    if (-not (Test-Path $SettingsPath)) {
        Write-Host "::VALIDATED::false"
        Write-Host $problemMessage
        exit 1
    }

    $settings = Get-Content -LiteralPath $SettingsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $validated = $null -ne $settings.'afeas.prerequisites.validated' -and $settings.'afeas.prerequisites.validated' -eq $true
}
catch {
    Write-Host "::VALIDATED::false"
    Write-Host $problemMessage
    exit 1
}

$result = $validated.ToString().ToLower()
Write-Host "::VALIDATED::$result"

if ($validated) {
    exit 0
}
else {
    Write-Host $problemMessage
    exit 1
}

