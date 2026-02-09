# Nexkit Deployment Scripts

This directory contains automated deployment scripts for installing Visual Studio Code with the Nexkit extension.

## Quick Start

### For Standard Installation

**Windows (PowerShell - Administrator):**
```powershell
.\install-vscode-with-nexkit.ps1
```

**Windows (Batch - Administrator):**
```cmd
install-vscode-with-nexkit.bat
```

This will install VS Code machine-wide and the latest Nexkit extension.

### For Microsoft Intune Deployment

See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) for complete step-by-step instructions on deploying through Microsoft Intune.

## Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| **install-vscode-with-nexkit.ps1** | Main installation script | `.\install-vscode-with-nexkit.ps1 [-InstallScope Machine\|User]` |
| **install-vscode-with-nexkit.bat** | Batch wrapper for installation | `install-vscode-with-nexkit.bat` |
| **detect-installation.ps1** | Detection script for Intune | Used by Intune for app detection |
| **uninstall-vscode-with-nexkit.ps1** | Uninstallation script | `.\uninstall-vscode-with-nexkit.ps1 [-UninstallVSCode]` |

## Important Notes

### Repository Access
The GitHub repository may be private or releases may not yet be published. The installation script handles this gracefully with several fallback options:

1. **Direct URL**: Use `VsixUrl` parameter to specify a direct download link
2. **Local File**: Use `-VsixPath` parameter to install from a local `.vsix` file
3. **Pre-release Support**: Script automatically falls back to pre-release versions if no stable release exists

**For Intune Deployment**, it's recommended to:
- Host the `.vsix` file on an internal server or Azure Blob Storage
- Use the `-VsixUrl` parameter to point to your hosted file
- OR include the `.vsix` file in the Intune package and use `-VsixPath`

## Installation Script

### Synopsis
Automates the installation of Visual Studio Code and Nexkit extension in an unattended manner.

### Parameters

- **`-InstallScope`**: `Machine` (default) or `User`
  - `Machine`: Installs for all users (requires administrator)
  - `User`: Installs for current user only

- **`-SkipVSCodeInstall`**: Skip VS Code installation (if already installed)

- **`-LogPath`**: Custom log file path (default: `%TEMP%\nexkit-install.log`)

- **`-VsixUrl`**: Direct URL to download the Nexkit .vsix file (bypasses GitHub API)

- **`-VsixPath`**: Path to a local .vsix file (skips download entirely)

### Examples

```powershell
# Machine-wide installation (default)
.\install-vscode-with-nexkit.ps1

# User-only installation
.\install-vscode-with-nexkit.ps1 -InstallScope User

# Only install Nexkit extension (VS Code already installed)
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall

# Use a direct URL to the .vsix file
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://your-server.com/path/to/nexkit.vsix"

# Use a local .vsix file
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexkit-3.0.0.vsix"

# Custom log location
.\install-vscode-with-nexkit.ps1 -LogPath "C:\Logs\nexkit-install.log"
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | VS Code installation failed |
| 2 | Nexkit download failed |
| 3 | Nexkit installation failed |
| 4 | VS Code not found after installation |
| 5 | Prerequisites not met |

## Detection Script

### Synopsis
Checks if VS Code and Nexkit extension are installed. Used by Intune for detection rules.

### Usage
```powershell
.\detect-installation.ps1
```

### Exit Codes
- `0`: Both VS Code and Nexkit detected (installed)
- `1`: Either VS Code or Nexkit missing (not installed)

## Uninstallation Script

### Synopsis
Removes Nexkit extension and optionally uninstalls VS Code.

### Parameters

- **`-UninstallVSCode`**: Also uninstall VS Code (default: false, only removes extension)
- **`-LogPath`**: Custom log file path

### Examples

```powershell
# Remove only Nexkit extension
.\uninstall-vscode-with-nexkit.ps1

# Remove Nexkit and uninstall VS Code
.\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | VS Code not found |
| 2 | Extension uninstall failed |
| 3 | VS Code uninstall failed |

