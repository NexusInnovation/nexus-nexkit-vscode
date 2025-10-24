# Nexkit VS Code Extension

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

None reported yet.

## Release Notes

### 0.0.1

Initial release with basic command structure and settings. Migration from Nexkit CLI in progress.

---

## Development

To develop this extension:

1. Clone the repository
2. Run `npm install`
3. Press F5 to launch extension development host
4. Test commands in the new window

## Contributing

Contributions are welcome. Please follow the standard VS Code extension development guidelines.

## License

[Add license information here]
