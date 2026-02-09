<#
.SYNOPSIS
    Uninstalls Nexkit extension and optionally Visual Studio Code.

.DESCRIPTION
    This script removes the Nexkit extension from Visual Studio Code.
    Optionally can also uninstall VS Code completely.
    Designed for Microsoft Intune deployment with proper exit codes.

.PARAMETER UninstallVSCode
    If specified, also uninstalls Visual Studio Code after removing the extension.

.PARAMETER LogPath
    Path to the log file. Default is %TEMP%\nexkit-uninstall.log

.EXAMPLE
    .\uninstall-vscode-with-nexkit.ps1
    Removes only the Nexkit extension, keeps VS Code.

.EXAMPLE
    .\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode
    Removes Nexkit extension and uninstalls VS Code.

.NOTES
    Exit Codes:
    0 = Success
    1 = VS Code not found
    2 = Extension uninstall failed
    3 = VS Code uninstall failed
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$UninstallVSCode,

    [Parameter(Mandatory = $false)]
    [string]$LogPath = "$env:TEMP\nexkit-uninstall.log"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

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
    
    exit $ExitCode
}

#endregion

#region Helper Functions

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

function Uninstall-NexkitExtension {
    param(
        [string]$CodePath
    )
    
    Write-Log -Message "Uninstalling Nexkit extension..." -Level 'INFO'
    
    try {
        $uninstallArgs = @('--uninstall-extension', 'NexusInnovation.nexus-nexkit-vscode')
        $process = Start-Process -FilePath $CodePath -ArgumentList $uninstallArgs -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -eq 0) {
            Write-Log -Message "Nexkit extension uninstalled successfully" -Level 'SUCCESS'
            return $true
        } else {
            Write-Log -Message "Extension uninstall failed with exit code: $($process.ExitCode)" -Level 'WARNING'
            # Non-zero exit code might mean extension wasn't installed, which is fine
            return $true
        }
    } catch {
        Write-Log -Message "Failed to uninstall extension: $_" -Level 'ERROR'
        return $false
    }
}

function Uninstall-VSCode {
    Write-Log -Message "Uninstalling Visual Studio Code..." -Level 'INFO'
    
    try {
        # Check if winget is available
        $wingetVersion = winget --version 2>$null
        if ($wingetVersion) {
            Write-Log -Message "Using winget for uninstallation" -Level 'INFO'
            $process = Start-Process -FilePath "winget" -ArgumentList "uninstall Microsoft.VisualStudioCode --silent" -Wait -PassThru -NoNewWindow
            
            if ($process.ExitCode -eq 0) {
                Write-Log -Message "VS Code uninstalled successfully" -Level 'SUCCESS'
                return $true
            }
        }
        
        # Fallback to searching for uninstaller
        $uninstallerPaths = @(
            "${env:ProgramFiles}\Microsoft VS Code\unins000.exe",
            "${env:LocalAppData}\Programs\Microsoft VS Code\unins000.exe"
        )
        
        foreach ($uninstallerPath in $uninstallerPaths) {
            if (Test-Path $uninstallerPath) {
                Write-Log -Message "Found uninstaller at: $uninstallerPath" -Level 'INFO'
                $process = Start-Process -FilePath $uninstallerPath -ArgumentList '/VERYSILENT', '/NORESTART' -Wait -PassThru
                
                if ($process.ExitCode -eq 0) {
                    Write-Log -Message "VS Code uninstalled successfully" -Level 'SUCCESS'
                    return $true
                }
            }
        }
        
        Write-Log -Message "No uninstaller found" -Level 'WARNING'
        return $false
    } catch {
        Write-Log -Message "Failed to uninstall VS Code: $_" -Level 'ERROR'
        return $false
    }
}

#endregion

#region Main Script

Write-Log -Message "========================================" -Level 'INFO'
Write-Log -Message "Nexkit Uninstallation Script Started" -Level 'INFO'
Write-Log -Message "========================================" -Level 'INFO'
Write-Log -Message "Uninstall VS Code: $UninstallVSCode" -Level 'INFO'

# Find VS Code
$codePath = Get-VSCodePath

if (-not $codePath) {
    Exit-WithCode -ExitCode 1 -Message "VS Code not found. Nothing to uninstall."
}

Write-Log -Message "Found VS Code at: $codePath" -Level 'INFO'

# Uninstall Nexkit extension
$extensionRemoved = Uninstall-NexkitExtension -CodePath $codePath

if (-not $extensionRemoved) {
    Exit-WithCode -ExitCode 2 -Message "Failed to uninstall Nexkit extension"
}

# Uninstall VS Code if requested
if ($UninstallVSCode) {
    $vscodeRemoved = Uninstall-VSCode
    
    if (-not $vscodeRemoved) {
        Exit-WithCode -ExitCode 3 -Message "Failed to uninstall VS Code"
    }
}

# Success
Write-Log -Message "========================================" -Level 'SUCCESS'
Write-Log -Message "Uninstallation completed successfully!" -Level 'SUCCESS'
Write-Log -Message "========================================" -Level 'SUCCESS'
Exit-WithCode -ExitCode 0 -Message "Uninstallation completed successfully"

#endregion
