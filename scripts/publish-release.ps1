<#
.SYNOPSIS
    LEGACY: Previously published a release by bumping version, committing to main, tagging, and pushing.

.DESCRIPTION
    This script is retained for historical/emergency purposes.

    Nexkit releases are now handled by semantic-release in CI.
    Prefer merging PRs into `main` / `develop` and letting GitHub Actions publish.

    To prevent accidental manual releases, this script requires explicit opt-in via -AllowLegacyRelease.

.NOTES
  Run from repo root: .\scripts\publish-release.ps1
  Requirements: git, node/npm (recommended)
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$DryRun,

    # Explicit opt-in. Without this switch the script will refuse to run.
    [switch]$AllowLegacyRelease,

    # Optional override if you want to skip commit scanning
    [ValidateSet('patch', 'minor', 'major')]
    [string]$ForceBump
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Warning $Message }
function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }
function Write-Fail([string]$Message) { Write-Error $Message }

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Name"
    }
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    return $raw | ConvertFrom-Json
}

function Get-RepoRoot {
    $root = @((git rev-parse --show-toplevel) 2>$null) -join "`n"
    if (-not $root) { throw 'Not inside a git repository.' }
    return $root.Trim()
}

function Get-CurrentBranch {
    return ((@((git rev-parse --abbrev-ref HEAD) 2>$null) -join "`n").Trim())
}

function Assert-CleanWorkingTree {
    $status = (git status --porcelain)
    if ($status) {
        throw "Working tree is not clean.\n$status"
    }
}

function Warn-IfDirtyWorkingTree {
    $status = (git status --porcelain)
    if ($status) {
        Write-Warn "Working tree is not clean. Proceeding anyway (only version files will be committed)."
        Write-Host $status
    }
}

function Assert-OnMain {
    $branch = Get-CurrentBranch
    if ($branch -ne 'main') {
        throw "You must run this script on the 'main' branch. Current branch: $branch"
    }
}

function Assert-OriginConfigured {
    $origin = @((git remote get-url origin) 2>$null) -join "`n"
    if (-not $origin) {
        throw "Git remote 'origin' is not configured."
    }
}

function Assert-UpToDateWithOrigin {
    git fetch --tags origin | Out-Null

    $aheadBehind = @((git rev-list --left-right --count origin/main...main) 2>$null) -join ' '
    $aheadBehind = $aheadBehind.Trim()
    if (-not $aheadBehind) {
        throw 'Unable to determine ahead/behind status vs origin/main.'
    }

    $parts = $aheadBehind -split '\s+'
    if ($parts.Count -ne 2) {
        throw "Unexpected ahead/behind output: $aheadBehind"
    }

    $behind = [int]$parts[0]
    $ahead = [int]$parts[1]

    if ($behind -gt 0) {
        throw "Local main is behind origin/main by $behind commit(s). Pull/rebase before releasing."
    }

    if ($ahead -gt 0) {
        Write-Warn "Local main is ahead of origin/main by $ahead commit(s). This script will push main before tagging."
    }
}

function Get-PackageVersion([string]$RepoRoot) {
    $pkgPath = Join-Path $RepoRoot 'package.json'
    $pkg = Read-JsonFile $pkgPath
    if (-not $pkg.version) { throw 'package.json does not contain a version field.' }
    return [string]$pkg.version
}

function Parse-SemVer([string]$Version) {
    # Supports: X.Y.Z and optional prerelease/build metadata
    $re = '^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'
    $m = [regex]::Match($Version, $re)
    if (-not $m.Success) { throw "Invalid semantic version: '$Version'" }
    return [pscustomobject]@{
        Major      = [int]$m.Groups['major'].Value
        Minor      = [int]$m.Groups['minor'].Value
        Patch      = [int]$m.Groups['patch'].Value
        Prerelease = if ($m.Groups['prerelease'].Success) { $m.Groups['prerelease'].Value } else { $null }
        Build      = if ($m.Groups['build'].Success) { $m.Groups['build'].Value } else { $null }
    }
}

function Format-SemVer($SemVerObj) {
    $v = "{0}.{1}.{2}" -f $SemVerObj.Major, $SemVerObj.Minor, $SemVerObj.Patch
    if ($SemVerObj.Prerelease) { $v = "$v-$($SemVerObj.Prerelease)" }
    if ($SemVerObj.Build) { $v = "$v+$($SemVerObj.Build)" }
    return $v
}

