# Manifest Solution for Nexkit Repository

## Problem Summary

The nexkit-vscode extension's `fetchManifest()` function attempts to retrieve a `manifest.json` file from the nexkit repository at:

```text
https://raw.githubusercontent.com/NexusInnovation/nexkit/v0.0.30/manifest.json
```

However, this file doesn't exist, resulting in a 404 error that breaks the template update mechanism.

## Solution Provided

This directory contains a complete solution for generating and maintaining manifest files in the nexkit repository. The manifest provides critical metadata for the VS Code extension, including:

- Release version and date
- Changelog URLs
- Minimum extension version requirements
- Template catalog with download URLs
- Recommended templates for different AI assistants

## What's Included

### 1. **manifest.example.json**

A complete example showing the expected manifest structure with all required fields and optional enhancements.

### 2. **generate-manifest.yml**

A GitHub Actions workflow that automatically generates the manifest when a new release is published in the nexkit repository. This ensures every future release will have a proper manifest.

**Key Features:**

- Triggers automatically on release publication
- Parses all template ZIP assets
- Generates comprehensive manifest
- Creates a PR to merge manifest into main branch
- Zero manual intervention required

### 3. **generate-manifest-retroactive.ps1**

A PowerShell script for generating manifests for existing releases that don't have one yet.

**Usage:**

```powershell
.\generate-manifest-retroactive.ps1 -Version "v0.0.30"
```

**Output:**

- Creates a `manifest.json` file
- Includes all templates from the release
- Provides step-by-step instructions for committing

### 4. **README.md**

Complete documentation covering:

- Installation instructions
- How the automated workflow works
- Retroactive manifest creation
- Troubleshooting guide
- Future enhancement suggestions

## Quick Start

### For New Releases (Automated)

1. Copy `generate-manifest.yml` to the nexkit repository:

   ```bash
   cp generate-manifest.yml <nexkit-repo>/.github/workflows/
   git add .github/workflows/generate-manifest.yml
   git commit -m "Add automated manifest generation"
   git push
   ```

2. Publish a new release - the manifest will be generated automatically!

### For Existing Releases (Manual)

1. Run the PowerShell script:

   ```powershell
   .\generate-manifest-retroactive.ps1 -Version "v0.0.30"
   ```

2. Follow the on-screen instructions to commit the manifest to the nexkit repository

## Manifest Structure

The manifest includes:

```json
{
  "version": "0.0.30",
  "releaseDate": "2025-10-27T15:42:26Z",
  "changelogUrl": "https://github.com/NexusInnovation/nexkit/releases/tag/v0.0.30",
  "minExtensionVersion": "0.3.0",
  "templates": {
    "copilot-ps": {
      "name": "GitHub Copilot (PowerShell)",
      "platform": "windows",
      "shell": "powershell",
      "downloadUrl": "https://github.com/.../nexkit-template-copilot-ps-v0.0.30.zip",
      "size": 49259
    }
    // ... 23 more templates
  },
  "downloadUrl": "https://github.com/.../nexkit-template-copilot-ps-v0.0.30.zip",
  "recommended": {
    "copilot": "copilot-ps",
    "claude": "claude-ps"
  }
}
```

## How the Extension Uses the Manifest

The nexkit-vscode extension (v0.3.0+) uses the manifest to:

1. **Check Compatibility** - Verifies `minExtensionVersion` before updating
2. **Show Changelog** - Provides link to release notes via `changelogUrl`
3. **Download Templates** - Uses `downloadUrl` to fetch the correct template package
4. **Display Information** - Shows version and release date in update prompts

## Benefits

✅ **Automated** - No manual manifest creation for future releases  
✅ **Comprehensive** - Includes all 24 template variants (PowerShell + Bash for 12 AI tools)  
✅ **Versioned** - Each release has its own manifest at the tagged version  
✅ **Extensible** - Easy to add new fields or metadata in the future  
✅ **Backward Compatible** - Can retroactively add manifests to old releases

## Next Steps

1. **Review the files** in this directory
2. **Test the PowerShell script** with `v0.0.30` to verify it works
3. **Add the workflow** to the nexkit repository
4. **Create manifests** for existing releases using the PowerShell script
5. **Publish a test release** to verify the automation works

## Questions or Issues?

Refer to the detailed `README.md` in this directory, or contact the nexkit-vscode extension maintainers.
