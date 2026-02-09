# Nexkit Deployment Scripts

This directory contains automated deployment scripts for installing Visual Studio Code with the Nexkit extension.

## 🚀 Quick Install (Recommended)

**The easiest way to install** - Copy and paste this entire command block into **PowerShell (Run as Administrator)**:

👉 **See [QUICK-INSTALL.md](./QUICK-INSTALL.md) for the complete copy-paste script**

This method:
- ✅ Handles GitHub authentication automatically (OAuth)
- ✅ Downloads the latest extension from private repository
- ✅ Installs VS Code and Nexkit in one step
- ✅ No manual file downloads needed
- ⏱️ Takes ~2 minutes

---

## 📚 Alternative Installation Methods

### For Standard Installation (Manual)

⚠️ **Note**: Since Nexkit is a private repository, you need to provide the `.vsix` file. See [Private Repository & Authentication](#private-repository--authentication) for details.

**Windows (PowerShell - Administrator) with Local File:**
```powershell
# Option 1: Using local .vsix file
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexus-nexkit-vscode-3.0.0.vsix"

# Option 2: Using hosted URL (e.g., Azure Blob Storage)
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://yourstorage.blob.core.windows.net/nexkit/nexkit.vsix?sp=r&st=..."
```

### For Microsoft Intune Deployment

See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) for complete step-by-step instructions on deploying through Microsoft Intune.

### For Quick One-Click Install

See [QUICK-INSTALL.md](./QUICK-INSTALL.md) for a simplified installation using GitHub OAuth authentication.

## Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| **[QUICK-INSTALL.md](./QUICK-INSTALL.md)** | 🚀 **Quick installer with OAuth** | Copy-paste PowerShell block (recommended) |
| **install-vscode-with-nexkit.ps1** | Main installation script | `.\install-vscode-with-nexkit.ps1 [-InstallScope Machine\|User]` |
| **install-vscode-with-nexkit.bat** | Batch wrapper for installation | `install-vscode-with-nexkit.bat` |
| **detect-installation.ps1** | Detection script for Intune | Used by Intune for app detection |
| **uninstall-vscode-with-nexkit.ps1** | Uninstallation script | `.\uninstall-vscode-with-nexkit.ps1 [-UninstallVSCode]` |

## Important Notes

### Private Repository & Authentication

⚠️ **Nexkit is a private repository** - The GitHub API requires authentication to access releases.

Since the installation script cannot include authentication credentials directly, you have **three recommended approaches**:

#### Option 1: Use Local File (Recommended for Testing)
Download the `.vsix` file manually and use the `-VsixPath` parameter:

```powershell
# 1. Download the .vsix file from GitHub releases (requires GitHub login)
# 2. Install using local file
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexus-nexkit-vscode-3.0.0.vsix"
```

#### Option 2: Host on Internal Server (Recommended for Intune)
For enterprise deployment, host the `.vsix` file on an accessible server:

```powershell
# Azure Blob Storage (with SAS token)
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://yourstorage.blob.core.windows.net/nexkit/nexkit.vsix?sp=r&st=..."

# Internal web server
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://internal-server.company.com/packages/nexkit.vsix"

# File share (converted to UNC path)
.\install-vscode-with-nexkit.ps1 -VsixPath "\\fileserver\share\packages\nexkit.vsix"
```

#### Option 3: Include in Intune Package
Bundle the `.vsix` file directly in your Intune deployment package:

```powershell
# During Intune package creation, include the .vsix file
# Then use relative path in install command:
.\install-vscode-with-nexkit.ps1 -VsixPath ".\nexus-nexkit-vscode-3.0.0.vsix"
```

### Authentication with GitHub API (Advanced)

If you need to access the GitHub API directly, you'll need a Personal Access Token (PAT):

**Creating a GitHub Personal Access Token:**

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token" (classic)
3. Set scopes: Select `repo` (for private repositories)
4. Generate and copy the token

**Note**: The current installation script does not support passing authentication tokens. Use one of the three options above instead, or manually download releases using:

```powershell
# Example: Download release using authenticated API call
$token = "ghp_your_token_here"
$headers = @{
    'Authorization' = "Bearer $token"
    'Accept' = 'application/vnd.github.v3+json'
}
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/releases/latest" -Headers $headers
$vsixAsset = $release.assets | Where-Object { $_.name -like "*.vsix" }
Invoke-WebRequest -Uri $vsixAsset.browser_download_url -Headers $headers -OutFile "nexkit.vsix"

# Then install
.\install-vscode-with-nexkit.ps1 -VsixPath ".\nexkit.vsix"
```

