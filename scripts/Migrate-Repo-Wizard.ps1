#requires -Version 5.1
<#
.SYNOPSIS
    Interactive, one-file wizard that migrates a single repository from npm to pnpm.
    Run it inside (or point it at) a repo and answer the prompts.

.DESCRIPTION
    Strictly interactive. It scans the project, explains what it found in plain language,
    and asks before each action:
      1. Confirm which project to migrate.
      2. Auto-fix the safe npm references (one "apply all" prompt, with a preview).
      3. Convert an npm lockfile to pnpm's, and remove the npm one.
      4. Add git guardrails to this repo.
      5. Walk you through anything that needs a human decision.

    All the scanning/rewriting/hook logic is embedded, so you can ship just this file.

    Run:
        powershell -ExecutionPolicy Bypass -File .\Migrate-Repo-Wizard.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ===========================================================================
#  Look & feel helpers
# ===========================================================================
function Write-Banner {
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "  │           pnpm migration wizard  ·  one repo             │" -ForegroundColor Cyan
    Write-Host "  │   I'll scan this project, fix what's safe, and walk you   │" -ForegroundColor Cyan
    Write-Host "  │        through the rest. Nothing changes until you say.   │" -ForegroundColor Cyan
    Write-Host "  └──────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
    Write-Host ""
}
function Show-Step {
    param([int] $Number, [int] $Total, [string] $Title, [string[]] $Why)
    Write-Host ""
    Write-Host "──────────────────────────────────────────────────────────────" -ForegroundColor DarkCyan
    Write-Host (" Step {0} of {1}:  {2}" -f $Number, $Total, $Title) -ForegroundColor White
    Write-Host "──────────────────────────────────────────────────────────────" -ForegroundColor DarkCyan
    foreach ($line in $Why) { Write-Host "   $line" -ForegroundColor Gray }
    Write-Host ""
}
function Read-YesNo {
    param([string] $Question, [bool] $Default = $true)
    $hint = if ($Default) { '[Y/n]' } else { '[y/N]' }
    while ($true) {
        $answer = Read-Host "   $Question $hint"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
        switch -Regex ($answer.Trim()) {
            '^(y|yes)$' { return $true }
            '^(n|no)$'  { return $false }
            default     { Write-Host "   Please type y or n." -ForegroundColor DarkYellow }
        }
    }
}
function Write-Ok   { param([string] $m) Write-Host "   [OK]   $m" -ForegroundColor Green }
function Write-Skip { param([string] $m) Write-Host "   [skip] $m" -ForegroundColor DarkGray }
function Write-Warn { param([string] $m) Write-Host "   [!]    $m" -ForegroundColor Yellow }

# ===========================================================================
#  Embedded git hooks (for the per-repo install step)
# ===========================================================================
$PreCommitHook = @'
#!/bin/sh
blocked=""
for f in $(git diff --cached --name-only --diff-filter=ACMR); do
    case "$(basename "$f")" in
        package-lock.json|npm-shrinkwrap.json) blocked="$blocked  $f\n" ;;
    esac
done
if [ -n "$blocked" ]; then
    printf '\n\033[31m✖ pnpm policy: npm lockfiles must not be committed.\033[0m\n' >&2
    printf "$blocked" >&2
    printf '\nFix: git rm --cached package-lock.json npm-shrinkwrap.json && pnpm import && pnpm install\n' >&2
    printf 'Override only with sign-off:  git commit --no-verify\n\n' >&2
    exit 1
fi
exit 0
'@
$PrePushHook = @'
#!/bin/sh
remote="$1"; z40=0000000000000000000000000000000000000000; found=0
while read local_ref local_sha remote_ref remote_sha; do
    [ "$local_sha" = "$z40" ] && continue
    if git ls-tree -r --name-only "$local_sha" | grep -E '(^|/)(package-lock\.json|npm-shrinkwrap\.json)$' >/dev/null 2>&1; then
        found=1
    fi
done
if [ "$found" -eq 1 ]; then
    printf '\n\033[31m✖ pnpm policy: refusing to push an npm lockfile to %s.\033[0m\n' "$remote" >&2
    printf 'Fix: git rm --cached package-lock.json npm-shrinkwrap.json && pnpm import && pnpm install\n' >&2
    printf 'Override only with sign-off:  git push --no-verify\n\n' >&2
    exit 1
fi
exit 0
'@

