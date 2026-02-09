# Testing Guide for Nexkit Installation Scripts

This guide helps you test the installation scripts before deploying them through Microsoft Intune.

> **💡 Quick Install**: For a simpler installation method that handles authentication automatically, see [QUICK-INSTALL.md](./QUICK-INSTALL.md).

## Prerequisites

- Windows 10 1809 or later
- PowerShell 5.1 or later
- Administrator rights (for machine-wide installation)
- **A `.vsix` file for testing** - See "Getting the .vsix File" below

⚠️ **Important**: Nexkit is a private repository. You must obtain the `.vsix` file before testing.

## Getting the .vsix File

### Option 1: Download from GitHub Releases (Requires Access)
1. Navigate to https://github.com/NexusInnovation/nexus-nexkit-vscode/releases
2. Log in with your GitHub account that has access to the private repository
3. Download the latest `.vsix` file
4. Save to a known location (e.g., `C:\Temp\nexkit.vsix`)

### Option 2: Use Existing File in Repository
If you have a `.vsix` file in your repository root:

```powershell
# Copy the .vsix file to a test location
$vsixFiles = Get-ChildItem "..\nexus-nexkit-vscode-*.vsix" | Sort-Object LastWriteTime -Descending
if ($vsixFiles) {
    $latestVsix = $vsixFiles[0]
    Copy-Item $latestVsix.FullName -Destination "C:\Temp\nexkit.vsix"
    Write-Host "Copied $($latestVsix.Name) to C:\Temp\nexkit.vsix"
} else {
    Write-Host "No .vsix file found in repository root"
}
```

### Option 3: Build from Source
If you need to build the extension:

```powershell
# From the project root
cd ..
npm install
npm run package

# The .vsix file is created in the project root
# Copy it to your test location
Copy-Item "nexus-nexkit-vscode-*.vsix" -Destination "C:\Temp\nexkit.vsix"
```

##Testing Scenarios

> **💡 Quick Install Testing**: To test the automated OAuth installation, see the "Testing Quick Install" section below.

⚠️ **Note**: All test scenarios require the `-VsixPath` parameter since Nexkit is a private repository.

### Test 0: Quick Install Method (Recommended)

Test the automated installation with GitHub OAuth:

```powershell
# Copy the entire script block from QUICK-INSTALL.md
# Paste into PowerShell (Run as Administrator)
# Follow the browser authentication prompts

# Expected result:
# - Browser opens to github.com/login/device
# - You enter the displayed code
# - Installation proceeds automatically
# - VS Code and Nexkit are installed
```

**What to verify:**
- Authentication flow completes successfully
- .vsix file downloads from private repository
- Installation completes without errors
- Detection script returns exit code 0
- Extension is visible in VS Code

### Test 1: User-Scope Installation with Local File

This test doesn't require administrator rights:

```powershell
cd scripts

# Verify .vsix file exists
if (-not (Test-Path "C:\Temp\nexkit.vsix")) {
    Write-Host "ERROR: .vsix file not found. See 'Getting the .vsix File' section." -ForegroundColor Red
    exit
}

# Test installation
.\install-vscode-with-nexkit.ps1 -InstallScope User -VsixPath "C:\Temp\nexkit.vsix" -Verbose

# Verify installation
code --list-extensions | Select-String "nexkit"

# Test detection
.\detect-installation.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Detection successful" -ForegroundColor Green
} else {Local File

**Requires Administrator PowerShell:**

```powershell
cd scripts

# Verify .vsix file exists
if (-not (Test-Path "C:\Temp\nexkit.vsix")) {
    Write-Host "ERROR: .vsix file not found at C:\Temp\nexkit.vsix" -ForegroundColor Red
    exit
}

# Test machine-wide installation
.\install-vscode-with-nexkit.ps1 -InstallScope Machine -VsixPath "C:\Temp\nexkit.vsix" -Verbose

# Verify installation
.\detect-installation.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Installation successful" -ForegroundColor Green
}
# Option B: Use a file share: \\server\share\nexkit.vsix
# Option C: Upload to Azure Blob Storage or similar

# Example with direct file path (converted to file:/// URL)
$vsixPath = Resolve-Path "C:\Temp\nexkit.vsix"
$fileUrl = "file:///$($vsixPath.Path.Replace('\', '/'))"
Azure Blob Storage URL (Advanced)

If you've uploaded the `.vsix` to Azure Blob Storage:

```powershell
cd scripts
### Test 4: Skip VS Code Installation

If VS Code is already installed:

```powershell
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall -VsixPath "C:\Temp\nexkit.vsix" -Verbose
```

### Test 5

### Test 4: 
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

### Test 5: Detection Script Only

```powershell
# Run detection
.\detect-installation.ps1

# Check exit code
Write-Host "Exit code: $LASTEXITCODE"

# 0 = Detected (both VS Code and Nexkit installed)
# 1 = Not detected (missing VS Code or Nexkit)
```

### Test 6

### Test 5: Uninstallation

```powershell
# Remove extension only
.\uninstall-vscode-with-nexkit.ps1 -Verbose

