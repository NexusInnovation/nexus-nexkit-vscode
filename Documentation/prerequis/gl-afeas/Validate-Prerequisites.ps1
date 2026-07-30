#!/usr/bin/env pwsh
# Validate-Prerequisites.ps1

param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot

if (-not $SettingsPath) {
    $SettingsPath = Join-Path (Join-Path $projectRoot ".vscode") "afeas.local.settings.json"
}

$requirementsPath = Join-Path $projectRoot "requirements.json"
$requirements = Get-Content -LiteralPath $requirementsPath -Raw | ConvertFrom-Json

$tools = $requirements.prerequisites | ForEach-Object {
    $installCommand = if ($_.install.winget) { $_.install.winget }
    elseif ($_.install.npm) { $_.install.npm }
    else { $null }
    @{
        Name           = $_.name
        Command        = $_.command
        VersionCommand = $_.versionCommand
        Required       = [bool]$_.required
        MinimumVersion = $_.minimumVersion
        InstallHint    = $_.install.hint
        InstallCommand = $installCommand
    }
}

# Extrait le premier groupe numerique pointe d'une chaine de version.
# "v24.3.0" -> 24.3.0 | "git version 2.43.0" -> 2.43.0 | "azure-cli 2.60.0" -> 2.60.0
# Doit rester strictement equivalent a normalize_version (bash).
function Get-NormalizedVersion {
    param([string]$Raw)

    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }

    $match = [regex]::Match($Raw, '\d+(\.\d+)*')
    if (-not $match.Success) { return $null }

    return $match.Value
}

# Compare deux versions composante par composante (les composantes absentes valent 0).
# Une version illisible echoue (fail closed), comme compare_versions (bash).
function Test-VersionAtLeast {
    param([string]$Current, [string]$Minimum)

    $normalizedMinimum = Get-NormalizedVersion $Minimum
    if (-not $normalizedMinimum) { return $true }

    $normalizedCurrent = Get-NormalizedVersion $Current
    if (-not $normalizedCurrent) { return $false }

    $currentParts = $normalizedCurrent.Split('.')
    $minimumParts = $normalizedMinimum.Split('.')
    $length = [Math]::Max($currentParts.Length, $minimumParts.Length)

    for ($i = 0; $i -lt $length; $i++) {
        $currentPart = if ($i -lt $currentParts.Length) { [long]$currentParts[$i] } else { [long]0 }
        $minimumPart = if ($i -lt $minimumParts.Length) { [long]$minimumParts[$i] } else { [long]0 }

        if ($currentPart -gt $minimumPart) { return $true }
        if ($currentPart -lt $minimumPart) { return $false }
    }

    return $true
}

function Get-ToolVersion {
    param($Tool)

    if ([string]::IsNullOrWhiteSpace($Tool.VersionCommand)) { return $null }

    try {
        # NOTE SECURITE : VersionCommand provient de requirements.json et est evalue tel quel.
        return (Invoke-Expression $Tool.VersionCommand 2>$null | Select-Object -First 1)
    }
    catch {
        return $null
    }
}