function Bump-Version([string]$Current, [ValidateSet('patch', 'minor', 'major')]$Bump) {
    $sv = Parse-SemVer $Current

    # When bumping, drop prerelease/build and bump base version.
    $sv.Prerelease = $null
    $sv.Build = $null

    switch ($Bump) {
        'patch' { $sv.Patch += 1 }
        'minor' { $sv.Minor += 1; $sv.Patch = 0 }
        'major' { $sv.Major += 1; $sv.Minor = 0; $sv.Patch = 0 }
    }

    return (Format-SemVer $sv)
}

function Get-LatestReleaseTag {
    # Prefer stable tags vX.Y.Z (exclude prerelease tags from the baseline)
    $tag = @((git describe --tags --abbrev=0 --match "v[0-9]*.[0-9]*.[0-9]*") 2>$null) -join "`n"
    $tag = $tag.Trim()
    if (-not $tag) { return $null }
    return $tag
}

function Infer-BumpFromCommits([string]$SinceTag) {
    if ($ForceBump) { return $ForceBump }

    if (-not $SinceTag) {
        # No tags yet: default to patch.
        return 'patch'
    }

    # Grab subjects + bodies since the last tag
    $log = (git log "$SinceTag..HEAD" --pretty=format:%s`n%b`n----END----) 2>$null
    if (-not $log) {
        # No commits since tag -> patch (still allows a release if needed)
        return 'patch'
    }

    $isMajor = $false
    $isMinor = $false
    $isPatch = $false

    foreach ($line in ($log -split "`n")) {
        $l = $line.Trim()
        if (-not $l) { continue }

        # Breaking change indicators
        if ($l -match 'BREAKING CHANGE|BREAKING-CHANGE') { $isMajor = $true; continue }
        if ($l -match '^[a-zA-Z]+(\([^)]+\))?!:') { $isMajor = $true; continue }

        # Minor
        if ($l -match '^feat(\([^)]+\))?:') { $isMinor = $true; continue }

        # Patch
        if ($l -match '^(fix|perf|revert)(\([^)]+\))?:') { $isPatch = $true; continue }
    }

    if ($isMajor) { return 'major' }
    if ($isMinor) { return 'minor' }
    if ($isPatch) { return 'patch' }

    # If commits don’t follow Conventional Commits, default to patch.
    return 'patch'
}

function Prompt-Choice([string]$CurrentVersion, [string]$SuggestedBump, [string]$SuggestedVersion) {
    Write-Host ''
    Write-Info "Current version: $CurrentVersion"
    Write-Info "Suggested bump:  $SuggestedBump"
    Write-Info "Suggested next:  $SuggestedVersion"
    Write-Host ''
    Write-Host 'Select the release version:'
    Write-Host "  1) Use suggested ($SuggestedVersion)"
    Write-Host "  2) Bump patch  ($(Bump-Version $CurrentVersion 'patch'))"
    Write-Host "  3) Bump minor  ($(Bump-Version $CurrentVersion 'minor'))"
    Write-Host "  4) Bump major  ($(Bump-Version $CurrentVersion 'major'))"
    Write-Host '  5) Enter custom version (SemVer, e.g., 1.2.3 or 1.2.3-beta.1)'

    while ($true) {
        $choice = Read-Host 'Enter choice [1-5]'
        switch ($choice) {
            '1' { return $SuggestedVersion }
            '2' { return (Bump-Version $CurrentVersion 'patch') }
            '3' { return (Bump-Version $CurrentVersion 'minor') }
            '4' { return (Bump-Version $CurrentVersion 'major') }
            '5' {
                $custom = Read-Host 'Enter version'
                $null = Parse-SemVer $custom # validate
                return $custom
            }
            default { Write-Warn 'Invalid choice. Please enter 1-5.' }
        }
    }
}

function Assert-TagDoesNotExist([string]$TagName) {
    # When the tag does not exist, git produces no output and PowerShell returns $null.
    # Avoid calling .Trim() on $null.
    $existing = @((git tag --list $TagName) 2>$null) -join "`n"
    $existing = $existing.Trim()
    if ($existing) {
        throw "Tag already exists: $TagName"
    }
}