# Remove extension and VS Code
.\uninstall-vscode-with-nexkit.ps1 -UninstallVSCode -Verbose
```

## Testing Quick Install Script

### Test the OAuth Flow

Test the complete quick install process:

```powershell
# 1. Save the quick install script to a file for testing
$quickInstallScript = Get-Content ..\QUICK-INSTALL.md -Raw
# Extract the PowerShell code block between ```powershell and ```
$pattern = '(?s)```powershell\s*(.*?)\s*```'
if ($quickInstallScript -match $pattern) {
    $scriptBlock = $matches[1]
    $scriptBlock | Out-File -FilePath "C:\Temp\test-quick-install.ps1" -Encoding UTF8
}

# 2. Run the script
& "C:\Temp\test-quick-install.ps1"

# 3. Expected behavior:
#    - Shows GitHub device code
#    - Opens browser automatically
#    - Waits for authentication
#    - Downloads .vsix from private repo
#    - Installs VS Code and extension
#    - Cleans up temporary files

# 4. Verify installation
.\detect-installation.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Quick install successful!" -ForegroundColor Green
}
```

### Test OAuth Timeout

Test behavior when authentication times out:

```powershell
# Run the quick install script but don't complete authentication
# Expected: Script should timeout after ~15 minutes with clear error message
```

### Test Token Validation

Test that invalid tokens are handled gracefully:

```powershell
# This would require modifying the script temporarily
# Verify that:
# - Invalid tokens result in clear error messages
# - 404 errors are handled (repo access issues)
# - Network errors are caught and reported
```

## Testing Checklist

Before deploying through Intune, verify:

- [ ] **Quick Install** works end-to-end
- [ ] OAuth authentication flow completes successfully  
- [ ] .vsix downloads from private repository with token
- [ ] VS Code installs successfully
- [ ] Nexkit extension installs successfully
- [ ] Detection script returns exit code 0 after installation
- [ ] Extension appears in VS Code (`code --list-extensions`)
- [ ] Extension functions correctly (open VS Code and check)
- Verify .vsix file is available
$vsixPath = "C:\Temp\nexkit.vsix"
if (-not (Test-Path $vsixPath)) {
    Write-Host "Please copy .vsix file to $vsixPath" -ForegroundColor Red
    exit
}

# Check current state
code --version  # Should not find VS Code
.\detect-installation.ps1  # Should return 1

# Install
.\install-vscode-with-nexkit.ps1 -VsixPath $vsixPath

# Verify
.\detect-installation.ps1  # Should return 0
code --list-extensions | Select-String "nexkit"  # Should show Nexkit
```

### Scenario 2: VS Code Already Installed
Target: Machine with VS Code but no Nexkit

```powershell
# Verify VS Code exists
code --version  # Should show version

# Verify .vsix file
$vsixPath = "C:\Temp\nexkit.vsix"
if (-not (Test-Path $vsixPath)) {
    Write-Host "Please copy .vsix file to $vsixPath" -ForegroundColor Red
    exit
}

# Install only extension
.\install-vscode-with-nexkit.ps1 -SkipVSCodeInstall -VsixPath $vsixPath

# Verify
.\detect-installation.ps1  # Should return 0
```

### Scenario 3: Reinstallation
Target: Machine with both VS Code and Nexkit (upgrade scenario)

```powershell
# Verify new .vsix file
$vsixPath = "C:\Temp\nexkit-new-version.vsix"
if (-not (Test-Path $vsixPath)) {
    Write-Host "Please copy new .vsix file to $vsixPath" -ForegroundColor Red
    exit
}

# Force reinstall
.\install-vscode-with-nexkit.ps1 -VsixPath $vsixPatht.vsix"

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
VS Code download
Invoke-WebRequest -Uri "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64" -Method Head

# Note: GitHub API test not applicable for private repositories without authentication
# Instead, verify .vsix file is accessible
Test-Path "C:\Temp\nexkit.vsix"  # Should return True

# If using Azure Blob Storage, test the URL
$blobUrl = "https://yourstorage.blob.core.windows.net/nexkit/nexkit.vsix?sp=r&st=..."
if ($blobUrl -ne "https://yourstorage...") {
    Invoke-WebRequest -Uri $blobUrl -Method Head
}
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
code --list-ex and .vsix file
Copy-Item ".\install-vscode-with-nexkit.ps1" -Destination $testDir
Copy-Item ".\detect-installation.ps1" -Destination $testDir
Copy-Item ".\uninstall-vscode-with-nexkit.ps1" -Destination $testDir

# *** IMPORTANT: Copy the .vsix file ***
if (Test-Path "C:\Temp\nexkit.vsix") {
    Copy-Item "C:\Temp\nexkit.vsix" -Destination "$testDir\nexkit.vsix"
} else {
    Write-Host "ERROR: .vsix file not found at C:\Temp\nexkit.vsix" -ForegroundColor Red
    Write-Host "Please copy the .vsix file before running this test" -ForegroundColor Yellow
    exit
}

# Verify all files are present
Write-Host "`nFiles in test directory:" -ForegroundColor Cyan
Get-ChildItem $testDir | Format-Table Name, Length
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
# Verify .vsix file exists
$vsixPath = "C:\Temp\nexkit.vsix"
if (-not (Test-Path $vsixPath)) {
    Write-Host "ERROR: .vsix file not found at $vsixPath" -ForegroundColor Red
    exit
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

.\install-vscode-with-nexkit.ps1 -VsixPath $vsixPath
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