# ===========================================================================
#  Scanning / rewriting engine (embedded)
# ===========================================================================
$excludeDirs = @('node_modules', '.git', '.pnpm-store', 'dist', 'build', 'out',
                 '.next', '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.cache', 'vendor')

$rewriteRules = @(
    @{ Pattern = '\bnpm ci\b';              Replacement = 'pnpm install --frozen-lockfile' }
    @{ Pattern = '\bnpm run-script\b';      Replacement = 'pnpm run' }
    @{ Pattern = '\bnpm run\b';             Replacement = 'pnpm run' }
    @{ Pattern = '\bnpm exec\b';            Replacement = 'pnpm exec' }
    @{ Pattern = '\bnpm test\b';            Replacement = 'pnpm test' }
    @{ Pattern = '\bnpm start\b';           Replacement = 'pnpm start' }
    @{ Pattern = '\bnpm publish\b';         Replacement = 'pnpm publish' }
    @{ Pattern = '\bnpm (uninstall|rm)\b';  Replacement = 'pnpm remove' }
    @{ Pattern = '\bnpm install\b';         Replacement = 'pnpm install' }
    @{ Pattern = '\bnpm i\b';               Replacement = 'pnpm install' }
    @{ Pattern = '\bnpx\b';                 Replacement = 'pnpm dlx' }
    @{ Pattern = '("command"\s*:\s*")npm(")';          Replacement = '$1pnpm$2' }
    @{ Pattern = '("runtimeExecutable"\s*:\s*")npm(")'; Replacement = '$1pnpm$2' }
    @{ Pattern = '("(?:npm|eslint)\.packageManager"\s*:\s*")npm(")'; Replacement = '$1pnpm$2' }
    @{ Pattern = '\bonly-allow npm\b';      Replacement = 'only-allow pnpm' }
)

function Test-EditableFile {
    param([System.IO.FileInfo] $File, [bool] $IncludeDocs)
    $n = $File.Name.ToLowerInvariant(); $e = $File.Extension.ToLowerInvariant()
    if ($n -in @('package-lock.json','npm-shrinkwrap.json','pnpm-lock.yaml')) { return $false }
    if ($e -in @('.json','.yml','.yaml','.sh','.bash','.zsh','.ps1','.psm1','.cmd','.bat','.toml')) { return $true }
    if ($IncludeDocs -and $e -eq '.md') { return $true }
    if ($n -like 'dockerfile*' -or $e -eq '.dockerfile') { return $true }
    if ($n -in @('makefile','justfile','jenkinsfile','procfile','taskfile.yml')) { return $true }
    return $false
}
function Test-ScanOnlyFile {
    param([System.IO.FileInfo] $File)
    $File.Extension.ToLowerInvariant() -in @('.js','.ts','.jsx','.tsx','.mjs','.cjs')
}

