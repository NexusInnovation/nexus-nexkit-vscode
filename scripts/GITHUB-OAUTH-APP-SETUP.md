# GitHub OAuth App Setup Guide

This guide explains how to configure the GitHub OAuth App required for the [Quick Install](./QUICK-INSTALL.md) method.

## Overview

The quick installer uses **GitHub OAuth Device Flow** to authenticate users and download the Nexkit extension from the private repository. This requires a GitHub OAuth App to be registered in your organization.

### Current Configuration

- **Client ID**: `Ov23liLZ8FzcHXqvKFBh`
- **App Name**: Nexkit Installer
- **Authentication Method**: Device Flow
- **Required Scope**: `repo` (read access to private repositories)

## Prerequisites

- **Organization Owner/Admin** access to `NexusInnovation`
- Access to GitHub organization settings

## Setup Steps

### 1. Register the OAuth App

If the OAuth app doesn't exist yet, follow these steps:

1. Go to your organization settings:
   ```
   https://github.com/organizations/NexusInnovation/settings/applications
   ```

2. Click **"OAuth Apps"** in the left sidebar

3. Click **"New OAuth App"** (or "Register a new application")

4. Fill in the application details:
   ```
   Application name:        Nexkit Installer
   Homepage URL:            https://github.com/NexusInnovation/nexus-nexkit-vscode
   Application description: OAuth app for automated Nexkit VS Code extension installation
   Authorization callback URL: http://127.0.0.1
   ```

   > **Note**: The callback URL is not used in device flow but is required by GitHub. Use `http://127.0.0.1` as a placeholder.

5. Click **"Register application"**

6. After creation, note the **Client ID** (should match `Ov23liLZ8FzcHXqvKFBh`)

### 2. Enable Device Flow

Device Flow must be enabled for the app:

1. In the OAuth App settings page, scroll down to **"Device Authorization Flow"**

2. Check the box: **"Enable Device Flow"**

3. Click **"Update application"**

### 3. Configure Permissions

The app automatically requests `repo` scope during authentication. No additional configuration needed.

### 4. Verify Configuration

Test the OAuth app with this PowerShell snippet:

```powershell
# Test Device Flow authentication
$clientId = 'Ov23liLZ8FzcHXqvKFBh'
$response = Invoke-RestMethod -Uri 'https://github.com/login/device/code' -Method Post -Body @{
    client_id = $clientId
    scope = 'repo'
} -Headers @{ 'Accept' = 'application/json' }

if ($response.device_code) {
    Write-Host "✓ OAuth app is configured correctly!" -ForegroundColor Green
    Write-Host "  Device code: $($response.device_code)" -ForegroundColor Gray
    Write-Host "  User code: $($response.user_code)" -ForegroundColor Gray
} else {
    Write-Host "✗ OAuth app configuration error" -ForegroundColor Red
}
```

Expected output:
```
✓ OAuth app is configured correctly!
  Device code: 1234abcd...
  User code: ABCD-1234
```

## Updating the Client ID

If you need to use a different OAuth app:

### 1. Update the Quick Install Script

Edit [QUICK-INSTALL.md](./QUICK-INSTALL.md) and change the client ID:

```powershell
# Find this line:
$clientId = 'Ov23liLZ8FzcHXqvKFBh'

# Change to your new client ID:
$clientId = 'YOUR_NEW_CLIENT_ID'
```

### 2. Update This Documentation

Update the "Current Configuration" section at the top of this document.

### 3. Notify Users

Inform users to download the updated quick install script from the repository.

## Troubleshooting

### Error: "Application not found"

**Cause**: The OAuth app is not registered or client ID is incorrect.

**Solution**:
1. Go to organization OAuth Apps settings
2. Verify the client ID matches `Ov23liLZ8FzcHXqvKFBh`
3. If not, create a new app following Step 1 above

### Error: "Device flow not enabled"

**Cause**: Device Authorization Flow is not enabled for the app.

**Solution**:
1. Open the OAuth App settings
2. Check "Enable Device Flow"
3. Save changes

### Error: "Bad verification code"

**Cause**: User entered incorrect code or code expired (user codes expire after 15 minutes).

**Solution**:
- Re-run the installer to generate a new code
- Ensure code is entered correctly (case-sensitive)
- Complete authentication within 15 minutes

### Error: "Access token invalid"

**Cause**: Token expired or was revoked during installation.

**Solution**:
- Re-run the installer for a fresh token
- Check organization access policies (IP restrictions, etc.)

## Security Considerations

### Why Device Flow?

Device Flow is ideal for this use case because:
- ✅ No client secret required (secure for public scripts)
- ✅ User authorizes via browser (secure credential entry)
- ✅ Tokens are ephemeral (not stored)
- ✅ Works on any device with a browser

### Token Lifespan

- **User Code**: Expires in 15 minutes
- **Access Token**: Used only during installation, then discarded
- **Refresh Tokens**: Not used (single-use tokens)

### Permissions

The `repo` scope grants:
- Read access to private repository code and metadata
- Ability to download releases and assets

It does **NOT** grant:
- Write access to code
- Access to organization secrets
- Ability to modify repository settings

### Revoking Access

Users can revoke app access at any time:
1. Go to GitHub Settings → Applications
2. Find "Nexkit Installer" in Authorized OAuth Apps
3. Click "Revoke"

Revoking does not affect already-installed extensions.

## OAuth App Management

### Viewing Analytics

To see OAuth app usage:

1. Go to OAuth App settings
2. View "Traffic" and "Authorization" tabs
3. Monitor active tokens and user authorizations

### Rate Limiting

OAuth apps are subject to GitHub API rate limits:
- **Authenticated requests**: 5,000 per hour per user
- **Device flow**: 50 requests per hour per app

For installation, this means:
- Up to 50 simultaneous authentication flows per hour
- Up to 5,000 asset downloads per user per hour

If rate limits are exceeded:
- Authentication requests will fail with HTTP 403
- Users should wait and retry later
- Consider distributing .vsix via alternative methods (see [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md))

## Alternative Authentication Methods

If OAuth Device Flow doesn't work for your organization:

### Option 1: Personal Access Tokens (PAT)

Users can manually authenticate:

```powershell
$env:GITHUB_TOKEN = 'ghp_YourPersonalAccessToken'
# Then run the quick install script
```

**Pros**: Works with any organization policy  
**Cons**: Users must manually create tokens

### Option 2: Bundled .vsix

Package the .vsix file directly for distribution:
- See [INTUNE-DEPLOYMENT.md](./INTUNE-DEPLOYMENT.md)
- No authentication required
- Larger package size

### Option 3: Azure Blob Storage

Host the .vsix on Azure Blob Storage with SAS tokens:
- See [README.md](./README.md#option-2-azure-blob-storage)
- No GitHub authentication required
- Requires Azure subscription

## Support

For issues with OAuth app configuration:

1. **Check GitHub Status**: https://www.githubstatus.com/
2. **Review Organization Policies**: Ensure OAuth apps are allowed
3. **Test with Verification Script**: See "Verify Configuration" above
4. **Contact GitHub Support**: For organization-specific issues

---

**Related Documentation:**
- [Quick Install Guide](./QUICK-INSTALL.md) - End user instructions
- [Intune Deployment](./INTUNE-DEPLOYMENT.md) - Enterprise deployment
- [README](./README.md) - Main documentation
- [GitHub OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) - Official documentation
