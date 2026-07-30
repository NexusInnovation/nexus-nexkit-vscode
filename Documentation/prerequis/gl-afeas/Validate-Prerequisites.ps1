#!/usr/bin/env pwsh
# Validate-Prerequisites.ps1

param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot

if (-not $SettingsPath) {
    $SettingsPath = Join-Path $projectRoot ".vscode\afeas.local.settings.json"
}

$requirementsPath = Join-Path $scriptRoot "requirements.json"
$requirements = Get-Content -LiteralPath $requirementsPath -Raw | ConvertFrom-Json

$tools = $requirements.prerequisites | ForEach-Object {
    $installCommand = if ($_.install.winget) { $_.install.winget }
                     elseif ($_.install.npm)  { $_.install.npm }
                     else                     { $null }
    @{
        Name           = $_.name
        Command        = $_.command
        VersionCommand = $_.versionCommand
        Required       = [bool]$_.required
        InstallHint    = $_.install.hint
        InstallCommand = $installCommand
    }
}

function Update-ValidationState {
    param([bool]$Validated)

    try {
        $settingsDir = Split-Path -Parent $SettingsPath
        if (-not (Test-Path $settingsDir)) {
            New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
        }

        if (Test-Path $SettingsPath) {
            $settings = Get-Content -LiteralPath $SettingsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($settings -isnot [pscustomobject]) {
                $settings = [pscustomobject]@{}
            }
        }
        else {
            $settings = [pscustomobject]@{}
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

function Test-Tool {
    param($Tool)

    Write-Host "Checking: $($Tool.Name)" -ForegroundColor Magenta
    $found = $null -ne (Get-Command $Tool.Command -ErrorAction SilentlyContinue)
    if ($found) {
        $version = (Invoke-Expression $Tool.VersionCommand 2>$null | Select-Object -First 1)
        Write-Host "  [OK] FOUND (Version: $version)" -ForegroundColor Green
        return $true
    }

    Write-Host "  [ERROR] NOT FOUND" -ForegroundColor Red
    if ($Tool.Required) {
        Write-Host "    [REQUIRED]" -ForegroundColor Red
    }
    else {
        Write-Host "    [OPTIONAL]" -ForegroundColor Yellow
    }

    return $false
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
        $version = (Invoke-Expression $Tool.VersionCommand 2>$null | Select-Object -First 1)
        Write-Host "  [OK] $($Tool.Name) is now available (Version: $version)" -ForegroundColor Green
        return $true
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
    $ok = Test-Tool -Tool $tool
    if (-not $ok) {
        $ok = Try-InstallTool -Tool $tool
    }
    $results[$tool.Name] = $ok
}

Write-Host "`n===========================================" -ForegroundColor Magenta
Write-Host "  SUMMARY" -ForegroundColor Magenta
Write-Host "===========================================`n" -ForegroundColor Magenta

$requiredMissing = $tools | Where-Object { $_.Required -and (-not $results[$_.Name]) }

if ($requiredMissing.Count -eq 0) {
    Update-ValidationState -Validated $true
    Write-Host "[OK] All required prerequisites are installed!" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Update-ValidationState -Validated $false
Write-Host "[ERROR] Missing required prerequisites:" -ForegroundColor Red
foreach ($missing in $requiredMissing) {
    Write-Host "  - $($missing.Name)" -ForegroundColor Red
    Write-Host "    Suggested command: $($missing.InstallHint)" -ForegroundColor Yellow
}
Write-Host ""
exit 1
