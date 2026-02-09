# Quick Install - One-Liner for Nexkit

This guide provides a **simplified installation method** using a single copy-paste PowerShell command block.

## 🚀 Quick Install (Recommended)

### For End Users

Copy and paste this entire code block into **PowerShell (Run as Administrator)**:

```powershell
# Nexkit Quick Installer with GitHub OAuth Authentication
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Configuration
$clientId = 'Ov23liLZ8FzcHXqvKFBh'  # GitHub OAuth App for Nexkit Installer
$repo = 'NexusInnovation/nexus-nexkit-vscode'
$scope = 'repo'

try {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Nexkit Quick Installer" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    # Step 1: Initiate GitHub OAuth Device Flow
    Write-Host "[1/5] Initiating GitHub authentication..." -ForegroundColor Yellow
    $deviceAuth = Invoke-RestMethod -Uri 'https://github.com/login/device/code' -Method Post -Body @{
        client_id = $clientId
        scope = $scope
    } -Headers @{ 'Accept' = 'application/json' }
    
    # Display authentication instructions
    Write-Host "`n┌────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "│  GitHub Authentication Required        │" -ForegroundColor Green
    Write-Host "├────────────────────────────────────────┤" -ForegroundColor Green
    Write-Host "│                                        │" -ForegroundColor Green
    Write-Host "│  1. Open: " -NoNewline -ForegroundColor Green
    Write-Host "$($deviceAuth.verification_uri)" -ForegroundColor White -NoNewline
    Write-Host "        │" -ForegroundColor Green
    Write-Host "│  2. Enter code: " -NoNewline -ForegroundColor Green
    Write-Host "$($deviceAuth.user_code)" -ForegroundColor Yellow -NoNewline
    Write-Host "                 │" -ForegroundColor Green
    Write-Host "│                                        │" -ForegroundColor Green
    Write-Host "└────────────────────────────────────────┘" -ForegroundColor Green
    Write-Host ""
    
    # Open browser automatically
    Start-Process $deviceAuth.verification_uri
    
    # Step 2: Poll for authentication
    Write-Host "[2/5] Waiting for authentication..." -ForegroundColor Yellow
    $token = $null
    $interval = $deviceAuth.interval
    $expiresIn = $deviceAuth.expires_in
    $startTime = Get-Date
    
    while ($null -eq $token) {
        if (((Get-Date) - $startTime).TotalSeconds -gt $expiresIn) {
            throw "Authentication timeout. Please try again."
        }
        
        Start-Sleep -Seconds $interval
        
        try {
            $tokenResponse = Invoke-RestMethod -Uri 'https://github.com/login/oauth/access_token' -Method Post -Body @{
                client_id = $clientId
                device_code = $deviceAuth.device_code
                grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
            } -Headers @{ 'Accept' = 'application/json' }
            
            if ($tokenResponse.access_token) {
                $token = $tokenResponse.access_token
                Write-Host "✓ Authentication successful!" -ForegroundColor Green
            }
        } catch {
            # Continue polling
        }
    }
    
    # Step 3: Download .vsix file from private repository
    Write-Host "[3/5] Downloading Nexkit extension from private repository..." -ForegroundColor Yellow
    $headers = @{
        'Authorization' = "Bearer $token"
        'Accept' = 'application/vnd.github.v3+json'
        'User-Agent' = 'Nexkit-Installer/1.0'
    }
    
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
    $vsixAsset = $release.assets | Where-Object { $_.name -like '*.vsix' } | Select-Object -First 1
    
    if (-not $vsixAsset) {
        throw "No .vsix file found in latest release"
    }
    
    $tempDir = Join-Path $env:TEMP "nexkit-quickinstall-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $vsixPath = Join-Path $tempDir $vsixAsset.name
    
    # Download with authentication
    $downloadHeaders = @{
        'Authorization' = "Bearer $token"
        'Accept' = 'application/octet-stream'
        'User-Agent' = 'Nexkit-Installer/1.0'
    }
    Invoke-WebRequest -Uri $vsixAsset.url -Headers $downloadHeaders -OutFile $vsixPath
    
    Write-Host "✓ Downloaded: $($vsixAsset.name)" -ForegroundColor Green
    
    # Step 4: Download installation script
    Write-Host "[4/5] Downloading installation script..." -ForegroundColor Yellow
    $scriptUrl = "https://raw.githubusercontent.com/$repo/main/scripts/install-vscode-with-nexkit.ps1"
    
    # Try with token first (for private repo), fallback to public if needed
    try {
        $scriptContent = Invoke-RestMethod -Uri $scriptUrl -Headers @{
            'Authorization' = "Bearer $token"
            'Accept' = 'application/vnd.github.v3.raw'
        }
    } catch {
        $scriptContent = Invoke-RestMethod -Uri $scriptUrl
    }
    
    $scriptPath = Join-Path $tempDir 'install-vscode-with-nexkit.ps1'
    $scriptContent | Out-File -FilePath $scriptPath -Encoding UTF8
    
    Write-Host "✓ Installation script ready" -ForegroundColor Green
    
    # Step 5: Execute installation
    Write-Host "[5/5] Installing VS Code and Nexkit extension..." -ForegroundColor Yellow
    Write-Host ""
    
    & $scriptPath -VsixPath $vsixPath -InstallScope Machine
    
    # Cleanup
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  Installation Complete!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green
    
} catch {
    Write-Host "`n✗ Installation failed: $_" -ForegroundColor Red
    Write-Host "`nFor manual installation, see: https://github.com/$repo/tree/main/scripts`n" -ForegroundColor Yellow
    exit 1
}
```

### What This Does

1. **Authenticates with GitHub** - Opens your browser for secure OAuth login
2. **Downloads the extension** - Gets the latest `.vsix` from the private repository
3. **Downloads the installer** - Fetches the installation script
4. **Installs everything** - Runs the automated installation
5. **Cleans up** - Removes temporary files

### Requirements

- Windows 10/11
- PowerShell 5.1 or later
- Administrator privileges
- GitHub account with access to Nexkit repository
- Internet connection

### User Installation (No Admin Rights)

For user-scope installation (doesn't require administrator):

```powershell
# Same as above, but replace the execution line with:
& $scriptPath -VsixPath $vsixPath -InstallScope User
```

## 🔧 Alternative: Manual Installation

If the quick installer doesn't work, see [README.md](./README.md) for manual installation options.

## 🔐 Security Notes

### GitHub OAuth App

The installer uses a registered GitHub OAuth App:
- **Client ID**: `Ov23liLZ8FzcHXqvKFBh`
- **App Name**: Nexkit Installer
- **Permissions**: Read access to private repositories (repo scope)
- **No secrets required**: Device flow is designed for public clients

> ⚠️ **Important**: This OAuth app must be registered in your GitHub organization settings for the authentication to work. If you encounter errors like "Application not found" or authentication failures, contact your repository administrator to verify the OAuth app configuration.

### What Gets Access

The OAuth token is:
- ✅ **Temporary** - Only used during installation
- ✅ **Scoped** - Only has `repo` (read) access
- ✅ **Ephemeral** - Not stored anywhere
- ✅ **Revokable** - Can be revoked in GitHub settings

### Revoking Access

To revoke access after installation:

1. Go to https://github.com/settings/applications
2. Find "Nexkit Installer" in Authorized OAuth Apps
3. Click "Revoke"

## 🐛 Troubleshooting

### Authentication Timeout

**Problem**: Authentication expires before completing

**Solution**:
```powershell
# The device code expires in 15 minutes
# If you see timeout, just run the script again
```

### Private Repository Access Denied

**Problem**: "404 Not Found" when downloading .vsix

**Solution**:
- Ensure your GitHub account has access to the Nexkit repository
- Check that you completed the authentication in the browser
- Verify you're logged into the correct GitHub account

### PowerShell Execution Policy

**Problem**: "Cannot be loaded because running scripts is disabled"

**Solution**:
```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then run the installer again
```

### VS Code Already Installed

**Problem**: Don't want to reinstall VS Code

**Solution**: Modify the script execution line to skip VS Code:
```powershell
& $scriptPath -VsixPath $vsixPath -SkipVSCodeInstall
```

## 📋 What Gets Installed

- ✅ **Visual Studio Code** (latest stable version)
- ✅ **Nexkit Extension** (latest release from private repository)
- ✅ **VS Code CLI** added to PATH

## 🔄 Updating Nexkit

To update to the latest version, simply run the quick installer again. It will:
- Skip VS Code if already installed
- Update the Nexkit extension to the latest version

## 📚 For Enterprise/Intune Deployment

For enterprise deployment through Microsoft Intune:
- See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md)
- The quick installer is designed for individual users
- Enterprise deployments should bundle the .vsix file

## 💡 Tips

**Speed up installation**: If you have a GitHub Personal Access Token (PAT):
```powershell
# Set environment variable before running
$env:GITHUB_TOKEN = 'your_pat_here'

# Then the script can skip OAuth and use your PAT
# (Note: Script needs to be modified to support this)
```

**Offline installation**: Download the .vsix first:
```powershell
# Use the manual method instead
# See README.md for instructions
```

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review logs at: `%TEMP%\nexkit-install.log`
3. File an issue: https://github.com/NexusInnovation/nexus-nexkit-vscode/issues

## 📖 Additional Documentation

- [README.md](./README.md) - Complete documentation
- [GITHUB-OAUTH-APP-SETUP.md](./GITHUB-OAUTH-APP-SETUP.md) - Configure GitHub OAuth app (for admins)
- [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md) - Enterprise deployment
- [TESTING.md](./TESTING.md) - Testing procedures
