# Microsoft Intune Deployment Guide for Nexkit

This guide provides step-by-step instructions for deploying Visual Studio Code with the Nexkit extension through Microsoft Intune as a Win32 app.

## Overview

The deployment package includes:
- **Installation Script**: Installs VS Code and Nexkit extension
- **Detection Script**: Verifies successful installation
- **Uninstallation Script**: Removes Nexkit and optionally VS Code

## Prerequisites

### Required Tools
1. **Microsoft Win32 Content Prep Tool**
   - Download: https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool
   - Used to create `.intunewin` packages

2. **Microsoft Intune Admin Access**
   - Global Administrator or Intune Administrator role
   - Access to Microsoft Intune admin center

3. **PowerShell 5.1 or later**

### Files Required
- `install-vscode-with-nexkit.ps1` - Main installation script
- `detect-installation.ps1` - Detection script
- `uninstall-vscode-with-nexkit.ps1` - Uninstallation script

## Step 1: Prepare the Package

### 1.1 Create Package Directory Structure

```powershell
# Create a deployment folder
$deploymentFolder = "C:\IntunePackages\Nexkit"
New-Item -ItemType Directory -Path $deploymentFolder -Force

# Copy scripts
Copy-Item ".\install-vscode-with-nexkit.ps1" -Destination $deploymentFolder
Copy-Item ".\detect-installation.ps1" -Destination $deploymentFolder
Copy-Item ".\uninstall-vscode-with-nexkit.ps1" -Destination $deploymentFolder
```

### 1.2 Create the .intunewin Package

```powershell
# Download Win32 Content Prep Tool if not already downloaded
$prepToolUrl = "https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe"
$prepToolPath = "C:\IntunePackages\IntuneWinAppUtil.exe"

if (-not (Test-Path $prepToolPath)) {
    Invoke-WebRequest -Uri $prepToolUrl -OutFile $prepToolPath
}

# Create .intunewin package
$sourceFolder = $deploymentFolder
$setupFile = "install-vscode-with-nexkit.ps1"
$outputFolder = "C:\IntunePackages\Output"

& $prepToolPath -c $sourceFolder -s $setupFile -o $outputFolder -q

# The output will be: Nexkit.intunewin in the output folder
```

## Step 2: Upload to Microsoft Intune

### 2.1 Access Intune Admin Center
1. Go to https://intune.microsoft.com
2. Navigate to **Apps** > **Windows** > **Add**
3. Select **Windows app (Win32)**

### 2.2 App Information
1. Click **Select app package file**
2. Upload the `.intunewin` file created in Step 1.2
3. Fill in the app information:
   - **Name**: `Nexkit for VS Code`
   - **Description**: `Visual Studio Code with Nexkit extension for AI-powered development workflows`
   - **Publisher**: `Nexus Innovation`
   - **App Version**: (Get from latest GitHub release, e.g., `3.0.0`)
   - **Category**: Developer tools
   - **Show this as a featured app in the Company Portal**: Optional
   - **Information URL**: `https://github.com/NexusInnovation/nexus-nexkit-vscode`
   - **Privacy URL**: (Your privacy policy URL if applicable)
   - **Developer**: `Nexus Innovation`
   - **Owner**: (Your organization name)
   - **Notes**: Optional deployment notes

### 2.3 Program Configuration

**Install command:**
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-vscode-with-nexkit.ps1 -InstallScope Machine
```

**Uninstall command:**
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\uninstall-vscode-with-nexkit.ps1
```

**Install behavior:**
- Select: `System` (for machine-wide installation)
- Or: `User` (if deploying per-user)

**Device restart behavior:**
- Select: `Determine behavior based on return codes`

### 2.4 Requirements

Configure minimum requirements for target devices:

- **Operating system architecture**: 64-bit
- **Minimum operating system**: Windows 10 1809 or later
- **Disk space required**: 500 MB
- **Physical memory required**: N/A
- **Minimum number of logical processors required**: N/A
- **Minimum CPU speed required**: N/A

**Additional requirement rules** (optional):
- Registry requirements
- File system requirements
- Script-based requirements

### 2.5 Detection Rules

**Detection rule format:**
- Select: **Use a custom detection script**

**Script file:**
- Upload: `detect-installation.ps1`

**Run script as 32-bit process on 64-bit clients:**
- Select: **No**

**Enforce script signature check:**
- Select: **No** (unless you sign your scripts)

### 2.6 Dependencies
- None required (script handles all dependencies)

### 2.7 Supersedence
- Configure if you're replacing an older version

### 2.8 Assignments

**Required** (Auto-install):
- Select device groups or user groups that should automatically receive the app
- Example: "Developers" group, "Engineering" group

**Available for enrolled devices**:
- Select groups that can manually install from Company Portal
- Example: "All Users" group

**Uninstall**:
- Select groups from which the app should be removed

**Notifications:**
- Configure end-user notifications:
  - Show all toast notifications
  - Show toast notifications for computer restarts
  - Hide all toast notifications

## Step 3: Configure Return Codes

Add custom return codes for proper detection:

