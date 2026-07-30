#!/usr/bin/env pwsh
# Check-Validation.ps1 - Vérifie si les prérequis sont validés

param([string]$SettingsPath)

# $PSScriptRoot est deja le dossier du script : un seul Split-Path suffit pour remonter
# a la racine du projet. Le double Split-Path remontait un niveau trop haut et lisait un
# fichier d'etat different de celui ecrit par Validate-Prerequisites.ps1.
if (-not $SettingsPath) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $SettingsPath = Join-Path (Join-Path $projectRoot ".vscode") "afeas.local.settings.json"
}

$problemMessage = "afeas.local.settings.json: error AFEAS001: Prerequis AFEAS non valides -- lancez la tache 'validate-prerequisites' pour corriger (Ctrl+Shift+P > Executer une tache)."

$validated = $false

try {
    if (Test-Path -LiteralPath $SettingsPath) {
        $settings = Get-Content -LiteralPath $SettingsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        $validated = ($settings -is [pscustomobject]) -and ($settings.'afeas.prerequisites.validated' -eq $true)
    }
}
catch {
    $validated = $false
}

if ($validated) {
    Write-Host "::VALIDATED::true"
    exit 0
}

Write-Host "::VALIDATED::false"
Write-Host $problemMessage
exit 1

