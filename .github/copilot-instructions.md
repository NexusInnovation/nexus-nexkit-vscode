# Nexkit VS Code Extension - Copilot Instructions

## Project Overview
VS Code extension that deploys spec-driven AI development templates to workspaces and manages Model Context Protocol (MCP) server configurations. Migrated from Nexkit CLI to provide integrated Copilot workflow tooling without external dependencies.

## Architecture & Key Components

### Core Services (src/ directory)
- **`extension.ts`**: Main activation logic with command registration, status bar management, and automatic update checks on startup
- **`TemplateManager`**: Template deployment engine with atomic backup/restore operations using timestamped `.github.backup-*` directories
- **`MCPConfigManager`**: Platform-aware MCP config management (Windows/macOS/Linux paths differ)
- **`InitWizard`**: 4-step QuickPick wizard for language selection, Azure DevOps toggle, and scaffold options
- **`VersionManager`**: Semantic version comparison with configurable auto-update intervals (default 24h)
- **`GitHubReleaseService`**: GitHub API integration fetching from `NexusInnovation/nexkit` repo releases
- **`NexkitPanel`**: Webview sidebar provider with bi-directional messaging for command execution

### Template System
Templates source: `resources/templates/.github/` → Deploy target: `workspace/.github/`

**Deployment Logic** (`DeploymentConfig` interface):
```typescript
alwaysDeploy: ['.github/prompts/*.md', '.github/chatmodes/*.md']
conditionalDeploy: {
  'instructions.python': languages.includes('python') ? ['.github/instructions/python.instructions.md'] : []
  // 8 languages supported: python, typescript, csharp, react, bicep, netframework, markdown, azuredevopspipelines
}
workspaceMCPs: enableAzureDevOps ? ['azureDevOps'] : []
```

**Critical Template Paths**:
- Core prompts: `nexkit.{commit,document,implement,refine,review}.prompt.md`
- Chatmodes: `{debug,plan}.chatmode.md`
- Language instructions: Deployed only if selected in wizard

### MCP Integration Pattern
Two-tier configuration strategy:
- **User-level** (`~/AppData/Roaming/Code/User/mcp.json` on Windows): Required servers (context7, sequential-thinking) installed via `npx -y @upstash/context7-mcp`
- **Workspace-level** (`.vscode/mcp.json`): Optional project servers (Azure DevOps with `AZURE_DEVOPS_ORG_URL` env var)

Platform-specific config paths handled by `MCPConfigManager.getUserMCPConfigPath()`:
- Windows: `%APPDATA%\Code\User\mcp.json`
- macOS: `~/Library/Application Support/Code/User/mcp.json`
- Linux: `~/.config/Code/User/mcp.json`

## Development Workflows

### Build & Debug Commands
```bash
npm run watch      # Continuous TS compilation (Task ID "npm: 0" - DEFAULT BUILD)
npm run compile    # One-time build to out/ directory
npm run lint       # ESLint validation with @typescript-eslint/parser
```
**Debug Pattern**: Press `F5` to launch Extension Development Host. The `watch` task auto-starts via `preLaunchTask`. Test changes in the spawned VS Code instance, then close it to return to main session.

### Critical Commands to Test After Code Changes
1. **`Nexkit: Initialize Project`** - Tests full wizard flow + template deployment + settings persistence
2. **`Nexkit: Update Templates`** - Tests GitHub API calls + version comparison + backup creation
3. **`Nexkit: Install User MCP Servers`** - Tests platform path resolution + JSON file writes + VS Code reload prompt
4. **Status bar item click** - Tests `checkVersion` command + modal dialogs

### Verifying Template Deployment
After running `Initialize Project`:
- Check `.github/` folder exists with prompts/chatmodes/instructions subdirectories
- Verify `.github.backup-<timestamp>` directory created
- Confirm `.vscode/settings.json` has nexkit.* keys
- Validate `.vscode/mcp.json` exists if Azure DevOps was enabled

## Coding Patterns & Conventions

### Error Handling Strategy
Always wrap user-facing commands in try-catch with actionable error messages:
```typescript
try {
  await operation();
  vscode.window.showInformationMessage('Success message with context');
} catch (error) {
  vscode.window.showErrorMessage(`Failed to ${action}: ${error}`);
}
```
**Never throw raw errors** from command handlers - VS Code doesn't show them to users.