## Features

### Installation Process

1. **VS Code Installation**
   - Attempts installation via `winget` (if available)
   - Falls back to direct installer download
   - Supports both user and machine scope
   - Automatically adds to PATH

2. **Nexkit Extension Installation**
   - Fetches latest release from GitHub
   - Downloads `.vsix` file
   - Installs via VS Code CLI
   - Cleans up temporary files

3. **Error Handling**
   - Comprehensive logging
   - Proper exit codes for automation
   - Graceful fallbacks
   - Detailed error messages

### Logging

All scripts create detailed logs in `%TEMP%` by default:
- **Installation**: `nexkit-install.log`
- **Uninstallation**: `nexkit-uninstall.log`

View logs:
```powershell
Get-Content "$env:TEMP\nexkit-install.log"
```

## Microsoft Intune Deployment

For enterprise deployment through Microsoft Intune:

1. **Create .intunewin package** using the Win32 Content Prep Tool
2. **Upload to Intune** as a Win32 app
3. **Configure detection** using `detect-installation.ps1`
4. **Assign to groups** for automatic deployment

See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) for detailed instructions.

## Prerequisites

### System Requirements
- Windows 10 1809 or later
- PowerShell 5.1 or later
- Internet connectivity
- Administrator rights (for machine-wide installation)

### Network Access
Scripts require access to:
- `https://code.visualstudio.com` - VS Code download
- `https://api.github.com` - GitHub API
- `https://github.com` - Nexkit extension download

## Troubleshooting

### Installation Issues

**Problem**: "VS Code installation failed"
```powershell
# Check if VS Code installer is accessible
Invoke-WebRequest -Uri "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64" -Method Head

# Try manual winget install
winget install Microsoft.VisualStudioCode
```

**Problem**: "Nexkit extension installation failed"
```powershell
# Check if GitHub API is accessible
Invoke-RestMethod -Uri "https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/releases/latest"

# Try manual extension install
code --install-extension path\to\nexkit.vsix
```

**Problem**: "VS Code not found after installation"
```powershell
# Refresh environment variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# Check VS Code location
Get-Command code
```

### Detection Issues

**Problem**: Detection script fails
```powershell
# Test detection manually
.\detect-installation.ps1
Write-Host "Exit code: $LASTEXITCODE"

# Check VS Code
Get-Command code

# List installed extensions
code --list-extensions
```

### Log Analysis

View recent installation attempts:
```powershell
# Installation logs
Get-ChildItem "$env:TEMP\nexkit-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content

# Filter for errors
Get-Content "$env:TEMP\nexkit-install.log" | Select-String "ERROR"
```

## Security Notes

1. **Execution Policy**: Scripts require `Bypass` or `RemoteSigned` execution policy
2. **Administrator Rights**: Required for machine-wide installation
3. **Script Signing**: Consider signing scripts for production use
4. **Network Security**: Ensure firewall allows required HTTPS endpoints

## Development

### Testing Installation
```powershell
# Test with verbose output
.\install-vscode-with-nexkit.ps1 -Verbose

# Test user-scope installation (no admin needed)
.\install-vscode-with-nexkit.ps1 -InstallScope User -Verbose
```

### Testing Detection
```powershell
# Run detection and check result
.\detect-installation.ps1
$result = $LASTEXITCODE
Write-Host "Detection result: $result (0=found, 1=not found)"
```

### Testing Uninstallation
```powershell
# Test extension removal only
.\uninstall-vscode-with-nexkit.ps1 -Verbose

# Test full uninstallation
.\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode -Verbose
```

## Support

- **Issues**: https://github.com/NexusInnovation/nexus-nexkit-vscode/issues
- **Documentation**: https://github.com/NexusInnovation/nexus-nexkit-vscode
- **Latest Release**: https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest

## License

These scripts are part of the Nexkit project and are licensed under the MIT License.
