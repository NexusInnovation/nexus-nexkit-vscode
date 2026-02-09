# Testing Guide for Nexkit Installation Scripts

This guide helps you test the installation scripts before deploying them through Microsoft Intune.

## Prerequisites

- Windows 10 1809 or later
- PowerShell 5.1 or later
- Administrator rights (for machine-wide installation)
- A `.vsix` file for testing (see options below)

## Getting the .vsix File

### Option 1: Use Local File
If you have a `.vsix` file in your repository:

```powershell
# Copy the .vsix file to a test location
Copy-Item "..\nexus-nexkit-vscode-*.vsix" -Destination "C:\Temp\nexkit.vsix"
```

### Option 2: Build from Source
If you need to build the extension:

```powershell
# From the project root
npm install
npm run package
```

This creates a `.vsix` file in the project root.

### Option 3: Download from Release (if available)
Once releases are published, you can download directly from GitHub releases.

##Testing Scenarios

### Test 1: User-Scope Installation with Local File

This test doesn't require administrator rights:

```powershell
cd scripts

# Test installation
.\install-vscode-with-nexkit.ps1 -InstallScope User -VsixPath "C:\Temp\nexkit.vsix" -Verbose

# Verify installation
code --list-extensions | Select-String "nexkit"

# Test detection
.\detect-installation.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Detection successful" -ForegroundColor Green
} else {
    Write-Host "✗ Detection failed" -ForegroundColor Red
}

# View logs
Get-Content "$env:TEMP\nexkit-install-*.log" | Select-Object -Last 20
```

### Test 2: Machine-Wide Installation with Direct URL

**Requires Administrator PowerShell:**

```powershell
cd scripts

# Host the .vsix file locally (for testing)
# Option A: Use a local web server
# Option B: Use a file share: \\server\share\nexkit.vsix
# Option C: Upload to Azure Blob Storage or similar

# Example with direct file path (converted to file:/// URL)
$vsixPath = Resolve-Path "C:\Temp\nexkit.vsix"
$fileUrl = "file:///$($vsixPath.Path.Replace('\', '/'))"

.\install-vscode-with-nexkit.ps1 -InstallScope Machine -VsixUrl $fileUrl -Verbose
```

### Test 3: Skip VS Code Installation

If VS Code is already installed:

```powershell
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall -VsixPath "C:\Temp\nexkit.vsix" -Verbose
```

### Test 4: Detection Script Only

```powershell
# Run detection
.\detect-installation.ps1

# Check exit code
Write-Host "Exit code: $LASTEXITCODE"

# 0 = Detected (both VS Code and Nexkit installed)
# 1 = Not detected (missing VS Code or Nexkit)
```

### Test 5: Uninstallation

```powershell
# Remove extension only
.\uninstall-vscode-with-nexkit.ps1 -Verbose

# Remove extension and VS Code
.\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode -Verbose
```

## Testing Checklist

Before deploying through Intune, verify:

- [ ] VS Code installs successfully
- [ ] Nexkit extension installs successfully
- [ ] Detection script returns exit code 0 after installation
- [ ] Extension appears in VS Code (`code --list-extensions`)
- [ ] Extension functions correctly (open VS Code and check)
- [ ] Uninstallation works correctly
- [ ] Detection script returns exit code 1 after uninstallation
- [ ] Logs are created and contain useful information
- [ ] Exit codes are correct for each scenario

## Common Test Scenarios

### Scenario 1: Fresh Installation
Target: Machine without VS Code or Nexkit

```powershell
# Check current state
code --version  # Should not find VS Code
.\detect-installation.ps1  # Should return 1

# Install
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Temp\nexkit.vsix"

# Verify
.\detect-installation.ps1  # Should return 0
code --list-extensions | Select-String "nexkit"  # Should show Nexkit
```

### Scenario 2: VS Code Already Installed
Target: Machine with VS Code but no Nexkit

```powershell
# Verify VS Code exists
code --version  # Should show version

# Install only extension
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall -VsixPath "C:\Temp\nexkit.vsix"

# Verify
.\detect-installation.ps1  # Should return 0
```

### Scenario 3: Reinstallation
Target: Machine with both VS Code and Nexkit (upgrade scenario)

