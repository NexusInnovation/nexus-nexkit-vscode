#!/usr/bin/env pwsh
# Setup-Environment.ps1
# Complete environment setup: validates prerequisites, configures git hooks, installs dependencies
# Usage: .\scripts\Setup-Environment.ps1

param(
    [switch]$SkipValidation = $false,
    [switch]$SkipGitHooks = $false,
    [switch]$Verbose = $false,
    # Passe a Validate-Prerequisites.ps1. Doit valoir $false lorsque le script est lance
    # par un outil non interactif (extension VS Code, CI) : sinon Read-Host bloque le processus.
    [switch]$Interactive = $true
)

$ErrorActionPreference = "Stop"

# Color codes for output
$colors = @{
    Success = "Green"
    Error   = "Red"
    Warning = "Yellow"
    Info    = "Cyan"
    Section = "Magenta"
}

function Write-ColorOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [string]$Color = "White",
        [switch]$NoNewLine = $false
    )
    
    if ($NoNewLine) {
        Write-Host $Message -ForegroundColor $Color -NoNewLine
    }
    else {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Write-Section {
    param([string]$Title)
    Write-ColorOutput "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -Color $colors.Section
    Write-ColorOutput "  $Title" -Color $colors.Section
    Write-ColorOutput "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -Color $colors.Section
}

# NOTE : ne pas nommer cette fonction Invoke-Command, ce qui masquerait la cmdlet native
# du meme nom pour tout le script.
function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Description,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command,
        [switch]$ContinueOnError = $false
    )
    
    Write-ColorOutput "→ $Description" -Color $colors.Info
    try {
        & $Command
        Write-ColorOutput "✓ $Description completed" -Color $colors.Success
        return $true
    }
    catch {
        Write-ColorOutput "✗ Failed: $Description" -Color $colors.Error
        Write-ColorOutput "  Error: $_" -Color $colors.Error
        
        if ($ContinueOnError) {
            Write-ColorOutput "  (Continuing...)" -Color $colors.Warning
            return $false
        }
        else {
            throw
        }
    }
}

# Main setup
Write-ColorOutput "`n$([char]0x2705) AFEAS PROJECT - ENVIRONMENT SETUP`n" -Color $colors.Section

$scriptRoot = Split-Path $MyInvocation.MyCommand.Path
$projectRoot = Split-Path $scriptRoot
$localSettingsPath = Join-Path (Join-Path $projectRoot ".vscode") "afeas.local.settings.json"

# Step 1: Validate prerequisites
if (-not $SkipValidation) {
    Write-Section "Step 1: Validating Prerequisites"
    
    $validationScript = Join-Path $scriptRoot "Validate-Prerequisites.ps1"
    & $validationScript -Interactive:$Interactive -SettingsPath $localSettingsPath
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "`n✗ Prerequisites validation failed. Please install missing tools and try again." -Color $colors.Error
        exit 1
    }
}
else {
    Write-Section "Step 1: Skipping Prerequisite Validation"
    Write-ColorOutput "✓ Validation skipped (--SkipValidation flag)" -Color $colors.Info
}

# Step 2: Setup Git Hooks
if (-not $SkipGitHooks) {
    Write-Section "Step 2: Configuring Git Hooks"
    
    $gitHooksScript = Join-Path $scriptRoot "setup-git-hooks.ps1"
    if (Test-Path $gitHooksScript) {
        Invoke-Step -Description "Configure git hooks" -Command {
            & $gitHooksScript
        } -ContinueOnError:$true
    }
    else {
        Write-ColorOutput "⚠ Git hooks script not found at $gitHooksScript (optional)" -Color $colors.Warning
    }
}
else {
    Write-Section "Step 2: Skipping Git Hooks Setup"
    Write-ColorOutput "✓ Git hooks setup skipped (--SkipGitHooks flag)" -Color $colors.Info
}

# Step 3: Install Frontend Dependencies
Write-Section "Step 3: Installing Frontend Dependencies"

Invoke-Step -Description "Install pnpm dependencies (src/frontend)" -Command {
    Push-Location (Join-Path $projectRoot "src/frontend")
    
    Write-ColorOutput "Running: pnpm install" -Color $colors.Info
    & pnpm install
    
    Pop-Location
} -ContinueOnError:$false

# Step 4: Restore Backend Dependencies
Write-Section "Step 4: Restoring Backend Dependencies"

Invoke-Step -Description "Restore .NET dependencies (src/backend)" -Command {
    Push-Location (Join-Path $projectRoot "src/backend")
    
    Write-ColorOutput "Running: dotnet restore" -Color $colors.Info
    & dotnet restore
    
    Pop-Location
} -ContinueOnError:$false

# Step 5: Store setup completion status
Write-Section "Step 5: Storing Setup Status"

$settingsPath = $localSettingsPath
$settingsDir = Split-Path -Parent $settingsPath
if (-not (Test-Path -LiteralPath $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
}

# Read current settings or create empty. Un fichier illisible est remplace plutot que
# de bloquer indefiniment la convergence check -> validate -> check.
$settings = [pscustomobject]@{}
if (Test-Path -LiteralPath $settingsPath) {
    try {
        $parsed = Get-Content -LiteralPath $settingsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($parsed -is [pscustomobject]) {
            $settings = $parsed
        }
    }
    catch {
        Write-ColorOutput "⚠ $settingsPath is not valid JSON and will be recreated." -Color $colors.Warning
    }
}

# Update settings with completion status
$settings | Add-Member -NotePropertyName "afeas.prerequisites.validated" -NotePropertyValue $true -Force
$settings | Add-Member -NotePropertyName "afeas.prerequisites.validationDate" -NotePropertyValue (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Force

# Write settings back
$settings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settingsPath -Encoding UTF8

Write-ColorOutput "✓ Setup status stored in $settingsPath" -Color $colors.Success

# Final summary
Write-Section "Setup Complete!"

Write-ColorOutput "`n✓ Environment is ready to use!`n" -Color $colors.Success
Write-ColorOutput "Next steps:" -Color $colors.Info
Write-ColorOutput "  1. Press F5 to start the full-stack application" -Color $colors.Info
Write-ColorOutput "  2. Frontend: http://localhost:5173" -Color $colors.Info
Write-ColorOutput "  3. Backend API: https://localhost:7260" -Color $colors.Info
Write-ColorOutput "  4. Health check: https://localhost:7260/health" -Color $colors.Info
Write-ColorOutput "`n" -Color $colors.Info

Write-ColorOutput "For more information, see: docs/SETUP.md" -Color $colors.Info
Write-ColorOutput "`n" -Color $colors.Info
