<#
.SYNOPSIS
    Installs Visual Studio Code and Nexkit extension in an unattended manner.

.DESCRIPTION
    This script automates the installation of Visual Studio Code and the Nexkit extension.
    Designed for Microsoft Intune deployment with proper exit codes and silent installation.

.PARAMETER InstallScope
    Specifies the installation scope: 'User' or 'Machine'. Default is 'Machine'.

.PARAMETER SkipVSCodeInstall
    If specified, skips VS Code installation and only installs Nexkit extension.

.PARAMETER LogPath
    Path to the log file. Default is %TEMP%\nexkit-install.log

.PARAMETER VsixUrl
    Direct URL to download the Nexkit .vsix file (optional, overrides GitHub release check)

.PARAMETER VsixPath
    Path to a local .vsix file (optional, skips download entirely)

.EXAMPLE
    .\install-vscode-with-nexkit.ps1
    Installs VS Code and Nexkit extension for all users (machine-wide).

.EXAMPLE
    .\install-vscode-with-nexkit.ps1 -InstallScope User
    Installs VS Code and Nexkit extension for the current user only.

.EXAMPLE
    .\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall
    Only installs Nexkit extension (assumes VS Code is already installed).

.EXAMPLE
    .\install-vscode-with-nexkit.ps1 -VsixUrl "https://example.com/nexkit.vsix"
    Install using a direct URL to the .vsix file.

.EXAMPLE
    .\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexkit.vsix"
    Install using a local .vsix file.

.NOTES
    Exit Codes:
    0 = Success
    1 = VS Code installation failed
    2 = Nexkit download failed
    3 = Nexkit installation failed
    4 = VS Code not found after installation
    5 = Prerequisites not met
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet('User', 'Machine')]
    [string]$InstallScope = 'Machine',

    [Parameter(Mandatory = $false)]
    [switch]$SkipVSCodeInstall,

    [Parameter(Mandatory = $false)]
    [string]$LogPath = "$env:TEMP\nexkit-install.log",

    [Parameter(Mandatory = $false)]
    [string]$VsixUrl,

    [Parameter(Mandatory = $false)]
    [string]$VsixPath
)

# Script configuration
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$GitHubRepo = 'NexusInnovation/nexus-nexkit-vscode'
$VSCodeInstallerUrl = 'https://code.visualstudio.com/sha/download?build=stable&os=win32-x64'
$TempDir = Join-Path $env:TEMP "nexkit-install-$(Get-Date -Format 'yyyyMMddHHmmss')"

#region Logging Functions

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'WARNING', 'ERROR', 'SUCCESS')]
        [string]$Level = 'INFO'
    )
    
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $logMessage = "[$timestamp] [$Level] $Message"
    
    # Write to log file
    Add-Content -Path $LogPath -Value $logMessage -Force
    
    # Write to console with color
    switch ($Level) {
        'ERROR' { Write-Host $logMessage -ForegroundColor Red }
        'WARNING' { Write-Host $logMessage -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $logMessage -ForegroundColor Green }
        default { Write-Host $logMessage }
    }
}

function Exit-WithCode {
    param(
        [int]$ExitCode,
        [string]$Message
    )
    
    if ($ExitCode -eq 0) {
        Write-Log -Message $Message -Level 'SUCCESS'
    } else {
        Write-Log -Message $Message -Level 'ERROR'
    }
    
    # Clean up temp directory
    if (Test-Path $TempDir) {
        try {
            Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Log -Message "Cleaned up temporary directory: $TempDir" -Level 'INFO'
        } catch {
            Write-Log -Message "Failed to clean up temporary directory: $_" -Level 'WARNING'
        }
    }
    
    exit $ExitCode
}

#endregion

