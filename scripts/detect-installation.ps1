<#
.SYNOPSIS
    Detection script for Microsoft Intune to check if VS Code and Nexkit are installed.

.DESCRIPTION
    This script checks if Visual Studio Code and the Nexkit extension are installed.
    Used by Intune as a detection method for the Win32 app deployment.

.NOTES
    Exit Codes:
    0 = Detected (both VS Code and Nexkit are installed)
    1 = Not Detected (either VS Code or Nexkit is missing)
    
    For Intune detection rules:
    - Use this script as a custom detection script
    - The app is considered installed when this script exits with code 0
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

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

function Test-NexkitExtension {
    param(
        [string]$CodePath
    )
    
    try {
        # List installed extensions
        $output = & $CodePath --list-extensions 2>&1
        
        # Check if Nexkit extension is in the list
        $nexkitInstalled = $output | Where-Object { $_ -match 'nexusinnovation\.nexus-nexkit-vscode' }
        
        if ($nexkitInstalled) {
            return $true
        }
        
        return $false
    }
    catch {
        return $false
    }
}

#endregion

#region Main Detection Logic

# Check if VS Code is installed
$vsCodePath = Get-VSCodePath

if (-not $vsCodePath) {
    Write-Output "VS Code not detected"
    exit 1
}

Write-Output "VS Code detected at: $vsCodePath"

# Check if Nexkit extension is installed
$nexkitInstalled = Test-NexkitExtension -CodePath $vsCodePath

if (-not $nexkitInstalled) {
    Write-Output "Nexkit extension not detected"
    exit 1
}

Write-Output "Nexkit extension detected"
Write-Output "Installation verified successfully"
exit 0

#endregion