function Update-ValidationState {
    param([bool]$Validated)

    try {
        $settingsDir = Split-Path -Parent $SettingsPath
        if (-not (Test-Path -LiteralPath $settingsDir)) {
            New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
        }

        $settings = [pscustomobject]@{}
        if (Test-Path -LiteralPath $SettingsPath) {
            try {
                $parsed = Get-Content -LiteralPath $SettingsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                if ($parsed -is [pscustomobject]) {
                    $settings = $parsed
                }
            }
            catch {
                # Fichier illisible : on repart d'un objet vide plutot que de bloquer
                # indefiniment la convergence check -> validate -> check.
                Write-Host "Warning: $SettingsPath is not valid JSON and will be recreated." -ForegroundColor Yellow
            }
        }

        $settings | Add-Member -NotePropertyName "afeas.prerequisites.validated" -NotePropertyValue $Validated -Force
        $settings | Add-Member -NotePropertyName "afeas.prerequisites.validationDate" -NotePropertyValue (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Force
        $settings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $SettingsPath -Encoding UTF8
    }
    catch {
        Write-Host "Warning: unable to update validation state in $SettingsPath" -ForegroundColor Yellow
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Retourne "ok", "outdated" ou "missing".
function Test-Tool {
    param($Tool)

    Write-Host "Checking: $($Tool.Name)" -ForegroundColor Magenta
    $found = $null -ne (Get-Command $Tool.Command -ErrorAction SilentlyContinue)
    if (-not $found) {
        Write-Host "  [ERROR] NOT FOUND" -ForegroundColor Red
        if ($Tool.Required) {
            Write-Host "    [REQUIRED]" -ForegroundColor Red
        }
        else {
            Write-Host "    [OPTIONAL]" -ForegroundColor Yellow
        }

        return "missing"
    }

    $version = Get-ToolVersion -Tool $Tool
    Write-Host "  [OK] FOUND (Version: $version)" -ForegroundColor Green

    if ([string]::IsNullOrWhiteSpace($Tool.MinimumVersion)) {
        return "ok"
    }

    if (Test-VersionAtLeast -Current $version -Minimum $Tool.MinimumVersion) {
        Write-Host "    [OK] Version meets minimum requirement ($($Tool.MinimumVersion))" -ForegroundColor Green
        return "ok"
    }

    if (-not (Get-NormalizedVersion $version)) {
        Write-Host "    [WARN] Unable to read a version number (minimum required: $($Tool.MinimumVersion))" -ForegroundColor Yellow
    }
    else {
        Write-Host "    [WARN] Version is below minimum ($($Tool.MinimumVersion))" -ForegroundColor Yellow
    }

    return "outdated"
}

function Try-InstallTool {
    param($Tool)

    if (-not $Interactive) {
        return $false
    }

    $answer = Read-Host "Install '$($Tool.Name)' now and continue? (Y/N)"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "  Skipped installation for $($Tool.Name)." -ForegroundColor Yellow
        return $false
    }

    if (-not $Tool.InstallCommand) {
        Write-Host "  No automatic installer for $($Tool.Name)." -ForegroundColor Yellow
        Write-Host "  Install manually: $($Tool.InstallHint)" -ForegroundColor Yellow
        return $false
    }

    try {
        Write-Host "  Installing $($Tool.Name)..." -ForegroundColor Cyan
        # NOTE SECURITE : InstallCommand provient de requirements.json et est evalue tel quel.
        # Ce chemin n'est atteignable qu'en mode interactif, apres confirmation explicite.
        Invoke-Expression $Tool.InstallCommand
        Write-Host "  Installation command completed for $($Tool.Name)." -ForegroundColor Green
    }
    catch {
        Write-Host "  Installation failed for $($Tool.Name)." -ForegroundColor Red
        Write-Host "  Suggested command: $($Tool.InstallHint)" -ForegroundColor Yellow
        return $false
    }

    $isNowAvailable = $null -ne (Get-Command $Tool.Command -ErrorAction SilentlyContinue)
    if ($isNowAvailable) {
        $version = Get-ToolVersion -Tool $Tool

        if (Test-VersionAtLeast -Current $version -Minimum $Tool.MinimumVersion) {
            Write-Host "  [OK] $($Tool.Name) is now available (Version: $version)" -ForegroundColor Green
            return $true
        }

        Write-Host "  $($Tool.Name) is installed (Version: $version) but below the minimum ($($Tool.MinimumVersion))." -ForegroundColor Red
        Write-Host "  Suggested command: $($Tool.InstallHint)" -ForegroundColor Yellow
        return $false
    }

    Write-Host "  $($Tool.Name) still not found after install." -ForegroundColor Red
    Write-Host "  Suggested command: $($Tool.InstallHint)" -ForegroundColor Yellow
    return $false
}

Write-Host "`n===========================================" -ForegroundColor Magenta
Write-Host "  AFEAS - Prerequisites Validation" -ForegroundColor Magenta
Write-Host "===========================================`n" -ForegroundColor Magenta

$results = @{}
foreach ($tool in $tools) {
    $status = Test-Tool -Tool $tool
    if ($status -ne "ok") {
        if (Try-InstallTool -Tool $tool) {
            $status = "ok"
        }
    }
    $results[$tool.Name] = $status
}

Write-Host "`n===========================================" -ForegroundColor Magenta
Write-Host "  SUMMARY" -ForegroundColor Magenta
Write-Host "===========================================`n" -ForegroundColor Magenta

$requiredMissing = @($tools | Where-Object { $_.Required -and $results[$_.Name] -eq "missing" })
$requiredOutdated = @($tools | Where-Object { $_.Required -and $results[$_.Name] -eq "outdated" })
$optionalIssues = @($tools | Where-Object { -not $_.Required -and $results[$_.Name] -ne "ok" })

if ($requiredMissing.Count -eq 0 -and $requiredOutdated.Count -eq 0) {
    Update-ValidationState -Validated $true
    Write-Host "[OK] All required prerequisites are installed and up-to-date!" -ForegroundColor Green

    if ($optionalIssues.Count -gt 0) {
        Write-Host ""
        Write-Host "[WARN] Some optional prerequisites are missing or outdated:" -ForegroundColor Yellow
        foreach ($optional in $optionalIssues) {
            Write-Host "  - $($optional.Name)" -ForegroundColor Yellow
        }
    }

    Write-Host ""
    exit 0
}

Update-ValidationState -Validated $false
Write-Host "[ERROR] Missing or outdated required prerequisites:" -ForegroundColor Red
foreach ($missing in $requiredMissing) {
    Write-Host "  [REQUIRED] $($missing.Name)" -ForegroundColor Red
    Write-Host "    Suggested command: $($missing.InstallHint)" -ForegroundColor Yellow
}
foreach ($outdated in $requiredOutdated) {
    Write-Host "  [OUTDATED] $($outdated.Name) (minimum: $($outdated.MinimumVersion))" -ForegroundColor Yellow
    Write-Host "    Suggested command: $($outdated.InstallHint)" -ForegroundColor Yellow
}
Write-Host ""
exit 1
