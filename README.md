# Nexkit VS Code Extension

[![CI/CD Pipeline](https://github.com/NexusInnovation/nexkit-vscode/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/NexusInnovation/nexkit-vscode/actions/workflows/ci-cd.yml)
[![Latest Release](https://img.shields.io/github/v/release/NexusInnovation/nexkit-vscode)](https://github.com/NexusInnovation/nexkit-vscode/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A VS Code extension that migrates the functionality of the Nexkit CLI tool to provide Copilot-only spec-driven development workflows.

## Features

This extension provides the following commands (accessible via Command Palette or right-click menus):

- **Nexkit: Initialize Project** - Deploy bundled templates to the current workspace for spec-driven development
- **Nexkit: Check for Extension Updates** - Check for new extension releases and install updates
- **Nexkit: Install User MCP Servers** - Set up required MCP servers (Context7 and Sequential Thinking) for user-level configuration
- **Nexkit: Enable Azure DevOps MCP** - Add Azure DevOps MCP to workspace for project-specific Azure integration
- **Nexkit: Open Settings** - Quick access to extension settings
- **Nexkit: Restore Template Backup** - Restore previous template versions from backups

## Installation

### From GitHub Releases (Internal Use)

1. **Download the latest VSIX package**

   - Visit the [latest release](https://github.com/NexusInnovation/nexkit-vscode/releases/latest)
   - Download `nexkit-vscode.vsix`
   - Or use this direct link: [Download Latest VSIX](https://github.com/NexusInnovation/nexkit-vscode/releases/latest/download/nexkit-vscode.vsix)

2. **Install in VS Code**

   ```bash
   # Using VS Code CLI
   code --install-extension nexkit-vscode.vsix

   # Or via VS Code UI
   # 1. Open VS Code
   # 2. Press Ctrl+Shift+P (Cmd+Shift+P on macOS)
   # 3. Type "Extensions: Install from VSIX..."
   # 4. Select the downloaded nexkit-vscode.vsix file
   ```

3. **Verify Installation**
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type "Nexkit" to see available commands
   - Run "Nexkit: Initialize Project" to set up your workspace

### Pre-release Versions

Pre-release versions (alpha, beta, RC) are available for testing:

- Filter releases by "Pre-release" tag
- Follow the same installation steps as above

## Requirements

- VS Code 1.105.0 or higher
- Node.js (for development)
- MCP servers: Context7 and Sequential Thinking (installed via command)

## Extension Settings

This extension contributes the following settings:

### Initialization Settings

- `nexkit.init.promptForLanguages`: Prompt for programming languages during project initialization (default: true)
- `nexkit.init.createVscodeSettings`: Create .vscode/settings.json during initialization (default: true)
- `nexkit.init.createGitignore`: Create .gitignore during initialization (default: true)

### Workspace Settings

- `nexkit.workspace.initialized`: Indicates if the workspace has been initialized with Nexkit (default: false)
- `nexkit.workspace.languages`: List of programming languages selected for the workspace (default: [])
- `nexkit.workspace.mcpServers`: List of MCP servers configured for the workspace (default: [])

### Extension Updates

- `nexkit.extension.autoCheckUpdates`: Automatically check for extension updates on activation (default: true)
- `nexkit.extension.updateCheckInterval`: Hours between automatic extension update checks (default: 24)
- `nexkit.extension.lastUpdateCheck`: Timestamp of last extension update check (default: 0)

### MCP Setup

- `nexkit.mcpSetup.dismissed`: Whether the user has dismissed the MCP setup notification (default: false)

## Template System

Templates are bundled with the extension in the `resources/templates/` directory and deployed to your workspace's `.github/` folder during initialization. Templates include:

- **Prompts**: commit, document, implement, refine, review
- **Chat Modes**: debug, plan
- **Instructions**: Language-specific coding guidelines (Python, TypeScript, C#, React, Bicep, etc.)

Templates are updated when you install a new version of the extension - no separate template management needed!

## Known Issues

See [GitHub Issues](https://github.com/NexusInnovation/nexkit-vscode/issues) for known issues and bug reports.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### Latest Release

Check the [latest release](https://github.com/NexusInnovation/nexkit-vscode/releases/latest) for the most recent version and changes.

---

## Development

To develop this extension:

1. **Clone the repository**

   ```bash
   git clone https://github.com/NexusInnovation/nexkit-vscode.git
   cd nexkit-vscode
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Build the extension**

   ```bash
   npm run compile
   ```

4. **Run tests**

   ```bash
   npm test
   ```

5. **Launch Extension Development Host**
   - Press F5 to launch extension development host
   - Test commands in the new window

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

## Privacy and Telemetry

This extension collects anonymous usage telemetry to help improve Nexkit. The telemetry data includes:

- Extension activation and session duration
- Commands executed (not including any user data or file contents)
- Error occurrences (without personal information)
- Performance metrics (command execution times)
- Extension version and VS Code version
- Operating system type

### What is NOT collected

- No personally identifiable information (PII)
- No file names, paths, or contents
- No workspace or project names
- No user settings or configuration values
- No IP addresses (masked by default)

### Opting Out

Telemetry respects your privacy preferences:

1. **VS Code Global Telemetry Setting**: If you've disabled telemetry in VS Code (`telemetry.telemetryLevel` set to `off`), Nexkit telemetry is automatically disabled.

2. **Nexkit-Specific Setting**: You can disable Nexkit telemetry separately:
   - Open Settings (Ctrl+, or Cmd+,)
   - Search for "Nexkit Telemetry"
   - Uncheck "Nexkit: Telemetry Enabled"

   Or add to your `settings.json`:

   ```json
   {
     "nexkit.telemetry.enabled": false
   }
   ```

For more information about how telemetry data is collected and stored, see [docs/TELEMETRY_SETUP.md](docs/TELEMETRY_SETUP.md).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Code style guidelines
- Commit message conventions (Conventional Commits)
- Pull request process
- Testing requirements

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/NexusInnovation/nexkit-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/NexusInnovation/nexkit-vscode/discussions)

---

**Maintained by**: Nexus Innovation  
**Repository**: [github.com/NexusInnovation/nexkit-vscode](https://github.com/NexusInnovation/nexkit-vscode)