### Progress UX Pattern
Use `withProgress` for operations >500ms with incremental reporting:
```typescript
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: 'Main operation title',
  cancellable: false  // Set true only if you handle cancellation tokens
}, async (progress) => {
  progress.report({ increment: 20, message: 'Substep 1...' });
  await step1();
  progress.report({ increment: 30, message: 'Substep 2...' });
  await step2();
  // Total increments should sum to 100
});
```

### Configuration Management
Use typed getters with defaults to avoid undefined values:
```typescript
const config = vscode.workspace.getConfiguration('nexkit');
const value = config.get('setting.name', defaultValue);
await config.update('setting.name', newValue, vscode.ConfigurationTarget.Workspace); // or .Global
```
**Workspace vs Global**: Use `Workspace` for project state (initialized, languages), `Global` for user prefs (auto-update checks).

### File Operations Safety
Always check existence before operations and use recursive mkdir:
```typescript
await fs.promises.mkdir(targetDir, { recursive: true }); // Never fails if exists
const exists = await this.checkFileExists(path);  // Custom helper wrapping fs.access()
if (exists) {
  await this.backupDirectory(path);  // Atomic backup before overwrite
}
```

## Extension-Specific Guidelines

### Template Deployment
- Always backup existing `.github` before deployment using timestamped naming: `.github.backup-2025-10-25T14-30-00-000Z`
- Use `DeploymentConfig` for conditional template selection - language mapping example:
  ```typescript
  'instructions.python': wizardResult.languages.includes('python') ? 
    ['.github/instructions/python.instructions.md'] : []
  ```
- Call `fs.promises.mkdir(targetDir, { recursive: true })` before file writes to ensure directories exist
- **Never deploy** workspace MCP configs without user consent (wizard step confirms Azure DevOps)

### MCP Server Management
- Validate server configurations with `validateMCPServer(serverName, isUserLevel)` - checks for `command` and `args` fields
- **Critical**: Use `getUserMCPConfigPath()` for platform detection - hardcoded paths break on macOS/Linux
- Check for missing servers on activation but respect `nexkit.mcpSetup.dismissed` setting
- Always prompt for VS Code reload after user MCP changes: `'workbench.action.reloadWindow'`

### Status Bar Integration
Update status bar to reflect template state with visual indicators:
- `$(check)` + green: Up to date
- `$(arrow-up)` + orange background: Update available  
- `$(warning)`: Error checking status
- Click handler: `statusBarItem.command = 'nexkit-vscode.checkVersion'`

### Settings Schema Conventions
Follow the established configuration structure in `package.json`:
- `nexkit.init.*`: User preferences for initialization behavior
- `nexkit.workspace.*`: Project-specific state (initialized, languages, mcpServers)
- `nexkit.templates.*`: Template versioning and auto-update controls
- `nexkit.backup.*`: Retention policies for backup cleanup (default 30 days)

### Webview Messaging Pattern
`NexkitPanel` implements bi-directional communication:
```typescript
// Extension → Webview
webviewView.webview.postMessage({ version, status });

// Webview → Extension
webview.onDidReceiveMessage(message => {
  switch (message.command) {
    case 'ready': // Wait for ready before sending data
    case 'updateTemplates': await vscode.commands.executeCommand(...)
  }
});
```
Always wait for `'ready'` message before posting data to avoid race conditions.

## Testing & Validation

When modifying commands:
1. **Test in Extension Development Host (F5)** - spawns isolated VS Code instance with extension loaded
2. **Verify configuration updates persist** - check both `.vscode/settings.json` and global config
3. **Test error scenarios** - no workspace open, network failures, invalid JSON in config files
4. **Validate file system operations** - create test workspace, run init, verify backup creation
5. **Cross-platform considerations** - MCP config paths differ on Windows/macOS/Linux

**Common Issues to Validate**:
- Template deployment when `.github/` already exists (should backup first)
- Wizard cancellation at any step (should exit cleanly without partial changes)
- GitHub API rate limiting (handle 403 responses gracefully)
- Invalid manifest JSON from releases (don't crash the update flow)

## Critical Dependencies
- **VS Code API 1.105.0+**: Uses latest QuickPick, Webview, and Configuration APIs
- **Node.js fs.promises**: All file operations are async - never use sync variants
- **GitHub API**: Fetches from `https://api.github.com/repos/NexusInnovation/nexkit/releases/latest`
- **Platform Detection**: `os.platform()` returns `'win32'`, `'darwin'`, or `'linux'` for path logic