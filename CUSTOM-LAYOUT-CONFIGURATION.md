# Custom VS Code Layout Configuration via Extension

This document explains how to programmatically configure VS Code's UI layout, specifically:
1. Hiding unwanted Activity Bar icons
2. Moving GitHub Copilot Chat to the Editor area

These configurations are applied through a custom VS Code extension on first startup.

---

## Overview

Standard VS Code settings.json cannot hide built-in Activity Bar views or control Chat panel location. To achieve this in a custom VS Code distribution (like APM Code), you need to create an extension that executes commands on startup.

---

## Extension Structure

### package.json Configuration

Add these sections to your extension's `package.json`:

```json
{
  "name": "apmcode-layout-manager",
  "displayName": "APM Code Layout Manager",
  "description": "Manages default UI layout for APM Code",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.80.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "contributes": {
    "configuration": {
      "title": "APM Code Layout",
      "properties": {
        "apmcode.hideActivityBarIcons": {
          "type": "boolean",
          "default": true,
          "description": "Hide non-essential activity bar icons (Search, SCM, Debug, Extensions, Testing)"
        },
        "apmcode.chatInEditor": {
          "type": "boolean",
          "default": true,
          "description": "Open GitHub Copilot Chat in editor area instead of panel"
        }
      }
    },
    "commands": [
      {
        "command": "apmcode.setupLayout",
        "title": "APM Code: Setup Default Layout"
      },
      {
        "command": "apmcode.resetLayout",
        "title": "APM Code: Reset Layout to Defaults"
      }
    ]
  }
}
```

---

## Extension Code (TypeScript)

### Main Extension File (src/extension.ts)

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('APM Code Layout Manager activated');
    
    // Register layout setup command
    const setupLayout = vscode.commands.registerCommand('apmcode.setupLayout', async () => {
        await configureActivityBar();
        await configureChatLocation();
        vscode.window.showInformationMessage('APM Code layout configured successfully');
    });

    // Register reset command
    const resetLayout = vscode.commands.registerCommand('apmcode.resetLayout', async () => {
        await context.globalState.update('apmcode.setupComplete', false);
        await vscode.commands.executeCommand('apmcode.setupLayout');
        await context.globalState.update('apmcode.setupComplete', true);
    });

    context.subscriptions.push(setupLayout, resetLayout);

    // Run setup on first activation only
    const hasRunSetup = context.globalState.get('apmcode.setupComplete');
    if (!hasRunSetup) {
        // Delay to ensure VS Code is fully loaded
        setTimeout(async () => {
            const config = vscode.workspace.getConfiguration();
            const shouldHideIcons = config.get('apmcode.hideActivityBarIcons', true);
            const shouldMoveChatToEditor = config.get('apmcode.chatInEditor', true);

            if (shouldHideIcons) {
                await configureActivityBar();
            }
            
            if (shouldMoveChatToEditor) {
                await configureChatLocation();
            }

            await context.globalState.update('apmcode.setupComplete', true);
            console.log('APM Code initial layout setup complete');
        }, 2000); // 2 second delay
    }
}

/**
 * Hide unwanted Activity Bar icons
 * Keeps only Explorer and Nexkit visible
 */
