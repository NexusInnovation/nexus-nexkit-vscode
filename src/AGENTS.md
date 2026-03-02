# AGENTS.md — `src/`

This file provides coding-agent-focused guidance for working within the `src/` directory of the Nexkit VS Code extension. Refer to the root [`AGENTS.md`](../AGENTS.md) for project-wide setup, build, and release instructions.

## Directory Overview

```
src/
├── extension.ts                        # Activation / deactivation entry point
├── core/
│   ├── serviceContainer.ts             # Dependency-injection container (all services)
│   └── settingsManager.ts             # VS Code settings facade
├── features/                           # One folder per product feature
│   ├── ai-template-files/             # Template fetching, caching, and installation
│   ├── apm-devops/                    # Azure DevOps MCP config and URL parsing
│   ├── apm-mode/                      # APM mode (placeholder / future feature)
│   ├── backup-management/             # Backup/restore before destructive file ops
│   ├── extension-updates/             # GitHub-release-based self-update system
│   ├── initialization/                # First-run workspace setup
│   ├── mcp-management/                # MCP server config (user & workspace level)
│   ├── panel-ui/                      # Webview sidebar panel (Preact)
│   │   ├── nexkitPanelViewProvider.ts # Webview lifecycle (extension side)
│   │   ├── nexkitPanelMessageHandler.ts # Message routing (extension side)
│   │   ├── types/                     # Shared webview message/state types
│   │   └── webview/                   # Preact SPA
│   │       ├── main.tsx               # App entry point
│   │       ├── contexts/              # AppStateContext, TemplateMetadataContext
│   │       ├── hooks/                 # Custom hooks (selectors + actions)
│   │       ├── components/            # Atoms / molecules / organisms
│   │       ├── services/              # VSCodeMessenger
│   │       └── types/                 # AppState, extension message interfaces
│   └── profile-management/            # Save / apply / delete template profiles
└── shared/
    ├── commands/                      # commandRegistry.ts + individual command files
    ├── constants/                     # commands.ts (all command IDs)
    ├── services/                      # TelemetryService, LoggingService
    └── utils/                         # extensionHelper, fileHelper, githubAuthHelper, vscodeProfileHelper
```

---

## Core Patterns

### Dependency Injection via `ServiceContainer`

All services are instantiated once in `src/core/serviceContainer.ts` and passed to commands and providers as a typed `ServiceContainer` object. **Do not use `new MyService()` at call sites** — always inject via the container.

```typescript
// Reading a service
services.telemetry.trackEvent("myEvent");
services.aiTemplateData.getTemplates();
```

When adding a service:

1. Create the class under the relevant `src/features/<feature>/` folder.
2. Add the property to the `ServiceContainer` interface.
3. Instantiate it inside `initializeServices()` in `serviceContainer.ts`.

### Settings via `SettingsManager`

Never call `vscode.workspace.getConfiguration()` directly. Use the facade:

```typescript
import { SettingsManager } from "../../core/settingsManager";

const repos = SettingsManager.getRepositories<RepositoryConfig>();
await SettingsManager.setWorkspaceInitialized(true);
```

### Command Registration

All commands must be registered through the central registry — never call `vscode.commands.registerCommand` manually.

```typescript
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerMyCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(context, Commands.MY_COMMAND, async () => {
    // implementation
  }, services.telemetry);
}
```

Then call `registerMyCommand(context, services)` from `src/extension.ts`.

---

## Feature-by-Feature Guide

### `ai-template-files/`

Manages AI template files (agents, prompts, instructions, chatmodes) fetched from GitHub repositories.

| File                                         | Responsibility                                     |
| -------------------------------------------- | -------------------------------------------------- |
| `services/aiTemplateDataService.ts`          | Main facade — initialize, fetch, install           |
| `services/repositoryManager.ts`              | CRUD for `nexkit.repositories` setting             |
| `services/templateFetcherService.ts`         | GitHub API calls for template content              |
| `services/templateDataStore.ts`              | In-memory cache + EventEmitter for UI updates      |
| `services/templateFileOperations.ts`         | File I/O — create/overwrite in `.github/`          |
| `services/installedTemplatesStateManager.ts` | Tracks which templates are installed               |
| `services/templateMetadataService.ts`        | Reads/writes `templateMetadata.json`               |
| `providers/repositoryTemplateProvider.ts`    | Fetches templates from a remote GitHub repo        |
| `providers/localFolderTemplateProvider.ts`   | Fetches templates from a local folder              |
| `models/aiTemplateFile.ts`                   | `AITemplateFile` model + `AITemplateFileType` enum |
| `models/repositoryConfig.ts`                 | `RepositoryConfig` — settings shape per repo       |