function Invoke-Scan {
    param([string] $Root, [bool] $IncludeDocs)

    $rewrites = New-Object System.Collections.Generic.List[object]
    $flags    = New-Object System.Collections.Generic.List[object]
    $lockDirs = New-Object System.Collections.Generic.List[string]

    function New-Flag($file, $line, $msg) {
        [pscustomobject]@{ File = $file.Replace($Root,'').TrimStart('\','/'); Line = $line; Message = $msg; FullPath = $file }
    }

    $files = Get-ChildItem -Path $Root -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $rel = $_.FullName.Substring($Root.Length)
            $parts = $rel -split '[\\/]'
            -not ($parts | Where-Object { $excludeDirs -contains $_ })
        }

    foreach ($file in $files) {
        $name = $file.Name.ToLowerInvariant()

        if ($name -in @('package-lock.json','npm-shrinkwrap.json')) {
            $flags.Add((New-Flag $file.FullName 0 "npm lockfile found. Convert to pnpm-lock.yaml and remove it."))
            if (-not $lockDirs.Contains($file.DirectoryName)) { $lockDirs.Add($file.DirectoryName) }
            continue
        }

        if ($name -eq 'package.json') {
            try {
                $json = Get-Content -Raw $file.FullName | ConvertFrom-Json
                if (-not $json.packageManager) {
                    $flags.Add((New-Flag $file.FullName 0 'Missing "packageManager" field. Add e.g. "packageManager": "pnpm@9.0.0".'))
                }
                elseif ($json.packageManager -like 'npm@*') {
                    $flags.Add((New-Flag $file.FullName 0 "packageManager is '$($json.packageManager)'. Change it to pnpm@<version>."))
                }
                if (-not $json.engines -or -not $json.engines.pnpm) {
                    $flags.Add((New-Flag $file.FullName 0 'No engines.pnpm constraint. Consider "engines": { "pnpm": ">=9" }.'))
                }
            } catch {
                $flags.Add((New-Flag $file.FullName 0 "package.json could not be parsed: $($_.Exception.Message)"))
            }
        }

        if ($name -eq '.npmrc') {
            $i = 0
            foreach ($ln in (Get-Content $file.FullName)) {
                $i++
                if ($ln -match '^\s*(shamefully-hoist|hoist|node-linker|public-hoist-pattern)') {
                    $flags.Add((New-Flag $file.FullName $i "Behavioural .npmrc setting '$($ln.Trim())' must move to pnpm-workspace.yaml."))
                }
            }
            continue
        }

        if (Test-ScanOnlyFile $file) {
            $i = 0
            foreach ($ln in (Get-Content $file.FullName)) {
                $i++
                if ($ln -match '\bnpm\b|\bnpx\b') {
                    if ($ln -match "['""\s]npm['""\s]" -or $ln -match "'npm'" -or $ln -match '"npm"' -or $ln -match '\bnpx\b') {
                        $flags.Add((New-Flag $file.FullName $i "Source code references npm/pnpm dlx: '$($ln.Trim())'. Review by hand."))
                    }
                }
            }
            continue
        }

        if (Test-EditableFile -File $file -IncludeDocs $IncludeDocs) {
            $raw = Get-Content -Raw $file.FullName -ErrorAction SilentlyContinue
            if ($null -eq $raw) { continue }
            $lines = ($raw -replace "`r`n","`n") -split "`n"
            for ($idx = 0; $idx -lt $lines.Count; $idx++) {
                $orig = $lines[$idx]; $new = $orig
                foreach ($r in $rewriteRules) {
                    if ($new -match $r.Pattern) { $new = [regex]::Replace($new, $r.Pattern, $r.Replacement) }
                }
                if ($new -ne $orig) {
                    $rewrites.Add([pscustomobject]@{
                        File = $file.FullName.Replace($Root,'').TrimStart('\','/'); Line = $idx + 1
                        Before = $orig.Trim(); After = $new.Trim()
                    })
                }
                $ln = $new
                if ($ln -match 'cache\s*:\s*[''"]?npm')      { $flags.Add((New-Flag $file.FullName ($idx+1) "CI cache set to npm: '$($ln.Trim())'. Change to 'pnpm' and add pnpm/action-setup.")) }
                if ($ln -match '\bNpm@\d')                   { $flags.Add((New-Flag $file.FullName ($idx+1) "Azure 'Npm@' task: '$($ln.Trim())'. Replace with Corepack + pnpm steps.")) }
                if ($ln -match '"type"\s*:\s*"npm"')         { $flags.Add((New-Flag $file.FullName ($idx+1) "VS Code 'npm' task type: '$($ln.Trim())'. Switch to a shell/pnpm task.")) }
                if ($ln -match 'package-lock\.json')         { $flags.Add((New-Flag $file.FullName ($idx+1) "Reference to package-lock.json: '$($ln.Trim())'. Update to pnpm-lock.yaml.")) }
                if ($ln -match 'dangerouslyAllowAllBuilds')  { $flags.Add((New-Flag $file.FullName ($idx+1) "dangerouslyAllowAllBuilds disables pnpm's script protection. Remove it.")) }
            }
        }
    }

    [pscustomobject]@{ Rewrites = $rewrites; Flags = $flags; LockDirs = $lockDirs }
}

function Invoke-ApplyRewrites {
    param([string] $Root, [bool] $IncludeDocs)
    $applied = 0
    $files = Get-ChildItem -Path $Root -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $rel = $_.FullName.Substring($Root.Length); $parts = $rel -split '[\\/]'
            -not ($parts | Where-Object { $excludeDirs -contains $_ })
        }
    foreach ($file in $files) {
        if (-not (Test-EditableFile -File $file -IncludeDocs $IncludeDocs)) { continue }
        $raw = Get-Content -Raw $file.FullName -ErrorAction SilentlyContinue
        if ($null -eq $raw) { continue }
        $usesCrlf = $raw -match "`r`n"
        $lines = ($raw -replace "`r`n","`n") -split "`n"
        $changed = $false
        for ($idx = 0; $idx -lt $lines.Count; $idx++) {
            $orig = $lines[$idx]; $new = $orig
            foreach ($r in $rewriteRules) {
                if ($new -match $r.Pattern) { $new = [regex]::Replace($new, $r.Pattern, $r.Replacement) }
            }
            if ($new -ne $orig) { $lines[$idx] = $new; $changed = $true; $applied++ }
        }
        if ($changed) {
            $nl = if ($usesCrlf) { "`r`n" } else { "`n" }
            [System.IO.File]::WriteAllText($file.FullName, ($lines -join $nl))
        }
    }
    return $applied
}

# ===========================================================================
#  Wizard
# ===========================================================================
Write-Banner
$TOTAL = 5

# ---------------------------------------------------------------------------
# STEP 1 — pick the project
# ---------------------------------------------------------------------------
Show-Step -Number 1 -Total $TOTAL -Title 'Choose the project to migrate' -Why @(
    "First I need to know which folder to work on. I'll use your current folder by",
    "default. I only look inside this folder and its subfolders, and I skip things like",
    "node_modules and build output."
)
$default = (Get-Location).Path
Write-Host "   Current folder: $default" -ForegroundColor Gray
$answer = Read-Host "   Press Enter to use this folder, or type another path"
$root = if ([string]::IsNullOrWhiteSpace($answer)) { $default } else { $answer }
try { $root = (Resolve-Path $root).Path }
catch { Write-Warn "That path doesn't exist. Exiting."; return }
Write-Ok "Migrating: $root"

$includeDocs = Read-YesNo "Also update npm mentions inside Markdown docs (README, etc.)?" $false

# ---------------------------------------------------------------------------
# STEP 2 — scan + auto-fix
# ---------------------------------------------------------------------------
Show-Step -Number 2 -Total $TOTAL -Title 'Find and fix npm references automatically' -Why @(
    "I'll scan the project for npm usage. Many of them are safe to rewrite automatically —",
    "for example 'pnpm install --frozen-lockfile' becomes 'pnpm install --frozen-lockfile', 'pnpm dlx' becomes",
    "'pnpm dlx', and VS Code tasks that call npm are switched to pnpm.",
    "Anything that needs a human judgement I'll leave alone and show you at the end."
)
Write-Host "   Scanning..." -ForegroundColor Gray
$scan = Invoke-Scan -Root $root -IncludeDocs $includeDocs
$rwCount = $scan.Rewrites.Count
$flCount = $scan.Flags.Count
Write-Host ""
Write-Host "   Found $rwCount thing(s) I can fix automatically." -ForegroundColor Green
Write-Host "   Found $flCount thing(s) that need your decision." -ForegroundColor Yellow

if ($rwCount -gt 0) {
    if (Read-YesNo "Show the automatic fixes before applying them?") {
        $scan.Rewrites | Group-Object File | ForEach-Object {
            Write-Host "   $($_.Name)" -ForegroundColor White
            foreach ($r in $_.Group) {
                Write-Host ("     L{0,-4} {1}" -f $r.Line, $r.Before) -ForegroundColor DarkGray
                Write-Host ("          -> {0}" -f $r.After) -ForegroundColor Green
            }
        }
    }
    if (Read-YesNo "Apply all $rwCount automatic fixes now?") {
        $applied = Invoke-ApplyRewrites -Root $root -IncludeDocs $includeDocs
        Write-Ok "Applied $applied automatic fix(es)."
    }
    else {
        Write-Skip "Left the files unchanged."
    }
}
else {
    Write-Ok "No automatic rewrites needed."
}

# ---------------------------------------------------------------------------
# STEP 3 — lockfile
# ---------------------------------------------------------------------------
Show-Step -Number 3 -Total $TOTAL -Title 'Convert the npm lockfile to pnpm' -Why @(
    "A lockfile records the exact versions of every dependency. npm uses package-lock.json;",
    "pnpm uses pnpm-lock.yaml. I can read your existing npm lockfile and create the pnpm",
    "one from it (so you keep the same versions), then remove the npm file. Keeping both",
    "around causes confusion and is exactly what the git guardrails block."
)
if ($scan.LockDirs.Count -eq 0) {
    Write-Ok "No npm lockfile found — nothing to convert."
}
elseif (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Warn "pnpm isn't available in this window, so I can't convert the lockfile."
    Write-Host "   Run the setup wizard / open a new terminal, then re-run me." -ForegroundColor DarkGray
}
else {
    foreach ($dir in $scan.LockDirs) {
        Write-Host "   npm lockfile in: $dir" -ForegroundColor Gray
        if (Read-YesNo "Convert it to pnpm-lock.yaml and remove the npm lockfile?") {
            Push-Location $dir
            try {
                & pnpm import
                foreach ($lf in @('package-lock.json','npm-shrinkwrap.json')) {
                    $p = Join-Path $dir $lf
                    if (Test-Path $p) { Remove-Item $p -Force; Write-Host "     removed $lf" -ForegroundColor Yellow }
                }
                Write-Ok "Lockfile converted in $dir."
            }
            catch { Write-Warn "pnpm import failed here: $($_.Exception.Message)" }
            finally { Pop-Location }
        }
        else { Write-Skip "Left the npm lockfile in $dir." }
    }
}

# ---------------------------------------------------------------------------
# STEP 4 — repo git guardrails
# ---------------------------------------------------------------------------
Show-Step -Number 4 -Total $TOTAL -Title 'Add git guardrails to this repo' -Why @(
    "These small checks run when you commit or push in THIS repository, and block npm's",
    "package-lock.json from sneaking back in. This is handy if you didn't install the",
    "machine-wide guardrails, or if you want the protection to travel with the repo.",
    "You can always override with --no-verify when you really need to."
)
Push-Location $root
try {
    $inside = (& git rev-parse --is-inside-work-tree 2>$null)
    if ($inside -ne 'true') {
        Write-Warn "This folder isn't a git repository, so I can't add git guardrails here."
    }
    else {
        $configured = (& git config --get core.hooksPath)
        if ($configured) {
            $target = if ([System.IO.Path]::IsPathRooted($configured)) { $configured } else { Join-Path $root $configured }
        }
        else {
            $gitDir = (& git rev-parse --git-dir).Trim()
            if (-not [System.IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $root $gitDir }
            $target = Join-Path $gitDir 'hooks'
        }
        if ((Test-Path (Join-Path $target 'pre-commit')) -and
            ((Get-Content -Raw (Join-Path $target 'pre-commit') -ErrorAction SilentlyContinue) -match 'pnpm policy')) {
            Write-Ok "This repo already has the pnpm git guardrails."
        }
        elseif (Read-YesNo "Install the git guardrails into this repo?") {
            if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
            [System.IO.File]::WriteAllText((Join-Path $target 'pre-commit'), ($PreCommitHook -replace "`r`n","`n"))
            [System.IO.File]::WriteAllText((Join-Path $target 'pre-push'),   ($PrePushHook   -replace "`r`n","`n"))
            Write-Ok "Git guardrails installed for this repo ($target)."
        }
        else { Write-Skip "Skipping repo guardrails." }
    }
}
finally { Pop-Location }

# ---------------------------------------------------------------------------
# STEP 5 — walk through the manual items
# ---------------------------------------------------------------------------
Show-Step -Number 5 -Total $TOTAL -Title 'Review what needs a human decision' -Why @(
    "These are things I deliberately did NOT change, because they need your judgement —",
    "like npm called from source code, a missing packageManager field, or CI settings.",
    "I'll list them so nothing is missed. Nothing here is edited automatically."
)
if ($scan.Flags.Count -eq 0) {
    Write-Ok "Nothing left to do by hand. Nice and clean!"
}
else {
    Write-Host "   $($scan.Flags.Count) item(s) for you to handle:" -ForegroundColor Yellow
    $scan.Flags | Group-Object File | ForEach-Object {
        Write-Host ""
        Write-Host "   $($_.Name)" -ForegroundColor White
        foreach ($f in $_.Group) {
            $loc = if ($f.Line -gt 0) { "L$($f.Line)" } else { '-' }
            Write-Host ("     {0,-6} {1}" -f $loc, $f.Message) -ForegroundColor Yellow
        }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Migration wizard finished for:" -ForegroundColor Cyan
Write-Host "  $root" -ForegroundColor White
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   • Automatic fixes found : $rwCount" -ForegroundColor Gray
Write-Host "   • Manual items to review: $flCount" -ForegroundColor Gray
Write-Host ""
Write-Host "   Suggested next commands:" -ForegroundColor Gray
Write-Host "     pnpm install          # get dependencies with pnpm" -ForegroundColor DarkGray
Write-Host "     pnpm run build        # verify your scripts still work" -ForegroundColor DarkGray
Write-Host ""
