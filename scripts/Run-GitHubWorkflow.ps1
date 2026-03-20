<#
.SYNOPSIS
    Runs a GitHub Actions workflow locally using nektos/act.

.DESCRIPTION
    Wrapper around nektos/act (https://github.com/nektos/act) that runs
    GitHub Actions workflows on your local machine inside Docker containers,
    replicating the GitHub-hosted runner environment.

    The script will:
    - Detect or install act automatically (via winget, chocolatey, or scoop)
    - Validate Docker availability
    - Parse and forward secrets from a .secrets file or environment
    - Run the specified workflow with proper flags

.PARAMETER WorkflowFile
    Path to the GitHub Actions workflow YAML file.
    Defaults to .github/workflows/ci.yml.

.PARAMETER Job
    Run only the specified job within the workflow.

.PARAMETER Event
    GitHub event type to simulate (push, pull_request, workflow_dispatch, etc.).
    Defaults to push.

.PARAMETER SecretsFile
    Path to a file containing secrets in KEY=VALUE format (one per line).
    Lines starting with # are treated as comments.
    Defaults to .secrets in the repository root if it exists.

.PARAMETER EnvFile
    Path to a file containing environment variables in KEY=VALUE format.

.PARAMETER Platform
    Override the runner platform mapping. 
    Defaults to ubuntu-latest=catthehacker/ubuntu:act-latest.

.PARAMETER DryRun
    Parse and display what would be executed without actually running.

.PARAMETER List
    List all jobs in the workflow without running them.

.PARAMETER Verbose
    Enable verbose act output for debugging.

.PARAMETER AdditionalArgs
    Additional arguments to pass directly to act.

.EXAMPLE
    .\Run-GitHubWorkflow.ps1
    Run the default CI workflow (.github/workflows/ci.yml) with push event.

.EXAMPLE
    .\Run-GitHubWorkflow.ps1 -WorkflowFile .github/workflows/ci.yml -Job build-bicep
    Run only the build-bicep job from the CI workflow.

.EXAMPLE
    .\Run-GitHubWorkflow.ps1 -List
    List all jobs defined in the default workflow.

.EXAMPLE
    .\Run-GitHubWorkflow.ps1 -Event workflow_dispatch -SecretsFile .secrets
    Simulate a workflow_dispatch event with secrets from a file.

.EXAMPLE
    .\Run-GitHubWorkflow.ps1 -DryRun
    Show what act command would be executed without running it.

.NOTES
    Prerequisites:
    - Docker Desktop must be installed and running
    - act is installed automatically if not found (requires winget, choco, or scoop)

    Author: Nexus Fusion Team
    Requires: Docker, PowerShell 7+
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$WorkflowFile,

    [Parameter()]
    [string]$Job,

    [Parameter()]
    [ValidateSet('push', 'pull_request', 'workflow_dispatch', 'schedule', 'release')]
    [string]$Event = 'push',

    [Parameter()]
    [string]$SecretsFile,

    [Parameter()]
    [string]$EnvFile,

    [Parameter()]
    [string]$Platform,

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [switch]$List,

    [Parameter()]
    [string[]]$AdditionalArgs
)

$ErrorActionPreference = 'Stop'

#region --- Helpers ---

function Write-StepHeader {
    param([string]$Message)
    Write-Host "`n--- $Message ---" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

#endregion

#region --- Resolve repository root ---

$repoRoot = (Get-Location).Path

Write-Host "Running from repository: $repoRoot" -ForegroundColor White

# Sanity check: we should be inside a git repo
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
    Write-Fail "Could not locate the repository root. Run this script from the repo or its scripts/ directory."
    exit 1
}

#endregion

#region --- Resolve workflow file ---

if ([string]::IsNullOrWhiteSpace($WorkflowFile)) {
    $WorkflowFile = Join-Path $repoRoot '.github' 'workflows' 'ci.yml'
}
else {
    # Support both absolute and relative paths
    if (-not [System.IO.Path]::IsPathRooted($WorkflowFile)) {
        $WorkflowFile = Join-Path $repoRoot $WorkflowFile
    }
}

if (-not (Test-Path $WorkflowFile)) {
    Write-Fail "Workflow file not found: $WorkflowFile"
    exit 1
}

$workflowRelative = [System.IO.Path]::GetRelativePath($repoRoot, $WorkflowFile)
Write-Host "Workflow : $workflowRelative" -ForegroundColor White

#endregion

#region --- Check Docker & act (skip for DryRun) ---

