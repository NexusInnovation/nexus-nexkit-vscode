# Nexkit VS Code Extension - Copilot Instructions

## Project Overview
This is a VS Code extension that migrates Nexkit CLI functionality to provide Copilot-only spec-driven development workflows. The extension manages template deployment, MCP server configuration, and project initialization.

## Architecture & Key Components

### Core Services (src/ directory)
- **`extension.ts`**: Main entry point with command registration and activation logic
- **`TemplateManager`**: Handles template deployment, backup/restore from `resources/templates/`
- **`MCPConfigManager`**: Manages user and workspace-level MCP server configurations 
- **`InitWizard`**: Multi-step project initialization with language selection
- **`VersionManager`**: Template versioning with GitHub release integration
- **`GitHubReleaseService`**: GitHub API integration for template updates

### Template System
Templates live in `resources/templates/.github/` and deploy to workspace `.github/`:
- Always deployed: Core prompts (`commit.md`, `implement.md`, etc.) and chatmodes
- Conditionally deployed: Language-specific instructions based on user selection
- Configuration-driven deployment via `DeploymentConfig` interface

### MCP Integration Pattern
Two-level MCP configuration:
- **User-level**: Required servers (Context7, Sequential Thinking) in `~/AppData/Roaming/Code/User/mcp.json`
- **Workspace-level**: Project-specific servers (Azure DevOps) in `.vscode/mcp.json`

## Development Workflows

### Build & Debug
- `npm run watch`: Continuous TypeScript compilation (use Task ID "npm: 0")
- `npm run start`: Launch extension host with watch (Task ID "npm: 1") 
- `npm run debug`: Debug mode with watch (Task ID "npm: 2")
- Press F5 to launch Extension Development Host for testing

### Key Commands to Test
- `Nexkit: Initialize Project`: Full wizard workflow
- `Nexkit: Update Templates`: GitHub release integration
- `Nexkit: Install User MCP Servers`: MCP configuration setup

## Coding Patterns & Conventions

### Error Handling
Always wrap VS Code commands in try-catch with user-friendly error messages:
```typescript
try {
  // operation
} catch (error) {
  vscode.window.showErrorMessage(`Failed to ${action}: ${error}`);
}
```

### Progress Notifications
Use `vscode.window.withProgress` for long operations with incremental updates:
```typescript
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: 'Operation...',
  cancellable: false
}, async (progress) => {
  progress.report({ increment: 25, message: 'Step 1...' });
});
```

### Configuration Access
Use typed configuration pattern:
```typescript
const config = vscode.workspace.getConfiguration('nexkit');
const value = config.get('setting.name', defaultValue);
await config.update('setting.name', newValue, vscode.ConfigurationTarget.Workspace);
```

### File Operations
Always use async/await with proper error handling:
```typescript
await fs.promises.mkdir(dir, { recursive: true });
const exists = await this.checkFileExists(path);
```

## Extension-Specific Guidelines

### Template Deployment
- Always backup existing `.github` before deployment
- Use `DeploymentConfig` for conditional template selection
- Ensure target directories exist before file operations

### MCP Server Management
- Validate server configurations with `validateMCPServer()`
- Use platform-specific paths for user config location
- Check for missing servers and prompt for installation

### Status Bar Integration
Update status bar to show template version and update availability:
- Green check: Up to date
- Orange arrow: Update available
- Click to check versions

### Settings Schema
Follow the established configuration structure in `package.json`:
- `nexkit.init.*`: Initialization options
- `nexkit.workspace.*`: Workspace state
- `nexkit.templates.*`: Template management
- `nexkit.backup.*`: Backup settings

## Testing & Validation

When modifying commands:
1. Test in Extension Development Host (F5)
2. Verify configuration updates persist
3. Test error scenarios (no workspace, network issues)
4. Validate file system operations work across platforms

## Critical Dependencies
- VS Code API 1.105.0+
- Node.js file system operations
- GitHub API for release management
- Platform-specific MCP config paths