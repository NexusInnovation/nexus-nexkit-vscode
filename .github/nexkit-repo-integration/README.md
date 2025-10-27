# Nexkit Repository Manifest Integration Guide

This directory contains resources for adding manifest.json generation to the NexusInnovation/nexkit repository.

## Overview

The nexkit-vscode extension expects a `manifest.json` file to be available at the repository root for each release. This manifest provides metadata about the release, template information, and compatibility requirements.

## Problem

Currently, the nexkit repository releases individual template ZIP files (e.g., `nexkit-template-copilot-ps-v0.0.30.zip`) but no `manifest.json` file. This causes the extension's update mechanism to fail when trying to fetch:

```text
https://raw.githubusercontent.com/NexusInnovation/nexkit/v0.0.30/manifest.json
```

## Solution

Add automated manifest generation to the nexkit repository using GitHub Actions.

## Implementation Steps

### 1. Add GitHub Actions Workflow

Copy the `generate-manifest.yml` workflow to the nexkit repository:

```bash
# In the nexkit repository
mkdir -p .github/workflows
cp generate-manifest.yml <nexkit-repo>/.github/workflows/
```

**Location:** `.github/workflows/generate-manifest.yml`

### 2. How It Works

The workflow automatically triggers when a new release is published:

1. **Triggers on release publish** - Listens for the `release.published` event
2. **Analyzes release assets** - Scans for template ZIP files matching the pattern:
   - `nexkit-template-{ai-tool}-{shell}-v{version}.zip`
   - Examples: `copilot-ps`, `claude-sh`, `cursor-ps`
3. **Generates manifest.json** - Creates a structured JSON file with:
   - Release version and date
   - Changelog URL
   - Minimum extension version requirement
   - Template catalog with download URLs
   - Recommended templates per AI assistant
4. **Commits to release branch** - Creates a branch and commits the manifest
5. **Creates pull request** - Opens PR to merge manifest into main branch

### 3. Manifest Structure

The generated `manifest.json` follows this schema:

```json
{
  "version": "0.0.30",
  "releaseDate": "2025-01-15T10:30:00Z",
  "changelogUrl": "https://github.com/NexusInnovation/nexkit/releases/tag/v0.0.30",
  "minExtensionVersion": "0.3.0",
  "templates": {
    "copilot-ps": {
      "name": "GitHub Copilot (PowerShell)",
      "description": "Nexkit templates optimized for GitHub Copilot with PowerShell scripts",
      "platform": "windows",
      "shell": "powershell",
      "downloadUrl": "https://github.com/.../nexkit-template-copilot-ps-v0.0.30.zip",
      "size": 1024000
    }
  },
  "downloadUrl": "https://github.com/.../nexkit-template-copilot-ps-v0.0.30.zip",
  "recommended": {
    "copilot": "copilot-ps",
    "claude": "claude-ps"
  }
}
```

See `manifest.example.json` for a complete example.

### 4. Extension Configuration

The extension needs to know the minimum compatible version. Update this in the workflow file:

```yaml
minExtensionVersion: "0.3.0"  # Change this as needed
```

### 5. Retroactive Manifest Creation

For existing releases without manifests, you can manually create and commit a manifest:

#### Option A: Use the PowerShell Script

```powershell
# Generate manifest for a specific release
.\generate-manifest-retroactive.ps1 -Version "v0.0.30"
```

#### Option B: Manual Creation

1. Create `manifest.json` in the repository root
2. Copy the structure from `manifest.example.json`
3. Update version, dates, and download URLs
4. Commit with tag: `git tag -a v0.0.30 -m "Add manifest for v0.0.30"`
5. Push: `git push origin v0.0.30`

### 6. Verification

After merging the workflow, test it:

1. Create a new pre-release in the nexkit repository
2. Publish the release
3. Check that the workflow runs successfully
4. Verify the manifest is accessible at:

   ```text
   https://raw.githubusercontent.com/NexusInnovation/nexkit/{tag}/manifest.json
   ```

### 7. Extension Compatibility

The nexkit-vscode extension (v0.3.0+) will automatically:

- Fetch the manifest during update checks
- Use `minExtensionVersion` to prevent incompatible updates
- Display changelog links from `changelogUrl`
- Download templates using the appropriate template variant

## Files in This Directory

- **`manifest.example.json`** - Sample manifest structure
- **`generate-manifest.yml`** - GitHub Actions workflow for automated generation
- **`generate-manifest-retroactive.ps1`** - Script for retroactive manifest creation
- **`README.md`** - This documentation

## Troubleshooting

### Workflow doesn't trigger

- Ensure the workflow file is in `.github/workflows/` in the nexkit repo
- Check that the repository has Actions enabled
- Verify the workflow has `contents: write` permission

### Manifest not accessible

- The manifest is committed to a release branch, not the tag itself
- After merging the PR, the manifest will be on the main branch
- Access it via: `https://raw.githubusercontent.com/NexusInnovation/nexkit/main/manifest.json`
- Or at the specific tag after manual tagging

### Template pattern not matching

- Ensure template ZIP files follow the naming convention:
  - `nexkit-template-{tool}-{shell}-v{version}.zip`
  - Valid shells: `ps` (PowerShell), `sh` (Bash)
  - Valid tools: `copilot`, `claude`, `cursor`, etc.

## Future Enhancements

Consider adding to the manifest:

- **Schema validation** - JSON Schema for manifest structure
- **Checksums** - SHA256 hashes for template verification
- **Dependencies** - Required MCP servers or VS Code extensions
- **Breaking changes** - Migration guides for major updates
- **Template metadata** - Language support, features, etc.

## Questions?

For issues with manifest integration, contact the nexkit-vscode extension maintainers.
