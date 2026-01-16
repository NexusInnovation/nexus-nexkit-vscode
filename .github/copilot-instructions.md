# GitHub Copilot Instructions for Nexkit VS Code Extension

## Project Overview

This is a VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories and provides workspace initialization, MCP server configuration, and automated extension updates.

**Key Technologies:**

- TypeScript 5.x
- VS Code Extension API 1.105.0+
- esbuild for bundling
- Mocha for testing

**Core Principles:**

- **SOLID**: Single responsibility, dependency injection via ServiceContainer
- **DRY**: Reusable services and utilities
- **KISS**: Simple, maintainable code over clever abstractions
- **Async/Await**: All I/O operations are asynchronous
- **Error Handling**: Graceful degradation with user-friendly messages

## Architecture

### Service-Oriented Design

All services are instantiated in `src/core/serviceContainer.ts` and injected where needed:

- **TelemetryService**: Anonymous usage analytics (Azure Application Insights)
- **AITemplateDataService**: Fetches and caches templates from GitHub repos
- **MCPConfigService**: Manages MCP server configuration (user & workspace level)
- **ExtensionUpdateService**: Checks GitHub releases and handles updates
- **BackupService**: Creates timestamped backups before destructive operations
- **SettingsManager**: Centralized VS Code settings access

### Directory Structure

```
src/
├── extension.ts                 # Entry point - activation/deactivation
├── core/                        # Core infrastructure
│   ├── serviceContainer.ts      # DI container
│   └── settingsManager.ts       # Settings facade
├── features/                    # Feature modules (one folder per feature)
│   ├── ai-template-files/       # Template management
│   ├── backup-management/       # Backup/restore
│   ├── extension-updates/       # Update system
│   ├── initialization/          # Workspace setup
│   ├── mcp-management/          # MCP config
│   └── panel-ui/                # Webview sidebar
└── shared/                      # Shared utilities
    ├── commands/                # Command registration
    ├── constants/               # Shared constants
    ├── services/                # Shared services
    └── utils/                   # Helper functions
```

## Coding Guidelines

### TypeScript Style

- **Strict Mode**: Always enabled in tsconfig.json
- **Explicit Types**: Prefer explicit return types for public methods
- **Interfaces**: Define interfaces for complex objects and service contracts
- **Enums**: Use string enums for better debugging
- **Async/Await**: Prefer over .then() chains
- **Error Handling**: Always wrap risky operations in try/catch

### Naming Conventions

- **Services**: End with `Service` (e.g., `AITemplateDataService`)
- **Deployers**: End with `Deployer` (e.g., `AITemplateFilesDeployer`)
- **Providers**: End with `Provider` (e.g., `NexkitPanelViewProvider`)
- **Commands**: Use `register[Feature]Command` pattern
- **Constants**: UPPER_SNAKE_CASE or PascalCase object with const assertion
- **Private Fields**: Prefix with underscore `_fieldName`

### File Organization

- **One class per file** (with related interfaces in same file)
- **Commands**: Separate command registration from implementation
- **Tests**: Mirror src structure in test folder
- **Models**: Keep data models in dedicated `models/` folders

### VS Code Extension Patterns

#### Command Registration

Always use the centralized command registry:

```typescript
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerMyCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.MY_COMMAND,
    async () => {
      // Command implementation
    },
    services.telemetry // Optional telemetry tracking
  );
}
```

#### Settings Access

Always use SettingsManager:

```typescript
import { SettingsManager } from "../../core/settingsManager";

// Read
const isEnabled = SettingsManager.isWorkspaceInitialized();
const repos = SettingsManager.getRepositories<RepositoryConfig>();

// Write
await SettingsManager.setWorkspaceInitialized(true);
```

#### Error Handling

Show user-friendly error messages:

```typescript
try {
  await riskyOperation();
  vscode.window.showInformationMessage("Success!");
} catch (error) {
  console.error("Operation failed:", error);
  vscode.window.showErrorMessage(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
}
```

## Feature-Specific Guidelines

### AI Template Files

**Location**: `src/features/ai-template-files/`

**Key Services**:

- `AITemplateDataService`: Main facade for template operations
- `RepositoryManager`: Manages repository configurations
- `TemplateFetcherService`: Fetches from GitHub API
- `TemplateDataStore`: In-memory template cache with event emitters
- `TemplateFileOperations`: File I/O for template installation

**Template Types**:

- `agents`: GitHub Copilot custom agents
- `prompts`: Reusable AI prompts
- `instructions`: Language-specific coding guidelines
- `chatmodes`: Specialized chat modes

**Data Flow**:

1. User configures repos in settings (`nexkit.repositories`)
2. `AITemplateDataService.initialize()` fetches from all enabled repos
3. Templates cached in `TemplateDataStore`
4. UI (panel or commands) triggers installation via `installBatch()` or `installTemplate()`
5. `TemplateFileOperations` creates files in `.github/` with automatic backup

**Best Practices**:

- Always wait for `AITemplateDataService.waitForReady()` before accessing templates
- Use repository name as key for filtering templates
- Create backups before overwriting files
- Emit events when data changes for UI reactivity

### MCP Management

**Location**: `src/features/mcp-management/`

**Key Concepts**:

- **User-level MCP**: `~/.vscode/mcp.json` (or `%APPDATA%` on Windows)
- **Workspace-level MCP**: `.vscode/mcp.json`
- **Required Servers**: Context7 and Sequential Thinking

**Configuration Format**:

```json
{
  "servers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@uptudev/context7"]
    }
  }
}
```

**Best Practices**:

- Always check if servers exist before prompting installation
- Respect user dismissal (`nexkit.mcpSetup.dismissed`)
- Preserve existing servers when updating config
- Use `MCPConfigService.addUserMCPServer()` for user-level
- Use `MCPConfigService.addWorkspaceMCPServer()` for workspace-level

### Extension Updates

**Location**: `src/features/extension-updates/`

**Key Components**:

- `ExtensionUpdateService`: Core update logic
- `ExtensionGitHubReleaseService`: GitHub API integration
- `UpdateStatusBarService`: Status bar item management

**Update Flow**:

1. Check GitHub releases API for latest version
2. Compare with current version using semantic versioning
3. Download `.vsix` to temp directory
4. Prompt user with options (Install, Copy Command, View Release Notes)
5. Install via VS Code CLI or display manual instructions
6. Clean up old `.vsix` files on activation

**Best Practices**:

- Respect `nexkit.extension.autoCheckUpdates` setting
- Honor `nexkit.extension.updateCheckInterval` for throttling
- Update last check timestamp in GlobalState after each check
- Handle GitHub API rate limiting gracefully
- Clean up old downloads automatically

### Workspace Initialization

**Location**: `src/features/initialization/`

**Initialization Steps**:

1. Check if workspace already initialized
2. Backup existing `.github` directory
3. Deploy configuration files:
   - `.gitignore` (via `GitIgnoreConfigDeployer`)
   - `.vscode/settings.json` (via `RecommendedSettingsConfigDeployer`)
   - `.vscode/extensions.json` (via `RecommendedExtensionsConfigDeployer`)
   - `.vscode/mcp.json` (via `MCPConfigDeployer`)
4. Install AI templates from Nexus repository (agents, prompts, chatmodes only)
5. Set `nexkit.workspace.initialized = true`

**Deployers Pattern**:
Each deployer follows the same interface:

```typescript
export class MyConfigDeployer {
  public async deployConfig(workspaceRoot: string): Promise<void> {
    // Create/update config file
  }
}
```

**Best Practices**:

- Always confirm before re-initializing
- Create backups before destructive operations
- Deploy silently (no prompts during batch operations)
- Show summary message with counts and backup paths

### Webview Panel

**Location**: `src/features/panel-ui/`

**Architecture**:

The webview is built with **Preact** for better performance and modularity:

- `NexkitPanelViewProvider`: Webview lifecycle management (extension side)
- `NexkitPanelMessageHandler`: Message passing between webview and extension (extension side)
- `webview/main.tsx`: Preact app entry point with AppStateProvider
- `webview/index.html`: Minimal HTML shell
- `webview/components/`: Preact components (App, ActionsSection, TemplateSection, etc.)
- `webview/contexts/`: Preact Context providers for global state
- `webview/hooks/`: Custom Preact hooks for state access and operations
- `webview/services/`: VSCodeMessenger for communication
- `webview/types/`: TypeScript type definitions

**State Management Architecture**:

The webview uses **centralized state management with Preact Context** to solve message timing issues:

```
webview/
├── types/
│   └── appState.ts           # Global AppState interface
├── contexts/
│   └── AppStateContext.tsx   # Provider with centralized message handling
├── hooks/
│   ├── useAppState.ts        # Access global state
│   ├── useWorkspaceState.ts  # Selector for workspace state
│   ├── useTemplateData.ts    # Selector + actions for templates
│   └── useProfileData.ts     # Selector + actions for profiles
```