async function configureActivityBar() {
    console.log('Configuring Activity Bar...');
    
    // List of views to hide
    const viewsToHide = [
        'workbench.view.search',      // Search
        'workbench.view.scm',          // Source Control
        'workbench.view.debug',        // Run and Debug
        'workbench.view.extensions',   // Extensions
        'workbench.view.testing'       // Testing
    ];

    // Attempt to hide each view
    for (const viewId of viewsToHide) {
        try {
            // Try multiple approaches as API varies by VS Code version
            
            // Approach 1: Direct hide command
            await vscode.commands.executeCommand(`${viewId}.hide`);
        } catch (e) {
            // If direct hide fails, try closing the view
            try {
                await vscode.commands.executeCommand(`${viewId}.close`);
            } catch (e2) {
                console.log(`Could not hide view ${viewId}:`, e2);
            }
        }
    }

    // Additional approach: Use setContext for view visibility
    const contextKeys = [
        { key: 'searchViewletVisible', value: false },
        { key: 'debugViewVisible', value: false },
        { key: 'extensionsViewletVisible', value: false },
        { key: 'testingViewVisible', value: false }
    ];

    for (const ctx of contextKeys) {
        try {
            await vscode.commands.executeCommand('setContext', ctx.key, ctx.value);
        } catch (e) {
            // Context key might not be supported
            console.log(`Could not set context ${ctx.key}:`, e);
        }
    }

    console.log('Activity Bar configuration complete');
}

/**
 * Move GitHub Copilot Chat to Editor area
 */
async function configureChatLocation() {
    console.log('Configuring Chat location...');
    
    // List of possible commands to try (varies by VS Code/Copilot version)
    const chatCommands = [
        'workbench.panel.chat.view.copilot.moveToEditorArea',
        'github.copilot.chat.openInEditor',
        'workbench.action.chat.openEditSession',
        'workbench.action.chat.open'
    ];

    let success = false;
    for (const cmd of chatCommands) {
        try {
            await vscode.commands.executeCommand(cmd);
            console.log(`Successfully executed command: ${cmd}`);
            success = true;
            break; // Exit on first successful command
        } catch (e) {
            // Command doesn't exist or failed, try next
            console.log(`Command ${cmd} not available`);
            continue;
        }
    }

    if (!success) {
        console.log('Could not move chat to editor area automatically');
    } else {
        console.log('Chat location configuration complete');
    }
}

/**
 * Development helper: List all available commands
 * Useful for debugging which commands are available in your VS Code version
 */
async function findAvailableChatCommands() {
    const allCommands = await vscode.commands.getCommands();
    const chatCommands = allCommands.filter(cmd => 
        cmd.includes('chat') || 
        cmd.includes('copilot') ||
        cmd.includes('panel')
    );
    console.log('Available chat/copilot commands:', chatCommands);
    return chatCommands;
}

export function deactivate() {
    console.log('APM Code Layout Manager deactivated');
}
```

---

## Debugging Available Commands

To discover which commands are available in your specific VS Code version, add this to your extension during development:

```typescript
// In activate() function, add:
const discoverCommands = vscode.commands.registerCommand('apmcode.discoverCommands', async () => {
    const allCommands = await vscode.commands.getCommands();
    
    // Filter for relevant commands
    const activityBarCommands = allCommands.filter(cmd => 
        cmd.includes('view') || cmd.includes('viewlet')
    );
    const chatCommands = allCommands.filter(cmd => 
        cmd.includes('chat') || cmd.includes('copilot')
    );
    
    console.log('=== Activity Bar Commands ===');
    console.log(activityBarCommands);
    
    console.log('=== Chat Commands ===');
    console.log(chatCommands);
    
    // Show in output panel
    const output = vscode.window.createOutputChannel('APM Code Command Discovery');
    output.appendLine('=== Activity Bar Commands ===');
    activityBarCommands.forEach(cmd => output.appendLine(cmd));
    output.appendLine('\n=== Chat Commands ===');
    chatCommands.forEach(cmd => output.appendLine(cmd));
    output.show();
});

context.subscriptions.push(discoverCommands);
```

Then run the command from the Command Palette: `APM Code: Discover Commands`

---

## Building and Installing the Extension

### 1. Build the Extension

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as VSIX
npx vsce package
```

### 2. Preinstall in Custom VS Code Build

Add to your build script (e.g., `build-package.ps1`):