### Recommended Approach for Intune Deployment

For automated enterprise deployment:

1. **Azure Blob Storage** (Recommended):
   - Upload `.vsix` file to Azure Blob Storage
   - Generate a SAS token with read permissions
   - Use `-VsixUrl` with the SAS URL in your Intune install command

2. **Internal Web Server**:
   - Host the `.vsix` file on your corporate web server
   - Use `-VsixUrl` with the internal URL
   - No authentication required if on corporate network

3. **Bundled in Package**:
   - Include the `.vsix` file in the Intune package
   - Use `-VsixPath` with relative path
   - Simplest but increases package size

## Installation Script

### Synopsis
Automates the installation of Visual Studio Code and Nexkit extension in an unattended manner.

### Parameters

- **`-InstallScope`**: `Machine` (default) or `User`
  - `Machine`: Installs for all users (requires administrator)
  - `User`: Installs for current user only

- **`-SkipVSCodeInstall`**: Skip VS Code installation (if already installed)

- **`-LogPath`**: Custom log file path (default: `%TEMP%\nexkit-install.log`)
⚠️ **Important**: All examples require either `-VsixPath` or `-VsixUrl` since the repository is private.

```powershell
# Machine-wide installation with local file (most common)
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexus-nexkit-vscode-3.0.0.vsix"

# User-only installation with local file
.\install-vscode-with-nexkit.ps1 -InstallScope User -VsixPath "C:\Downloads\nexus-nexkit-vscode-3.0.0.vsix"

# Only install Nexkit extension (VS Code already installed)
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall -VsixPath "C:\Downloads\nexus-nexkit-vscode-3.0.0.vsix"

# Use Azure Blob Storage with SAS token
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://yourstorage.blob.core.windows.net/nexkit/nexkit.vsix?sp=r&st=2026-02-09&se=..."

# Use internal web server
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://internal-server.company.com/packages/nexkit.vsix"

# Use UNC path to file share
.\install-vscode-with-nexkit.ps1 -VsixPath "\\fileserver\share\IT\VSCode\nexkit.vsix"

# Custom log location
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Downloads\nexkit.vsix"file
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

See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) f (required)
- Your hosted `.vsix` location - Azure Blob Storage, internal server, or file share (required for Nexkit)
- `https://api.github.com` - GitHub API (optional, only if not using `-VsixPath` or `-VsixUrl`)
- `https://github.com` - GitHub releases (optional, only if not using `-VsixPath` or `-VsixUrl`)

**Note**: For private repositories, direct GitHub API access requires authentication. Use `-VsixPath` or `-VsixUrl` instead.

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
InSince repository is private, GitHub API requires authentication
# Solution 1: Use local file instead
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\path\to\nexkit.vsix"

# Solution 2: Use hosted URL
.\install-vscode-with-nexkit.ps1 -VsixUrl "https://your-server.com/nexkit.vsix"

# Manual verification: Try installing extension directly
code --install-extension "C:\path\to\nexkit.vsix"

# Check if .vsix file is valid
Test-Path "C:\path\to\nexkit.vsix"  # Should return True

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
Get-Obtaining the .vsix File for Testing

Before testing, you need to get the `.vsix` file:

```powershell
# Option 1: Download from GitHub Releases (requires GitHub login)
# Go to: https://github.com/NexusInnovation/nexus-nexkit-vscode/releases
# Download the .vsix file manually

# Option 2: Build from source (if you have repository access)
cd ..\  # Navigate to repository root
npm install
npm run package
# This creates nexus-nexkit-vscode-X.Y.Z.vsix in the project root

# Copy to known location
Copy-Item "nexus-nexkit-vscode-*.vsix" -Destination "C:\Temp\nexkit.vsix"
```

### Testing Installation
```powershell
# Test with verbose output and local file
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Temp\nexkit.vsix" -Verbose

# Test user-scope installation (no admin needed)
.\install-vscode-with-nexkit.ps1 -InstallScope User -VsixPath "C:\Temp\nexkit.vsix"

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

## Related Documentation

- **[QUICK-INSTALL.md](./QUICK-INSTALL.md)** - One-step installation with GitHub OAuth (recommended for end users)
- **[GITHUB-OAUTH-APP-SETUP.md](./GITHUB-OAUTH-APP-SETUP.md)** - Configure the GitHub OAuth app for quick install
- **[INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md)** - Microsoft Intune deployment guide (for IT admins)
- **[TESTING.md](./TESTING.md)** - Testing procedures and validation
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history and release notes

## License

These scripts are part of the Nexkit project and are licensed under the MIT License.