function Update-Version([string]$RepoRoot, [string]$NewVersion) {
    $pkgPath = Join-Path $RepoRoot 'package.json'
    $lockPath = Join-Path $RepoRoot 'package-lock.json'

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        # Use npm to update both package.json and package-lock.json consistently.
        # --no-git-tag-version because we handle commit+tag ourselves.
        Write-Info "Updating version via npm to $NewVersion"
        npm version $NewVersion --no-git-tag-version | Out-Null
        return
    }

    Write-Warn 'npm was not found. Falling back to updating package.json only (package-lock.json will not be updated).'
    $pkg = Read-JsonFile $pkgPath
    $pkg.version = $NewVersion
    $pkg | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $pkgPath -Encoding UTF8

    if (Test-Path -LiteralPath $lockPath) {
        Write-Warn 'package-lock.json exists but was not updated (npm not found).'
    }
}

function Get-FilesToCommit([string]$RepoRoot) {
    $files = @('package.json')
    if (Test-Path -LiteralPath (Join-Path $RepoRoot 'package-lock.json')) {
        $files += 'package-lock.json'
    }
    return $files
}

function Commit-VersionBump([string]$NewVersion, [string[]]$Files) {
    foreach ($f in $Files) { git add -- $f | Out-Null }

    $msg = "chore(release): v$NewVersion"
    $staged = (git diff --cached --name-only)
    if (-not $staged) {
        throw 'No changes staged to commit. Did the version update actually modify files?'
    }

    Write-Info "Creating commit: $msg"
    # Commit only the version files even if other changes are already staged.
    git commit -m $msg -- $Files | Out-Null
}

function Create-AnnotatedTag([string]$TagName) {
    Assert-TagDoesNotExist $TagName
    Write-Info "Creating annotated tag: $TagName"
    git tag -a $TagName -m $TagName | Out-Null
}

function Push-Main-And-Tag([string]$TagName) {
    Write-Info 'Pushing main to origin'
    git push origin main | Out-Null

    Write-Info "Pushing tag $TagName to origin"
    git push origin $TagName | Out-Null
}

# --- Main ---

Assert-Command git

if (-not $AllowLegacyRelease) {
    throw "This legacy release script is disabled by default. Releases are now handled by semantic-release in CI.\n\nIf you really need to use this legacy flow, re-run with: .\\scripts\\publish-release.ps1 -AllowLegacyRelease"
}

$repoRoot = Get-RepoRoot
Push-Location $repoRoot
try {
    Assert-OriginConfigured
    Assert-OnMain
    Warn-IfDirtyWorkingTree
    Assert-UpToDateWithOrigin

    $currentVersion = Get-PackageVersion $repoRoot

    $latestTag = Get-LatestReleaseTag
    if ($latestTag) {
        Write-Info "Latest release tag: $latestTag"
    }
    else {
        Write-Warn 'No prior vX.Y.Z tags found; defaulting bump recommendation to patch.'
    }

    $suggestedBump = Infer-BumpFromCommits $latestTag
    $suggestedVersion = Bump-Version $currentVersion $suggestedBump

    $selectedVersion = Prompt-Choice -CurrentVersion $currentVersion -SuggestedBump $suggestedBump -SuggestedVersion $suggestedVersion
    $null = Parse-SemVer $selectedVersion

    $tagName = "v$selectedVersion"
    Assert-TagDoesNotExist $tagName

    Write-Host ''
    Write-Info "Selected version: $selectedVersion"
    Write-Info "Tag to create:     $tagName"
    Write-Host ''

    if ($DryRun) {
        Write-Ok 'DryRun enabled; no changes will be made.'
        return
    }

    if (-not $PSCmdlet.ShouldProcess("version $selectedVersion", 'Update files, commit, tag, and push')) {
        return
    }

    Update-Version -RepoRoot $repoRoot -NewVersion $selectedVersion

    $filesToCommit = Get-FilesToCommit $repoRoot
    Commit-VersionBump -NewVersion $selectedVersion -Files $filesToCommit

    Create-AnnotatedTag -TagName $tagName

    Push-Main-And-Tag -TagName $tagName

    Write-Ok "Release prepared and pushed. GitHub Actions should start for tag $tagName."
}
finally {
    Pop-Location
}