**Key Concepts**:

- **Single Source of Truth**: All state lives in `AppState` at the root level
- **Centralized Message Handler**: `AppStateContext` captures ALL messages before any component mounts
- **No Timing Issues**: State is available regardless of component mount order
- **Hooks as Selectors**: Custom hooks read from global state and provide action functions

**AppState Structure**:

```typescript
interface AppState {
  workspace: {
    hasWorkspace: boolean;
    isInitialized: boolean;
    isReady: boolean;
  };
  templates: {
    repositories: RepositoryTemplatesMap[];
    installed: InstalledTemplatesMap;
    isLoading: boolean;
  };
  profiles: {
    list: Profile[];
    isLoading: boolean;
  };
}
```

**Component Structure**:

```
components/
├── App.tsx                   # Root component (wrapped by AppStateProvider)
├── organisms/
│   ├── ActionsSection.tsx    # Workspace initialization button
│   ├── TemplateSection.tsx   # Template management container
│   └── ProfileSection.tsx    # Profile management
├── molecules/
│   ├── SearchBar.tsx         # Search input with debouncing
│   ├── RepositorySection.tsx # Repository display
│   └── TypeSection.tsx       # Collapsible type section
└── atoms/
    └── TemplateItem.tsx      # Individual template checkbox
```

**Custom Hooks**:

- `useVSCodeAPI()`: Access to VSCodeMessenger singleton
- `useAppState()`: Access to global application state (low-level, use selectors instead)
- `useWorkspaceState()`: Workspace state selector (hasWorkspace, isInitialized, isReady)
- `useTemplateData()`: Template state + actions (repositories, installed, install/uninstall)
- `useProfileData()`: Profile state + actions (list, apply/delete)
- `useDebounce()`: Debounce search input
- `useExpansionState()`: Persistent section expansion state (stored in VS Code state API)

**State Management Pattern**:

```typescript
// 1. AppStateProvider wraps the entire app (in main.tsx)
render(
  <AppStateProvider>
    <App />
  </AppStateProvider>,
  document.body
);

// 2. AppStateProvider sets up ONE centralized message listener
useEffect(() => {
  const handleMessage = (message: ExtensionMessage) => {
    switch (message.command) {
      case "workspaceStateUpdate":
        setState(prev => ({ ...prev, workspace: { ...message } }));
        break;
      // ... handle all message types
    }
  };

  messenger.onMessage("workspaceStateUpdate", handleMessage);
  messenger.sendMessage({ command: "webviewReady" });
}, []);

// 3. Components use selector hooks to access state
const { repositories, installTemplate } = useTemplateData();
```

**Message Protocol**:

```typescript
// Extension → Webview (captured by AppStateContext)
// All messages are received and update global state automatically

// Webview → Extension (from hooks or components)
messenger.sendMessage({
  command: "installTemplate",
  template: templateData,
});
```

**Best Practices**:

- **State Management**:
  - ALL state should live in `AppState` (never use local useState for extension data)
  - Use selector hooks (`useTemplateData`, `useWorkspaceState`) instead of `useAppState` directly
  - Keep action functions (like `installTemplate`) in hooks, not components
  - Never set up message listeners in individual components or hooks (only in `AppStateContext`)
- **Component Design**:
  - Use functional components with hooks (no class components)
  - Keep components small and focused (single responsibility)
  - Components should be presentational - get data from hooks, not message listeners
- **Communication**:
  - Use typed message interfaces (`src/features/panel-ui/types/webviewMessages.ts`)
  - Use `VSCodeMessenger` class for all extension communication
  - Actions send messages; state updates come from `AppStateContext`
- **UI/UX**:
  - Use debouncing for search/filter operations (`useDebounce` hook)
  - Persist UI state in VS Code state API (expansion states, etc.)
  - Use existing CSS variables for theming (maintain VS Code theme compatibility)
  - Follow Preact conventions (JSX, hooks, functional patterns)

**Adding New State**:

1. Add the state shape to `AppState` interface in `types/appState.ts`
2. Initialize the state in `initialAppState`
3. Add message handler in `AppStateContext.tsx` to update the state
4. Create a selector hook in `hooks/` (e.g., `useMyData.ts`) that reads from `useAppState()`
5. Components use the new hook to access the state