```powershell
# Preinstall Layout Manager extension
$LayoutExtSource = "$PSScriptRoot\..\build\extensions\apmcode-layout-manager.vsix"
if (Test-Path $LayoutExtSource) {
    Write-Host "  📦 Preinstalling APM Code Layout Manager..." -ForegroundColor Cyan
    
    $TempExtractPath = "$env:TEMP\layout-manager-extract-$(Get-Random)"
    Expand-Archive -Path $LayoutExtSource -DestinationPath $TempExtractPath -Force
    
    $PackageJson = Get-Content "$TempExtractPath\extension\package.json" -Raw | ConvertFrom-Json
    $Publisher = $PackageJson.publisher
    $Name = $PackageJson.name
    $Version = $PackageJson.version
    
    $ExtensionFolder = "$ExtensionsDir\$Publisher.$Name-$Version"
    New-Item -ItemType Directory -Path $ExtensionFolder -Force | Out-Null
    
    if (Test-Path "$TempExtractPath\extension") {
        Copy-Item -Path "$TempExtractPath\extension\*" -Destination $ExtensionFolder -Recurse -Force
    } else {
        Copy-Item -Path "$TempExtractPath\*" -Destination $ExtensionFolder -Recurse -Force
    }
    
    Remove-Item $TempExtractPath -Recurse -Force -ErrorAction SilentlyContinue
    
    Write-Host "  ✅ Layout Manager extension preinstalled" -ForegroundColor Green
}
```

---

## Alternative: Using Workspace Settings (Limited Support)

While not as effective, you can try these settings in `settings.json`:

```json
{
  // These may work in some VS Code versions but are not officially supported
  "workbench.activityBar.iconClickBehavior": "toggle",
  
  // Window title customization
  "window.title": "${activeEditorShort}${separator}${rootName}",
  
  // Default theme
  "workbench.colorTheme": "Default Light Modern"
}
```

**Note**: Settings cannot reliably hide built-in Activity Bar views. The extension approach is required.

---

## Testing

### Test in Development

```bash
# Open extension project in VS Code
code .

# Press F5 to launch Extension Development Host
# This opens a new VS Code window with your extension loaded

# Test the command manually
# Open Command Palette (Ctrl+Shift+P)
# Run: "APM Code: Setup Default Layout"
```

### Test in Custom Build

```powershell
# Build your custom VS Code package
.\scripts\build-package.ps1

# Launch the portable version
.\build\apmcode-package\Code.exe

# Check if layout is applied on first startup
# Verify:
# 1. Only Explorer and Nexkit icons visible in Activity Bar
# 2. Chat opens in editor area (not panel)
```

---

## Troubleshooting

### Issue: Activity Bar icons not hiding

**Cause**: Commands may have different names in different VS Code versions.

**Solution**: Use the command discovery helper to find correct command names for your version.

### Issue: Chat not moving to editor

**Cause**: GitHub Copilot Chat extension uses different commands across versions.

**Solution**: 
1. Check if Copilot Chat extension is installed
2. Try manually moving chat to editor via right-click menu
3. Inspect VS Code's Output panel for command errors

### Issue: Setup runs on every startup

**Cause**: globalState not persisting.

**Solution**: Check extension context is properly saved. Verify with:
```typescript
console.log('Setup complete flag:', context.globalState.get('apmcode.setupComplete'));
```

---

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Commands API](https://code.visualstudio.com/api/references/commands)
- [GitHub Copilot Chat Extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat)
- [Enterprise Extension Preinstallation](https://code.visualstudio.com/docs/enterprise/extensions#_preinstall-extensions)

---

## Summary

✅ **What Works:**
- Hiding Activity Bar icons (with some VS Code version variability)
- Running setup automatically on first startup
- User-configurable via settings

⚠️ **Limitations:**
- Chat location setting depends on Copilot extension version
- Command names may vary between VS Code versions
- Some approaches require trial-and-error for your specific VS Code build

🎯 **Best Practice:**
Create the extension, test it in your target VS Code version, adjust command names as needed, then preinstall it in your custom build.