#region Helper Functions

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-VSCodePath {
    $paths = @(
        "${env:ProgramFiles}\Microsoft VS Code\bin\code.cmd",
        "${env:LocalAppData}\Programs\Microsoft VS Code\bin\code.cmd"
    )
    
    foreach ($path in $paths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    # Try to find in PATH
    $codePath = (Get-Command code -ErrorAction SilentlyContinue).Source
    if ($codePath) {
        return $codePath
    }
    
    return $null
}

function Refresh-EnvironmentPath {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + 
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-VSCodeInstalled {
    $codePath = Get-VSCodePath
    if ($codePath) {
        Write-Log -Message "VS Code found at: $codePath" -Level 'INFO'
        return $true
    }
    return $false
}

function Install-VSCodeWindows {
    param(
        [string]$Scope
    )
    
    Write-Log -Message "Starting VS Code installation (Scope: $Scope)..." -Level 'INFO'
    
    # Create temp directory
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
    
    # Determine installation method
    $useWinget = $false
    
    # Check if winget is available
    try {
        $wingetVersion = winget --version
        if ($wingetVersion) {
            $useWinget = $true
            Write-Log -Message "Winget detected: $wingetVersion" -Level 'INFO'
        }
    } catch {
        Write-Log -Message "Winget not available, will use direct installer download" -Level 'INFO'
    }
    
    if ($useWinget) {
        # Install via winget
        try {
            $wingetScope = if ($Scope -eq 'Machine') { '--scope machine' } else { '--scope user' }
            Write-Log -Message "Installing VS Code via winget..." -Level 'INFO'
            
            $wingetArgs = "install Microsoft.VisualStudioCode --silent --accept-source-agreements --accept-package-agreements $wingetScope"
            $process = Start-Process -FilePath "winget" -ArgumentList $wingetArgs -Wait -PassThru -NoNewWindow
            
            if ($process.ExitCode -eq 0) {
                Write-Log -Message "VS Code installed successfully via winget" -Level 'SUCCESS'
                return $true
            } elseif ($process.ExitCode -eq -1978335189) {
                # This exit code means "already installed" in winget
                Write-Log -Message "VS Code is already installed" -Level 'INFO'
                return $true
            } else {
                Write-Log -Message "Winget installation failed with exit code: $($process.ExitCode)" -Level 'WARNING'
                Write-Log -Message "Falling back to direct installer download..." -Level 'INFO'
            }
        } catch {
            Write-Log -Message "Winget installation error: $_" -Level 'WARNING'
            Write-Log -Message "Falling back to direct installer download..." -Level 'INFO'
        }
    }
    
    # Install via direct download
    try {
        $installerPath = Join-Path $TempDir "VSCodeSetup.exe"
        
        Write-Log -Message "Downloading VS Code installer..." -Level 'INFO'
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "nexkit-installer/1.0")
        $webClient.DownloadFile($VSCodeInstallerUrl, $installerPath)
        
        if (-not (Test-Path $installerPath)) {
            throw "Installer download failed"
        }
        
        Write-Log -Message "Downloaded installer to: $installerPath" -Level 'INFO'
        
        # Prepare installation arguments
        $installArgs = @(
            '/VERYSILENT',
            '/NORESTART',
            '/MERGETASKS=!runcode',
            'ADDTOPATH=true'
        )
        
        if ($Scope -eq 'Machine') {
            $installArgs += '/ALLUSERS'
        } else {
            $installArgs += '/CURRENTUSER'
        }
        
        Write-Log -Message "Installing VS Code..." -Level 'INFO'
        $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            Write-Log -Message "VS Code installed successfully" -Level 'SUCCESS'
            return $true
        } else {
            throw "Installation failed with exit code: $($process.ExitCode)"
        }
    } catch {
        Write-Log -Message "Direct installation failed: $_" -Level 'ERROR'
        return $false
    }
}

function Get-LatestNexkitRelease {
    Write-Log -Message "Fetching latest Nexkit release from GitHub..." -Level 'INFO'
    
    try {
        # Try latest release endpoint first
        $apiUrl = "https://api.github.com/repos/$GitHubRepo/releases/latest"
        $headers = @{
            'User-Agent' = 'nexkit-installer/1.0'
            'Accept' = 'application/vnd.github.v3+json'
        }
        
        try {
            $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -ErrorAction Stop
            
            # Find the .vsix asset
            $vsixAsset = $response.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1
            
            if ($vsixAsset) {
                Write-Log -Message "Found Nexkit release: $($response.tag_name)" -Level 'INFO'
                Write-Log -Message "Extension file: $($vsixAsset.name)" -Level 'INFO'
                
                return @{
                    Version = $response.tag_name
                    DownloadUrl = $vsixAsset.browser_download_url
                    FileName = $vsixAsset.name
                }
            }
        } catch {
            Write-Log -Message "No official release found, trying to fetch all releases including pre-releases..." -Level 'WARNING'
        }
        
        # Fallback: Try to get the latest release including pre-releases
        $allReleasesUrl = "https://api.github.com/repos/$GitHubRepo/releases"
        $response = Invoke-RestMethod -Uri $allReleasesUrl -Headers $headers -ErrorAction Stop
        
        if ($response -and $response.Count -gt 0) {
            # Get the first release (most recent)
            $latestRelease = $response[0]
            $vsixAsset = $latestRelease.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1
            
            if ($vsixAsset) {
                Write-Log -Message "Found Nexkit release: $($latestRelease.tag_name) (Pre-release: $($latestRelease.prerelease))" -Level 'INFO'
                Write-Log -Message "Extension file: $($vsixAsset.name)" -Level 'INFO'
                
                return @{
                    Version = $latestRelease.tag_name
                    DownloadUrl = $vsixAsset.browser_download_url
                    FileName = $vsixAsset.name
                }
            }
        }
        
        throw "No .vsix file found in any release. Repository may be private or releases not yet published."
    } catch {
        Write-Log -Message "Failed to fetch release information: $_" -Level 'ERROR'
        throw
    }
}