**Adding New Features**:

1. Create a new component in `webview/components/` if UI is needed
2. Use existing hooks to access state; create new hooks if new state is needed
3. Update message types in `types/webviewMessages.ts` if new messages are needed
4. Handle new messages in `AppStateContext.tsx` to update state
5. Handle new commands in `NexkitPanelMessageHandler` (extension side)

**Build Configuration**:

- Preact dependencies are in `devDependencies` (bundled by esbuild)
- esbuild config includes JSX transform (`jsx: 'automatic'`, `jsxImportSource: 'preact'`)
- Entry point is `webview/main.tsx`
- Output is `out/webview.js` (bundled, minified in production)
- Preact (~3KB gzipped) is included in the bundle, not as external dependency

### Telemetry

**Location**: `src/shared/services/telemetryService.ts`

**What to Track**:

- Extension activation/deactivation
- Command executions (with command name, no user data)
- Errors and exceptions (without PII)
- Performance metrics (operation duration)

**What NOT to Track**:

- File names, paths, or contents
- User settings or configuration values
- Workspace or project names
- IP addresses (masked by Application Insights)

**Best Practices**:

- Respect VS Code global telemetry setting
- Respect `nexkit.telemetry.enabled` setting
- Use `TelemetryService.trackEvent()` for events
- Use `TelemetryService.trackError()` for errors
- Use `TelemetryService.trackPerformance()` for timing

## Testing

### Test Organization

- **Unit Tests**: Test individual services in isolation
- **Integration Tests**: Test feature workflows end-to-end
- **Test Doubles**: Use sinon for mocks/stubs

### Test Naming

```typescript
suite("Unit: ServiceName", () => {
  test("Should do something when condition is met", async () => {
    // Test implementation
  });
});
```

### Coverage Requirements

- **Core Services**: >70% coverage
- **Feature Services**: >60% coverage
- **UI/Commands**: Best effort

### Running Tests

```bash
npm test              # All tests
npm run test:unit     # Unit only
npm run test:coverage # With coverage
```

## Common Tasks

### Adding a New Command

1. Add constant to `src/shared/constants/commands.ts`
2. Add command to `package.json` contributions
3. Create command registration function in feature folder
4. Call registration in `src/extension.ts` activation

### Adding a New Service

1. Create service class in appropriate feature folder
2. Add service to `ServiceContainer` interface
3. Instantiate in `initializeServices()`
4. Inject into commands/providers that need it

### Adding a New Configuration Setting

1. Add to `package.json` configuration section
2. Add getter/setter to `SettingsManager`
3. Document in README.md

### Adding a New Template Type

1. Add type to `AITemplateFileType` enum
2. Update `RepositoryConfig` paths interface
3. Update webview UI to display new type
4. Update installation logic if needed

### Fetching from GitHub API

Use the pattern in `TemplateFetcherService`:

```typescript
const response = await fetch(url, {
  headers: {
    "User-Agent": "nexus-nexkit-vscode/0.6.0",
    Accept: "application/vnd.github.v3+json",
  },
});

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
}

const data = await response.json();
```

## Release Process

This project uses **semantic-release** with **Conventional Commits**:

- Commits to `main` → stable releases
- Commits to `develop` → beta pre-releases
- Version bumps are automatic based on commit types
- CHANGELOG is generated automatically
- GitHub releases created with `.vsix` assets

**Do NOT manually**:

- Bump version in `package.json`
- Create git tags
- Edit CHANGELOG.md manually

## Common Pitfalls to Avoid

1. **Don't block extension activation**: Heavy operations should run async after activation
2. **Don't forget backups**: Always backup before destructive file operations
3. **Don't hardcode paths**: Use `vscode.Uri.joinPath()` and VS Code APIs
4. **Don't ignore errors silently**: Always log and inform users
5. **Don't forget disposal**: Register disposables in `context.subscriptions`
6. **Don't mutate settings directly**: Use `SettingsManager` abstraction
7. **Don't use synchronous fs**: Use `fs.promises` or VS Code workspace APIs
8. **Don't forget cross-platform**: Test on Windows, macOS, Linux

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## Getting Help

- Check existing code in similar features
- Review VS Code API documentation
- Ask in pull request comments
- Reference CONTRIBUTING.md for workflow

---

**Remember**: Keep it simple, maintainable, and user-friendly. Follow existing patterns and conventions.
