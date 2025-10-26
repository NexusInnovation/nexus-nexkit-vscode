# Nexkit VS Code Extension

[![CI/CD Pipeline](https://github.com/NexusInnovation/nexkit-vscode/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/NexusInnovation/nexkit-vscode/actions/workflows/ci-cd.yml)
[![Latest Release](https://img.shields.io/github/v/release/NexusInnovation/nexkit-vscode)](https://github.com/NexusInnovation/nexkit-vscode/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A VS Code extension that migrates the functionality of the Nexkit CLI tool to provide Copilot-only spec-driven development workflows.

## Features

This extension provides the following commands (accessible via Command Palette or right-click menus):

- **Nexkit: Initialize Project** - Deploy templates to the current workspace for spec-driven development
- **Nexkit: Update Templates** - Fetch and install the latest templates from GitHub releases
- **Nexkit: Check Template Version** - Compare local vs available template versions
- **Nexkit: Install User MCP Servers** - Set up required MCP servers (Context7 and Sequential Thinking) for user-level configuration
- **Nexkit: Enable Azure DevOps MCP** - Add Azure DevOps MCP to workspace for project-specific Azure integration
- **Nexkit: Open Settings** - Quick access to extension settings
- **Nexkit: Restore Template Backup** - Restore previous template versions from backups
- **Nexkit: Show Panel** - Open the Nexkit custom panel with static information and action buttons

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

### Template Management

- `nexkit.templates.version`: Current version of templates installed (default: "")
- `nexkit.templates.autoCheckUpdates`: Automatically check for template updates on extension activation (default: true)
- `nexkit.templates.updateCheckInterval`: Hours between automatic update checks (default: 24)

### Backup Settings

- `nexkit.backup.retentionDays`: Days to keep template backups (default: 30)

## Nexkit Custom Panel

The Nexkit extension now provides a custom panel with static information and standard action buttons. To open the panel, run the command:

```sh
Nexkit: Show Panel
```

The panel displays:

- Static info (version, status) at the top
- Action buttons below to run common Nexkit commands (Update Templates, Re-initialize Project, Install User MCP Servers, Open Settings)

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