**Data flow:**

1. `AITemplateDataService.initialize()` → reads `nexkit.repositories` via `SettingsManager`
2. Each enabled repo fetched via the appropriate provider
3. Templates stored in `TemplateDataStore` (fires events on change)
4. UI triggers `installBatch()` / `installTemplate()` → `TemplateFileOperations` writes to `.github/`
5. Always call `BackupService` before overwriting existing files

**Template types** (defined in `AITemplateFileType` enum):

- `agents` — GitHub Copilot custom agents
- `prompts` — Reusable AI prompts
- `instructions` — Language-specific coding guidelines
- `chatmodes` — Specialized VS Code chat modes

### `backup-management/`

| File               | Responsibility                                                   |
| ------------------ | ---------------------------------------------------------------- |
| `backupService.ts` | Creates timestamped backups of `.github/` before destructive ops |
| `commands.ts`      | `restoreBackup`, `cleanupBackup` commands                        |

Always call `BackupService.createBackup(workspaceRoot)` before any operation that overwrites template files.

### `extension-updates/`

| File                               | Responsibility                               |
| ---------------------------------- | -------------------------------------------- |
| `extensionUpdateService.ts`        | Core update logic — check, download, install |
| `extensionGitHubReleaseService.ts` | GitHub Releases API integration              |
| `updateStatusBarService.ts`        | Status bar item showing update availability  |
| `commands.ts`                      | `checkExtensionUpdate` command               |

Respects `nexkit.extension.autoCheckUpdates` and `nexkit.extension.updateCheckInterval`. Stores last-check timestamp in `GlobalState`.

### `initialization/`

Deployers follow a single-method contract — `deployConfig(workspaceRoot: string): Promise<void>`:

| Deployer                              | Output                    |
| ------------------------------------- | ------------------------- |
| `GitIgnoreConfigDeployer`             | `.gitignore`              |
| `RecommendedSettingsConfigDeployer`   | `.vscode/settings.json`   |
| `RecommendedExtensionsConfigDeployer` | `.vscode/extensions.json` |
| `MCPConfigDeployer`                   | `.vscode/mcp.json`        |
| `AITemplateFilesDeployer`             | Templates in `.github/`   |

`WorkspaceInitializationService` orchestrates all deployers. `ModeSelectionService` determines whether to apply APM or Developer mode defaults during init.

### `mcp-management/`

`MCPConfigService` manages `~/.vscode/mcp.json` (user-level) and `.vscode/mcp.json` (workspace-level). Required servers: **context7** and **sequential-thinking**. Always preserve existing server entries when updating the config.

### `apm-devops/`

`DevOpsMcpConfigService` configures Azure DevOps MCP servers. `DevOpsUrlParser` extracts organization and project from Azure DevOps URLs.

### `profile-management/`

`ProfileService` saves/applies/deletes named template profiles stored in VS Code `GlobalState`. Each profile captures the set of currently installed templates (their IDs and source repos).

---

## Webview (Preact) — `panel-ui/webview/`

### State Architecture

All panel state lives in a single `AppState` object (defined in `types/appState.ts`). The `AppStateContext` is the **only** place that listens for messages from the extension host.

```
main.tsx
└── AppStateProvider (contexts/AppStateContext.tsx)
    └── App.tsx
        ├── organisms/ActionsSection.tsx
        ├── organisms/TemplateSection.tsx
        ├── organisms/ProfileSection.tsx
        └── ... (other sections)
```

**Rules:**

- Never call `window.addEventListener('message', …)` inside components or hooks.
- Never use `useState` for data that comes from the extension host — put it in `AppState`.
- Use selector hooks (`useTemplateData`, `useWorkspaceState`, `useProfileData`, `useMode`) instead of `useAppState()` directly.
- Action functions (e.g. `installTemplate`, `applyProfile`) live in hooks, not components.

### Hook Reference

