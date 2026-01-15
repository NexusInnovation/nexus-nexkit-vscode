# Nexkit VS Code Extension

[![CI/CD Pipeline](https://github.com/NexusInnovation/nexus-nexkit-vscode/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/NexusInnovation/nexus-nexkit-vscode/actions/workflows/ci-cd.yml)
[![Latest Release](https://img.shields.io/github/v/release/NexusInnovation/nexus-nexkit-vscode)](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive VS Code extension that streamlines GitHub Copilot development workflows by providing AI templates (agents, prompts, instructions, chatmodes), workspace initialization, and MCP server management.

## Features

### Core Commands

Access all commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Nexkit: Initialize Workspace** - Set up your workspace with:
  - AI template files (agents, prompts, chatmodes) from configured repositories
  - Recommended VS Code settings and extensions
  - Workspace-level MCP server configuration
  - .gitignore configuration for Nexkit files
- **Nexkit: Check for Updates** - Check for and install extension updates automatically

- **Nexkit: Install User MCP Servers** - Install required MCP servers (Context7 and Sequential Thinking) to user-level VS Code configuration

- **Nexkit: Open Settings** - Quick access to extension settings

- **Nexkit: Restore Template Backup** - Restore previous AI template files from automatic backups

- **Nexkit: Cleanup Template Backups** - Remove old template backup directories

### Sidebar Panel

A dedicated Nexkit sidebar in the Activity Bar provides:

- Browse AI templates from all configured repositories
- Install individual templates or batches
- Quick access to settings and MCP installation
- Real-time template repository synchronization

### AI Template Repository System

The extension fetches AI templates from GitHub repositories:

- **Default Repository**: [Nexus Templates](https://github.com/NexusInnovation/nexus-nexkit-templates) (always enabled)
- **Custom Repositories**: Add your own template repositories via settings
- **Template Types**:
  - **Agents**: GitHub Copilot custom agents
  - **Prompts**: Reusable AI prompts
  - **Instructions**: Language-specific coding guidelines
  - **Chatmodes**: Specialized chat modes (debug, plan, etc.)

Templates are automatically fetched on extension activation and can be refreshed when repository configurations change.

### Automatic Features

- **Extension Update Checking**: Automatically checks for new releases every 24 hours (configurable)
- **MCP Server Prompts**: Notifies when required MCP servers are not installed
- **Workspace Initialization Prompts**: Suggests initialization for new workspaces
- **Template Backups**: Automatically backs up existing templates before overwriting
- **Configuration Watchers**: Refreshes templates when repository settings change

## Installation

### From GitHub Releases

1. **Download the latest VSIX package**
   - Visit the [latest release](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest)
   - Download the `.vsix` file
   - Or use direct link: [Download Latest VSIX](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest/download/nexkit-vscode.vsix)

2. **Install in VS Code**

   ```bash
   # Using VS Code CLI
   code --install-extension nexkit-vscode.vsix

   # Or via VS Code UI
   # 1. Open VS Code
   # 2. Press Ctrl+Shift+P (Cmd+Shift+P on macOS)
   # 3. Type "Extensions: Install from VSIX..."
   # 4. Select the downloaded .vsix file
   ```

3. **Verify Installation**
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Type "Nexkit" to see available commands
   - Run "Nexkit: Initialize Workspace" to set up your first project

### Pre-release Versions

Pre-release versions (beta) are available from the develop branch:

- Look for releases tagged with `-beta.N`
- Marked as "Pre-release" on GitHub
- Follow the same installation steps above

## Requirements

- **VS Code**: Version 1.105.0 or higher
- **MCP Servers** (optional, but recommended):
  - **Context7**: Provides up-to-date library documentation
  - **Sequential Thinking**: Enhanced reasoning for complex tasks
  - Both can be installed via the "Nexkit: Install User MCP Servers" command

## Extension Settings

### Repository Configuration

**`nexkit.repositories`** - Configure additional template repositories

Default includes the "Awesome Copilot" repository. The "Nexus Templates" repository is always included and cannot be removed.

```json
{
  "nexkit.repositories": [
    {
      "name": "My Custom Templates",
      "url": "https://github.com/myorg/my-templates",
      "branch": "main",
      "enabled": true,
      "paths": {
        "agents": "agents",
        "prompts": "prompts",
        "skills": "skills",
        "instructions": "instructions",
        "chatmodes": "chatmodes"
      }
    }
  ]
}
```

### Extension Update Settings

- **`nexkit.extension.autoCheckUpdates`** - Automatically check for updates on activation (default: `true`)
- **`nexkit.extension.updateCheckInterval`** - Hours between update checks (default: `24`)

### MCP Configuration

- **`nexkit.mcpSetup.dismissed`** - Whether the MCP setup notification was dismissed (default: `false`)

### Telemetry

- **`nexkit.telemetry.enabled`** - Enable anonymous usage telemetry (default: `true`, respects VS Code's global telemetry setting)
- **`nexkit.telemetry.connectionString`** - Azure Application Insights connection string (optional, for custom telemetry endpoint)

## How It Works

### Workspace Initialization

When you run "Nexkit: Initialize Workspace":

1. **Backup Creation**: Existing `.github` directory is backed up automatically
2. **Configuration Deployment**:
   - `.gitignore` entries for Nexkit-generated files
   - `.vscode/settings.json` with recommended settings
   - `.vscode/extensions.json` with recommended extensions
   - `.vscode/mcp.json` for workspace-level MCP configuration
3. **Template Installation**: Agents, prompts, and chatmodes from the Nexus Templates repository are installed to `.github/`
4. **Workspace Marking**: Sets `nexkit.workspace.initialized` to prevent duplicate prompts

### Template Repository System

- Templates are fetched from GitHub repositories using the GitHub API
- Repository structure is flexible - configure paths for each template type
- Templates are cached in memory and refreshed when configuration changes
- The Nexus Templates repository is always included as a default source

### Extension Updates

- Extension automatically checks GitHub releases for newer versions
- Compares semantic versions (e.g., 0.6.0 vs 0.5.5)
- Downloads `.vsix` file and prompts for installation
- Old `.vsix` files are automatically cleaned up on activation

## Template Structure

Templates deployed to your workspace follow this structure:

```
.github/
├── agents/              # GitHub Copilot custom agents
├── prompts/             # Reusable AI prompts
├── chatmodes/           # Specialized chat modes
└── instructions/        # Coding guidelines (not auto-installed)
```

Each template file contains specialized instructions for GitHub Copilot to enhance your development workflow.

## Usage Examples

### Setting Up a New Project

```bash
# 1. Open your project folder in VS Code
code /path/to/my-project

# 2. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
# 3. Run: "Nexkit: Initialize Workspace"
# 4. Your workspace is now configured with AI templates and settings!
```

### Adding Custom Template Repositories

```json
// In your VS Code settings.json (File > Preferences > Settings)
{
  "nexkit.repositories": [
    {
      "name": "Company Templates",
      "url": "https://github.com/mycompany/ai-templates",
      "enabled": true,
      "paths": {
        "agents": "copilot-agents",
        "prompts": "ai-prompts",
        "skills": "skills",
      }
    }
  ]
}
```

### Installing MCP Servers

```bash
# Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
# Run: "Nexkit: Install User MCP Servers"
# Follow the prompts to configure Context7 and Sequential Thinking
```

## Known Issues

See [GitHub Issues](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues) for known issues and bug reports.

Common issues:

- **GitHub API Rate Limiting**: Template fetching may be throttled with unauthenticated requests
- **VSIX Download**: Some corporate networks may block direct GitHub asset downloads

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes and version history.

### Current Version: 0.6.0

Latest features include:

- Multi-repository AI template management
- Webview sidebar panel for browsing templates
- Automated extension update system
- Comprehensive workspace initialization
- User and workspace-level MCP configuration

---

## Development

### Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/NexusInnovation/nexus-nexkit-vscode.git
   cd nexus-nexkit-vscode
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Build the extension**

   ```bash
   npm run compile
   # or for production build
   npm run package
   ```

4. **Run tests**

   ```bash
   npm test
   ```

5. **Launch Extension Development Host**
   - Press `F5` in VS Code to open a new window with the extension loaded
   - Test your changes in the Extension Development Host

### Project Structure

```
nexus-nexkit-vscode/
├── src/
│   ├── extension.ts                      # Extension entry point
│   ├── core/
│   │   ├── serviceContainer.ts           # Dependency injection
│   │   └── settingsManager.ts            # VS Code settings management
│   ├── features/
│   │   ├── ai-template-files/            # Template repository management
│   │   ├── backup-management/            # Backup/restore services
│   │   ├── extension-updates/            # Extension update checking
│   │   ├── initialization/               # Workspace initialization
│   │   ├── mcp-management/               # MCP server configuration
│   │   └── panel-ui/                     # Webview sidebar panel
│   └── shared/
│       ├── commands/                     # Command registration
│       ├── services/                     # Shared services (telemetry)
│       └── utils/                        # Utility functions
├── docs/                                 # Additional documentation
├── media/                                # Icons and assets
└── infrastructure/                       # Azure telemetry config
```

### Available Scripts

- **`npm run compile`** - Compile TypeScript with esbuild
- **`npm run watch`** - Watch mode for development
- **`npm run package`** - Build optimized production bundle
- **`npm run lint`** - Run ESLint
- **`npm run check:types`** - TypeScript type checking
- **`npm test`** - Run all tests

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines, coding standards, and contribution workflow.

## Architecture

### Service-Oriented Design

The extension uses dependency injection via `ServiceContainer` to manage service instances:

- **TelemetryService**: Anonymous usage analytics
- **AITemplateDataService**: Template fetching and caching
- **MCPConfigService**: MCP server configuration
- **ExtensionUpdateService**: Extension update checking and installation
- **BackupService**: Directory backup/restore operations

### Key Design Patterns

- **SOLID Principles**: Single responsibility, dependency injection
- **Event-Driven**: Uses VS Code event emitters for data changes
- **Async/Await**: All I/O operations are asynchronous
- **Error Handling**: Graceful degradation with user-friendly messages

### Template Data Flow

1. **Initialization**: `AITemplateDataService.initialize()` fetches from all configured repositories
2. **Caching**: Templates stored in memory via `TemplateDataStore`
3. **Installation**: `TemplateFileOperations` handles file creation with backup
4. **UI**: `NexkitPanelViewProvider` displays templates in webview

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

- **Issues**: [GitHub Issues](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/NexusInnovation/nexus-nexkit-vscode/discussions)

---

**Maintained by**: Nexus Innovation  
**Repository**: [github.com/NexusInnovation/nexus-nexkit-vscode](https://github.com/NexusInnovation/nexus-nexkit-vscode)