if (-not $DryRun) {

    Write-StepHeader 'Checking Docker'

    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Fail "Docker is not installed or not in PATH."
        Write-Host "  Install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
        exit 1
    }

    # Verify the Docker daemon is responsive
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Docker daemon is not running. Please start Docker Desktop."
            exit 1
        }
        Write-Success 'Docker is running.'
    }
    catch {
        Write-Fail "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    }

    Write-StepHeader 'Checking act'

    function Find-Act {
        $cmd = Get-Command act -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        return $null
    }

    $actPath = Find-Act

    if (-not $actPath) {
        Write-Warn "act is not installed. Attempting automatic installation..."

        $installed = $false

        # Try winget first (most common on Windows)
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Host "  Installing via winget..." -ForegroundColor Gray
            winget install nektos.act --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            # Refresh PATH for current session
            $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $actPath = Find-Act
            if ($actPath) { $installed = $true }
        }

        # Try chocolatey
        if (-not $installed -and (Get-Command choco -ErrorAction SilentlyContinue)) {
            Write-Host "  Installing via chocolatey..." -ForegroundColor Gray
            choco install act-cli -y 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $actPath = Find-Act
            if ($actPath) { $installed = $true }
        }

        # Try scoop
        if (-not $installed -and (Get-Command scoop -ErrorAction SilentlyContinue)) {
            Write-Host "  Installing via scoop..." -ForegroundColor Gray
            scoop install act 2>&1 | Out-Null
            $actPath = Find-Act
            if ($actPath) { $installed = $true }
        }

        if (-not $installed -or -not $actPath) {
            Write-Fail "Could not install act automatically."
            Write-Host "  Install manually: https://nektosact.com/installation/" -ForegroundColor Yellow
            exit 1
        }
    }

    $actVersion = & $actPath --version 2>&1
    Write-Success "act found: $actVersion"

} # end: skip Docker/act checks for DryRun

#endregion

#region --- Build act arguments ---

Write-StepHeader 'Preparing execution'

$actArgs = [System.Collections.Generic.List[string]]::new()

# Event type
$actArgs.Add($Event)

# Workflow file
$actArgs.Add('--workflows')
$actArgs.Add($WorkflowFile)

# Job filter
if (-not [string]::IsNullOrWhiteSpace($Job)) {
    $actArgs.Add('--job')
    $actArgs.Add($Job)
    Write-Host "Job      : $Job" -ForegroundColor White
}

# Platform mapping
if (-not [string]::IsNullOrWhiteSpace($Platform)) {
    $actArgs.Add('--platform')
    $actArgs.Add($Platform)
}
else {
    # Default to a commonly used act image
    $actArgs.Add('--platform')
    $actArgs.Add('ubuntu-latest=catthehacker/ubuntu:act-latest')
}

# Secrets file
if ([string]::IsNullOrWhiteSpace($SecretsFile)) {
    $defaultSecrets = Join-Path $repoRoot '.secrets'
    if (Test-Path $defaultSecrets) {
        $SecretsFile = $defaultSecrets
    }
}

if (-not [string]::IsNullOrWhiteSpace($SecretsFile)) {
    if (-not (Test-Path $SecretsFile)) {
        Write-Fail "Secrets file not found: $SecretsFile"
        exit 1
    }
    $actArgs.Add('--secret-file')
    $actArgs.Add($SecretsFile)
    Write-Host "Secrets  : $([System.IO.Path]::GetRelativePath($repoRoot, $SecretsFile))" -ForegroundColor White
}

# Env file
if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
    if (-not (Test-Path $EnvFile)) {
        Write-Fail "Env file not found: $EnvFile"
        exit 1
    }
    $actArgs.Add('--env-file')
    $actArgs.Add($EnvFile)
    Write-Host "Env file : $([System.IO.Path]::GetRelativePath($repoRoot, $EnvFile))" -ForegroundColor White
}

# Verbose
if ($VerbosePreference -eq 'Continue') {
    $actArgs.Add('--verbose')
}

# List mode
if ($List) {
    $actArgs.Clear()
    $actArgs.Add('--workflows')
    $actArgs.Add($WorkflowFile)
    $actArgs.Add('--list')
}

# Additional user-supplied args
if ($AdditionalArgs) {
    foreach ($arg in $AdditionalArgs) {
        $actArgs.Add($arg)
    }
}

#endregion

#region --- Execute ---

$argsString = ($actArgs | ForEach-Object {
        if ($_ -match '\s') { "`"$_`"" } else { $_ }
    }) -join ' '

Write-Host "Event    : $Event" -ForegroundColor White
Write-Host "Command  : act $argsString" -ForegroundColor Gray

if ($DryRun) {
    Write-Host "`n[DRY RUN] Would execute:" -ForegroundColor Yellow
    Write-Host "  act $argsString" -ForegroundColor White
    exit 0
}

Write-StepHeader 'Running workflow'

Push-Location $repoRoot
try {
    & $actPath @actArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host ''
    Write-Success "Workflow completed successfully."
}
else {
    Write-Host ''
    Write-Fail "Workflow failed with exit code $exitCode."
    exit $exitCode
}

#endregion