| Hook                          | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `useVSCodeAPI()`              | Access `VSCodeMessenger` singleton                               |
| `useAppState()`               | Raw access to full `AppState` (prefer selectors)                 |
| `useWorkspaceState()`         | `hasWorkspace`, `isInitialized`, `isReady`                       |
| `useTemplateData()`           | Repository templates, installed state, install/uninstall actions |
| `useProfileData()`            | Profile list, apply/save/delete actions                          |
| `useMode()`                   | Current user mode (APM / Developer)                              |
| `useDevOpsConnections()`      | Azure DevOps connection data                                     |
| `useDebounce()`               | Debounced value for search inputs                                |
| `useExpansionState()`         | Persistent section expansion state (VS Code state API)           |
| `useFilterMode()`             | Filter/search mode state                                         |
| `useWebviewPersistentState()` | Generic VS Code state persistence                                |

### Component Structure

```
components/
├── App.tsx                        # Root component
├── atoms/
│   ├── FilterMenu.tsx
│   ├── IconTooltip.tsx
│   ├── ProfileInfoTooltip.tsx
│   ├── SearchBar.tsx
│   ├── TemplateInfoTooltip.tsx
│   └── TemplateItem.tsx           # Individual template checkbox
├── molecules/
│   ├── CollapsibleSection.tsx
│   └── TypeSection.tsx            # Collapsible template-type group
└── organisms/
    ├── ActionsSection.tsx          # Workspace init button
    ├── ApmActionsSection.tsx
    ├── ApmConnectionSection.tsx
    ├── ApmTemplateSection.tsx
    ├── FooterSection.tsx
    ├── ModeSelectionSection.tsx
    ├── ProfileSection.tsx
    ├── RepositorySection.tsx       # Repository display
    └── TemplateSection.tsx         # Template management container
```

### Adding New Panel State

1. Add the shape to `AppState` in `webview/types/appState.ts` and initialise it in `initialAppState`.
2. Add a message handler case in `AppStateContext.tsx` to update the new slice.
3. Create a selector hook in `webview/hooks/use<MyFeature>.ts`.
4. Add new message types to `types/index.ts` (webview message interfaces).
5. Handle inbound commands in `NexkitPanelMessageHandler.ts` on the extension side.

### Communication Protocol

```typescript
// Extension → Webview (captured by AppStateContext — do not intercept elsewhere)
// Webview → Extension (send from hooks via VSCodeMessenger)
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";

const messenger = useVSCodeAPI();
messenger.sendMessage({ command: "installTemplate", template: templateData });
```

---

## Shared Utilities

### `shared/utils/`

| File                     | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `extensionHelper.ts`     | Resolve extension path, read bundled assets          |
| `fileHelper.ts`          | Async file read/write helpers wrapping `fs.promises` |
| `githubAuthHelper.ts`    | GitHub OAuth token acquisition via VS Code auth API  |
| `vscodeProfileHelper.ts` | VS Code built-in profile access                      |

### `shared/services/`

| File                  | Purpose                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `telemetryService.ts` | Azure Application Insights wrapper — `trackEvent`, `trackError`, `trackPerformance` |
| `loggingService.ts`   | Structured output to VS Code Output channel "Nexkit"                                |

**Telemetry rules:** Never include file names, paths, workspace names, user content, or PII. Always check `nexkit.telemetry.enabled` and the global VS Code telemetry level before sending.

---

## Key Conventions

- **One class per file.** Related interfaces may co-locate in the same file.
- **Private fields** use underscore prefix: `_myField`.
- **Async I/O everywhere** — use `fs.promises`, never synchronous `fs` calls.
- **Path construction** — always use `vscode.Uri.joinPath()` or `path.join()`, never string concatenation.
- **Disposables** — every `vscode.Disposable` must be pushed to `context.subscriptions`.
- **Error handling** — wrap risky operations in `try/catch`, log via `LoggingService`, show via `vscode.window.showErrorMessage`.
- **GitHub API** — include `User-Agent: nexus-nexkit-vscode/<version>` header; handle 4xx/5xx and rate-limit (429/403) responses; never hard-code tokens.

## Common Pitfalls

- Importing `vscode` in webview code (`src/.../webview/**`) will break at runtime — the webview runs in a browser context without access to the VS Code API node module.
- Adding a `window.addEventListener('message', …)` anywhere outside `AppStateContext.tsx` will create race conditions and duplicate state.
- Forgetting to push disposables to `context.subscriptions` causes memory leaks when the extension is deactivated.
- Blocking the synchronous activation path in `extension.ts` degrades VS Code startup performance — defer heavy work with `setTimeout` or fire-and-forget async calls.
