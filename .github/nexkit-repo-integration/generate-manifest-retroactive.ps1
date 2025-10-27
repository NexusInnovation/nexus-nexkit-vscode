<#
.SYNOPSIS
    Generate manifest.json for a nexkit repository release retroactively.

.DESCRIPTION
    This script fetches release information from GitHub and generates a manifest.json
    file that can be committed to the nexkit repository for existing releases.

.PARAMETER Version
    The release version tag (e.g., "v0.0.30")

.PARAMETER Owner
    GitHub repository owner (default: "NexusInnovation")

.PARAMETER Repo
    GitHub repository name (default: "nexkit")

.PARAMETER MinExtensionVersion
    Minimum required nexkit-vscode extension version (default: "0.3.0")

.PARAMETER OutputPath
    Output path for manifest.json (default: "./manifest.json")

.EXAMPLE
    .\generate-manifest-retroactive.ps1 -Version "v0.0.30"

.EXAMPLE
    .\generate-manifest-retroactive.ps1 -Version "v0.0.30" -OutputPath "C:\temp\manifest.json"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$Owner = "NexusInnovation",
    
    [Parameter(Mandatory=$false)]
    [string]$Repo = "nexkit",
    
    [Parameter(Mandatory=$false)]
    [string]$MinExtensionVersion = "0.3.0",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = "./manifest.json"
)

$ErrorActionPreference = "Stop"

Write-Host "Generating manifest for $Owner/$Repo release $Version..." -ForegroundColor Cyan

# Fetch release information from GitHub API
$releaseUrl = "https://api.github.com/repos/$Owner/$Repo/releases/tags/$Version"
Write-Host "Fetching release info from: $releaseUrl" -ForegroundColor Gray

try {
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers @{
        "User-Agent" = "Nexkit-Manifest-Generator"
        "Accept" = "application/vnd.github.v3+json"
    }
} catch {
    Write-Error "Failed to fetch release information: $_"
    exit 1
}

Write-Host "Release found: $($release.name)" -ForegroundColor Green
Write-Host "Published: $($release.published_at)" -ForegroundColor Gray
Write-Host "Assets: $($release.assets.Count)" -ForegroundColor Gray

# Parse template assets
$templates = @{}
$templatePattern = '^nexkit-template-(.+)-(.+)-v(.+)\.zip$'

foreach ($asset in $release.assets) {
    if ($asset.name -match $templatePattern) {
        $aiTool = $Matches[1]
        $shell = $Matches[2]
        $assetVersion = $Matches[3]
        
        $key = "$aiTool-$shell"
        $aiToolName = $aiTool.Substring(0,1).ToUpper() + $aiTool.Substring(1)
        $shellName = if ($shell -eq 'ps') { 'PowerShell' } else { 'Bash' }
        
        $templates[$key] = @{
            name = "$aiToolName ($shellName)"
            description = "Nexkit templates optimized for $aiTool with $shellName scripts"
            platform = if ($shell -eq 'ps') { 'windows' } else { 'unix' }
            shell = if ($shell -eq 'ps') { 'powershell' } else { 'bash' }
            downloadUrl = $asset.browser_download_url
            size = $asset.size
        }
        
        Write-Host "  - Found template: $key" -ForegroundColor Yellow
    }
}

if ($templates.Count -eq 0) {
    Write-Warning "No template assets found matching pattern: $templatePattern"
    Write-Host "Available assets:" -ForegroundColor Gray
    $release.assets | ForEach-Object { Write-Host "  - $($_.name)" -ForegroundColor DarkGray }
    exit 1
}

# Determine default download URL (prefer copilot-ps)
$defaultDownloadUrl = ""
if ($templates.ContainsKey('copilot-ps')) {
    $defaultDownloadUrl = $templates['copilot-ps'].downloadUrl
} elseif ($templates.ContainsKey('copilot-sh')) {
    $defaultDownloadUrl = $templates['copilot-sh'].downloadUrl
} else {
    $defaultDownloadUrl = ($templates.Values | Select-Object -First 1).downloadUrl
}

# Build manifest object
$manifest = [ordered]@{
    version = $Version.TrimStart('v')
    releaseDate = $release.published_at
    changelogUrl = $release.html_url
    minExtensionVersion = $MinExtensionVersion
    templates = $templates
    downloadUrl = $defaultDownloadUrl
    recommended = @{
        copilot = "copilot-ps"
        claude = "claude-ps"
        cursor = "cursor-ps"
        windsurf = "windsurf-ps"
        roo = "roo-ps"
    }
}

# Convert to JSON with proper formatting
$json = $manifest | ConvertTo-Json -Depth 10

# Write to file
Write-Host "`nWriting manifest to: $OutputPath" -ForegroundColor Cyan
$json | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

Write-Host "`nManifest generated successfully!" -ForegroundColor Green
Write-Host "`nPreview:" -ForegroundColor Cyan
Write-Host $json -ForegroundColor Gray

Write-Host "`n✓ Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review the generated manifest.json" -ForegroundColor White
Write-Host "  2. Copy it to the root of the nexkit repository" -ForegroundColor White
Write-Host "  3. Commit and tag: git add manifest.json && git commit -m 'Add manifest for $Version'" -ForegroundColor White
Write-Host "  4. Update the tag: git tag -fa $Version -m 'Add manifest'" -ForegroundColor White
Write-Host "  5. Force push the tag: git push origin $Version --force" -ForegroundColor White
Write-Host "`n  The manifest will be available at:" -ForegroundColor White
Write-Host "  https://raw.githubusercontent.com/$Owner/$Repo/$Version/manifest.json" -ForegroundColor Cyan