| Return Code | Code Type | Description |
|-------------|-----------|-------------|
| 0 | Success | Installation completed successfully |
| 1 | Hard reboot | VS Code installation requires restart |
| 2 | Failed | Nexkit download failed |
| 3 | Failed | Nexkit installation failed |
| 4 | Failed | VS Code not found after installation |
| 5 | Failed | Prerequisites not met (e.g., not administrator) |
| 1707 | Success | Already installed |
| 3010 | Soft reboot | Installation success, reboot recommended |

## Step 4: Monitor Deployment

### 4.1 Check Deployment Status
1. Go to **Apps** > **Windows apps**
2. Select **Nexkit for VS Code**
3. Click **Device install status** or **User install status**

### 4.2 View Installation Logs on Client Devices

**Intune Management Extension Logs:**
```
C:\ProgramData\Microsoft\IntuneManagementExtension\Logs\
```

**Nexkit Installation Logs:**
```
%TEMP%\nexkit-install.log
```

**Check logs using PowerShell:**
```powershell
# View installation log
Get-Content "$env:TEMP\nexkit-install-*.log" | Select-Object -Last 50

# View Intune logs
Get-Content "C:\ProgramData\Microsoft\IntuneManagementExtension\Logs\IntuneManagementExtension.log" | Select-String "Nexkit"
```

## Step 5: Troubleshooting

### Common Issues and Solutions

#### Issue: "VS Code installation failed"
**Solution:**
- Check if device has internet connectivity
- Verify Windows Installer service is running
- Check if previous VS Code installation is corrupted
- Try manual installation first to identify issues

#### Issue: "Nexkit extension installation failed"
**Solution:**
- Verify GitHub API is accessible from the device
- Check if VS Code CLI is in PATH
- Ensure `.vsix` file downloads successfully
- Manually test: `code --install-extension path\to\nexkit.vsix`

#### Issue: Detection script always fails
**Solution:**
- Run detection script manually: `.\detect-installation.ps1`
- Check VS Code installation path
- Verify extension ID matches: `code --list-extensions`
- Review detection script exit codes

#### Issue: Installation succeeds but app not detected
**Solution:**
- Ensure detection script has correct extension ID
- Wait for Intune sync cycle (can take up to 8 hours)
- Force sync: Settings > Accounts > Access work or school > Sync
- Check detection script logs

### Manual Testing

Test the installation manually before deploying:

```powershell
# Test installation
.\install-vscode-with-nexkit.ps1 -InstallScope User -Verbose

# Test detection
.\detect-installation.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Detection successful" -ForegroundColor Green
} else {
    Write-Host "Detection failed" -ForegroundColor Red
}

# Test uninstallation
.\uninstall-vscode-with-nexkit.ps1 -Verbose
```

## Advanced Configuration

### User-Scope Installation
For per-user installations instead of machine-wide:

**Install command:**
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-vscode-with-nexkit.ps1 -InstallScope User
```

**Install behavior:** Select `User`

### Skip VS Code Installation
If VS Code is already deployed separately:

**Install command:**
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall
```

### Silent Mode with Custom Log Path

**Install command:**
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-vscode-with-nexkit.ps1 -InstallScope Machine -LogPath "C:\Windows\Temp\nexkit-install.log"
```

## Best Practices

1. **Test in Pilot Group First**
   - Deploy to a small test group
   - Validate installation and detection
   - Gather feedback before broad rollout

2. **Schedule Deployment**
   - Use maintenance windows for required installations
   - Avoid business hours for large deployments

3. **Monitor Compliance**
   - Set up regular reports for installation status
   - Track failures and act on them promptly

4. **Keep Package Updated**
   - Monitor Nexkit releases on GitHub
   - Update Intune package when new versions are released
   - Use supersedence to upgrade existing installations

5. **Document Configuration**
   - Keep records of deployment settings
   - Document any customizations made
   - Maintain runbook for troubleshooting

## Security Considerations

1. **Script Signing**
   - Consider signing PowerShell scripts with a code signing certificate
   - Enable script signature enforcement in Intune if using signed scripts

2. **Least Privilege**
   - Use System context only when necessary
   - Prefer User context for per-user installations

3. **Network Security**
   - Ensure corporate firewall allows access to:
     - `https://code.visualstudio.com` (VS Code download)
     - `https://api.github.com` (GitHub releases API)
     - `https://github.com` (Nexkit extension download)

4. **Audit Logging**
   - Enable audit logging for Intune app deployments
   - Review installation logs regularly

## Support and Resources

- **Nexkit Repository**: https://github.com/NexusInnovation/nexus-nexkit-vscode
- **Intune Documentation**: https://docs.microsoft.com/en-us/mem/intune/
- **Win32 App Management**: https://docs.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management

## Appendix: Quick Reference Commands

### Package Creation
```powershell
IntuneWinAppUtil.exe -c "C:\IntunePackages\Nexkit" -s "install-vscode-with-nexkit.ps1" -o "C:\IntunePackages\Output"
```

### Manual Installation
```powershell
.\install-vscode-with-nexkit.ps1 -InstallScope Machine
```

### Manual Detection
```powershell
.\detect-installation.ps1
```

### Manual Uninstallation
```powershell
.\uninstall-vscode-with-nexkit.ps1
```

### Check Extension
```powershell
code --list-extensions | Select-String "nexkit"
```