```powershell
# Force reinstall
.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Temp\nexkit-new-version.vsix"

# VS Code will skip (already installed)
# Extension will be force-updated
```

## Troubleshooting Tests

### View Logs
```powershell
# Installation logs
Get-Content "$env:TEMP\nexkit-install-*.log"

# Filter for errors
Get-Content "$env:TEMP\nexkit-install-*.log" | Select-String "ERROR"

# Show last 30 lines
Get-Content "$env:TEMP\nexkit-install-*.log" | Select-Object -Last 30
```

### Check VS Code Installation
```powershell
# Check if VS Code is in PATH
Get-Command code

# Check VS Code version
code --version

# List all extensions
code --list-extensions

# Check specific extension
code --list-extensions | Where-Object { $_ -match "nexkit|nexusinnovation" }
```

### Test Network Connectivity
```powershell
# Test GitHub API (for when repository is public)
Invoke-RestMethod -Uri "https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode" -Method Head

# Test VS Code download
Invoke-WebRequest -Uri "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64" -Method Head
```

### Verify File Permissions
```powershell
# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Running as Administrator: $isAdmin"
```

## Simulating Intune Install

To simulate an Intune deployment locally:

```powershell
# Create a test directory
$testDir = "C:\IntuneTest"
New-Item -ItemType Directory -Path $testDir -Force

# Copy scripts
Copy-Item ".\install-vscode-with-nexkit.ps1" -Destination $testDir
Copy-Item ".\detect-installation.ps1" -Destination $testDir
Copy-Item ".\uninstall-vscode-with-nexkit.ps1" -Destination $testDir
Copy-Item "C:\Temp\nexkit.vsix" -Destination $testDir

# Run as Intune would (elevated, with specific parameters)
Start-Process PowerShell -Verb RunAs -ArgumentList @"
    -ExecutionPolicy Bypass
    -File '$testDir\install-vscode-with-nexkit.ps1'
    -InstallScope Machine
    -VsixPath '$testDir\nexkit.vsix'
    -LogPath '$testDir\install.log'
"@

# Wait for completion
Start-Sleep -Seconds 30

# Check detection
& "$testDir\detect-installation.ps1"
Write-Host "Detection exit code: $LASTEXITCODE"

# View log
Get-Content "$testDir\install.log"
```

## Performance Testing

Measure installation time:

```powershell
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

.\install-vscode-with-nexkit.ps1 -VsixPath "C:\Temp\nexkit.vsix"

$stopwatch.Stop()
Write-Host "`nInstallation completed in: $($stopwatch.Elapsed.TotalSeconds) seconds"
```

## Cleanup After Testing

```powershell
# Remove Nexkit extension
.\uninstall-vscode-with-nexkit.ps1

# Remove logs
Remove-Item "$env:TEMP\nexkit-*.log" -Force -ErrorAction SilentlyContinue

# Optionally remove VS Code
.\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode
```

## Expected Results

### Successful Installation
- Exit code: `0`
- Log contains: "Installation completed successfully"
- Detection returns: `0`
- VS Code and extension are functional

### Failed Installation
- Exit code: Non-zero (1-5 depending on failure type)
- Log contains: Detailed error message
- Detection returns: `1`

### Exit Code Reference

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | VS Code installation failed |
| 2 | Nexkit download failed |
| 3 | Nexkit installation failed |
| 4 | VS Code not found after installation |
| 5 | Prerequisites not met (e.g., not administrator) |

## Integration Testing for Intune

Before creating the `.intunewin` package:

1. Test on a clean VM or test machine
2. Test with both user and machine scope
3. Test network conditions (simulate corporate proxy if applicable)
4. Test with existing VS Code installation
5. Test detection script reliability
6. Test uninstallation
7. Verify no leftover files after uninstall
8. Test upgrade scenario (install old version, then new version)

## Next Steps

Once local testing is successful:
1. Review [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) for Intune packaging
2. Create `.intunewin` package with Win32 Content Prep Tool
3. Upload to Intune
4. Deploy to test group
5. Monitor and validate
6. Roll out to production

## Additional Resources

- VS Code CLI documentation: https://code.visualstudio.com/docs/editor/command-line
- PowerShell exit codes: https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_return
- Intune Win32 app management: https://docs.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management