function Install-NexkitExtension {
    param(
        [string]$CodePath,
        [string]$DirectUrl,
        [string]$LocalPath
    )
    
    Write-Log -Message "Starting Nexkit extension installation..." -Level 'INFO'
    
    try {
        $vsixPath = $null
        $needsCleanup = $true
        
        # Create temp directory if it doesn't exist
        if (-not (Test-Path $TempDir)) {
            New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
        }
        
        # Determine source of .vsix file
        if ($LocalPath) {
            # Use local file
            Write-Log -Message "Using local .vsix file: $LocalPath" -Level 'INFO'
            
            if (-not (Test-Path $LocalPath)) {
                throw "Local .vsix file not found: $LocalPath"
            }
            
            $vsixPath = $LocalPath
            $needsCleanup = $false
        }
        elseif ($DirectUrl) {
            # Download from direct URL
            Write-Log -Message "Downloading from direct URL: $DirectUrl" -Level 'INFO'
            
            $fileName = Split-Path $DirectUrl -Leaf
            if (-not $fileName.EndsWith('.vsix')) {
                $fileName = "nexkit.vsix"
            }
            
            $vsixPath = Join-Path $TempDir $fileName
            
            $webClient = New-Object System.Net.WebClient
            $webClient.Headers.Add("User-Agent", "nexkit-installer/1.0")
            $webClient.DownloadFile($DirectUrl, $vsixPath)
            
            if (-not (Test-Path $vsixPath)) {
                throw "Extension download failed from direct URL"
            }
        }
        else {
            # Get latest release from GitHub
            $release = Get-LatestNexkitRelease
            
            $vsixPath = Join-Path $TempDir $release.FileName
            Write-Log -Message "Downloading Nexkit extension..." -Level 'INFO'
            
            $webClient = New-Object System.Net.WebClient
            $webClient.Headers.Add("User-Agent", "nexkit-installer/1.0")
            $webClient.DownloadFile($release.DownloadUrl, $vsixPath)
            
            if (-not (Test-Path $vsixPath)) {
                throw "Extension download failed"
            }
        }
        
        Write-Log -Message "Using extension file: $vsixPath" -Level 'INFO'
        
        # Install the extension
        Write-Log -Message "Installing Nexkit extension..." -Level 'INFO'
        
        $installArgs = @('--install-extension', $vsixPath, '--force')
        $process = Start-Process -FilePath $CodePath -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -eq 0) {
            Write-Log -Message "Nexkit extension installed successfully" -Level 'SUCCESS'
            
            # Clean up downloaded file if needed
            if ($needsCleanup -and (Test-Path $vsixPath)) {
                Remove-Item $vsixPath -Force -ErrorAction SilentlyContinue
            }
            
            return $true
        } else {
            throw "Extension installation failed with exit code: $($process.ExitCode)"
        }
    } catch {
        Write-Log -Message "Nexkit installation failed: $_" -Level 'ERROR'
        return $false
    }
}

#endregion

#region Main Script

Write-Log -Message "========================================" -Level 'INFO'
Write-Log -Message "Nexkit Installation Script Started" -Level 'INFO'
Write-Log -Message "========================================" -Level 'INFO'
Write-Log -Message "Install Scope: $InstallScope" -Level 'INFO'
Write-Log -Message "Skip VS Code Install: $SkipVSCodeInstall" -Level 'INFO'
Write-Log -Message "Log Path: $LogPath" -Level 'INFO'

# Check administrator rights for machine-wide installation
if ($InstallScope -eq 'Machine' -and -not (Test-Administrator)) {
    Exit-WithCode -ExitCode 5 -Message "Administrator rights required for machine-wide installation"
}

# Step 1: Install VS Code (if needed)
if (-not $SkipVSCodeInstall) {
    if (Test-VSCodeInstalled) {
        Write-Log -Message "VS Code is already installed" -Level 'INFO'
    } else {
        Write-Log -Message "VS Code not found, proceeding with installation" -Level 'INFO'
        
        $vsCodeInstalled = Install-VSCodeWindows -Scope $InstallScope
        
        if (-not $vsCodeInstalled) {
            Exit-WithCode -ExitCode 1 -Message "VS Code installation failed"
        }
        
        # Refresh environment to pick up new PATH
        Refresh-EnvironmentPath
        
        # Wait a bit for installation to complete
        Start-Sleep -Seconds 5
    }
} else {
    Write-Log -Message "Skipping VS Code installation as requested" -Level 'INFO'
}

# Step 2: Verify VS Code is available
Write-Log -Message "Verifying VS Code installation..." -Level 'INFO'
$codePath = Get-VSCodePath

if (-not $codePath) {
    Exit-WithCode -ExitCode 4 -Message "VS Code not found after installation. PATH may need manual refresh."
}

Write-Log -Message "Using VS Code at: $codePath" -Level 'SUCCESS'

# Step 3: Install Nexkit extension
Write-Log -Message "Proceeding with Nexkit extension installation..." -Level 'INFO'

$nexkitInstalled = Install-NexkitExtension -CodePath $codePath -DirectUrl $VsixUrl -LocalPath $VsixPath

if (-not $nexkitInstalled) {
    Exit-WithCode -ExitCode 3 -Message "Nexkit extension installation failed"
}

# Success
Write-Log -Message "========================================" -Level 'SUCCESS'
Write-Log -Message "Installation completed successfully!" -Level 'SUCCESS'
Write-Log -Message "========================================" -Level 'SUCCESS'
Exit-WithCode -ExitCode 0 -Message "VS Code and Nexkit extension installed successfully"

#endregion
