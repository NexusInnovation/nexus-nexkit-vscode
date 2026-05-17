# GitHub Copilot Instructions — nexus-nexkit-vscode

Nexkit is a VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories. It also handles workspace initialization, MCP server configuration, and automated extension self-updates.

**Stack:** TypeScript 5.x (strict), VS Code Extension API 1.105.0+, Preact (webview sidebar), esbuild, Mocha + Sinon.

---

## Architecture

Service-oriented with dependency injection via `ServiceContainer` (`src/core/serviceContainer.ts`). All services are instantiated once there and injected into commands and providers.

```
src/
├── extension.ts                  # Activation entry point
├── core/
│   ├── serviceContainer.ts       # DI container — all service instances
│   └── settingsManager.ts        # VS Code settings facade
├── features/                     # One sub-folder per feature
│   ├── ai-template-files/        # Template fetching, caching, installation
│   ├── apm-devops/               # Azure DevOps MCP config
│   ├── backup-management/        # Backup/restore before destructive ops
│   ├── extension-updates/        # GitHub-release-based self-update
│   ├── initialization/           # Workspace first-run setup
│   ├── mcp-management/           # MCP server config (user & workspace)
│   ├── panel-ui/                 # Webview sidebar (Preact)
│   └── profile-management/       # Save / apply / delete template profiles
└── shared/
    ├── commands/                  # commandRegistry.ts
    ├── constants/                 # commands.ts (all command IDs)
    ├── services/                  # TelemetryService, LoggingService
    └── utils/                     # Helper functions
```

---

## Core Patterns

### Services and DI

**Never instantiate services at call sites.** Always inject from `ServiceContainer`:

```typescript
services.telemetry.trackEvent("myEvent");
services.aiTemplateData.getTemplates();
```

When adding a new service: create the class → add the property to the `ServiceContainer` interface → instantiate in `initializeServices()`.

### Settings

**Never call `vscode.workspace.getConfiguration()` directly.** Use the facade:

```typescript
import { SettingsManager } from "../../core/settingsManager";

const repos = SettingsManager.getRepositories<RepositoryConfig>();
await SettingsManager.setWorkspaceInitialized(true);
```

### Command Registration

**Never call `vscode.commands.registerCommand` manually.** Use the central registry:

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

### File Operations

- Always call `BackupService.createBackup(workspaceRoot)` **before** any operation that overwrites template files in `.github/`.
- Use `vscode.Uri.joinPath()` or `path.join()` for paths — never string concatenation.
- Use `fs.promises` everywhere — never synchronous `fs` calls.

---

## Template Deployment Architecture

Templates are deployed to the **user-level directory** by default (`{VS Code User data}/User/.nexkit/`). Workspace-level deployment is opt-in via `nexkit.templates.deployMode`.

**Key services:**

| Service | Role |
|---------|------|
| `UserDirectoryService` | Resolves the `~/.nexkit/` directory and its subdirectories |
| `TemplateFileOperations` | Reads `deployMode` and writes to the correct location |
| `InstalledTemplatesStateManager` | Tracks which templates are installed (user or workspace) |
| `RecommendedSettingsConfigDeployer` | Writes `chat.*Locations` settings at `ConfigurationTarget.Global` |

**Architectural decision (locked):** NexKit does **not** deploy, manage, or migrate `copilot-instructions.md`. This file is project-owned. Nexkit's template system operates independently via `chat.instructionsFilesLocations`.

In **user mode** (default): `.gitignore`, `.vscode/extensions.json`, `.vscode/mcp.json` are **not** modified in the workspace. Chat location settings are written globally.

---

## Webview (Preact) — `panel-ui/webview/`

All panel state lives in a single `AppState` object (`webview/types/appState.ts`).

**Rules:**
- **Never** call `window.addEventListener('message', …)` inside components or hooks — only `AppStateContext.tsx` listens for extension messages.
- **Never** import `vscode` in webview code — the webview runs in a browser context.
- **Never** use `useState` for data from the extension host — it belongs in `AppState`.
- Use selector hooks (`useTemplateData`, `useWorkspaceState`, `useProfileData`, `useMode`) instead of `useAppState()` directly.
- Action functions (`installTemplate`, `applyProfile`, etc.) belong in hooks, not components.

**Communication:**

```typescript
// Webview → Extension (from hooks only)
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";
const messenger = useVSCodeAPI();
messenger.sendMessage({ command: "installTemplate", template: templateData });
```

---

## Key Conventions

- **Strict TypeScript** — explicit return types on all public methods.
- **`async/await`** always preferred over `.then()` chains.
- **Private fields** prefixed with underscore: `_fieldName`.
- **One class per file.** Related interfaces may co-locate.
- **Services** end in `Service`, deployers in `Deployer`, providers in `Provider`.
- **Disposables** — every `vscode.Disposable` must be pushed to `context.subscriptions`.
- **Error handling** — wrap risky operations in `try/catch`, log via `LoggingService`, surface via `vscode.window.showErrorMessage`.
- **GitHub API** — always include `User-Agent: nexus-nexkit-vscode/<version>` header; handle 4xx/5xx and rate-limit (429/403) responses gracefully; never hard-code tokens.

---

## Telemetry

**Never include** file names, paths, workspace names, user content, or any PII in telemetry events. Always check `nexkit.telemetry.enabled` and the VS Code global telemetry level before sending.

---

## Common Pitfalls

| Pitfall | Why it breaks |
|---------|---------------|
| Importing `vscode` in `src/.../webview/**` | Webview runs in a browser — no VS Code API node module |
| `window.addEventListener('message', …)` outside `AppStateContext.tsx` | Creates race conditions and duplicate state updates |
| Forgetting to push disposables to `context.subscriptions` | Memory leak on extension deactivation |
| Blocking the activation path in `extension.ts` | Degrades VS Code startup performance — defer heavy work |
| `vscode.workspace.getConfiguration()` directly | Bypasses `SettingsManager` — use the facade |
| String path concatenation | Use `vscode.Uri.joinPath()` or `path.join()` |
| Overwriting template files without a backup | Always call `BackupService.createBackup()` first |

---

## Tests

Tests live in `test/suite/` and mirror `src/` structure (e.g., `aiTemplateDataService.test.ts`). They use **Mocha** with **Sinon** for mocking.

```bash
npm run test-compile   # compile before running
npm test               # full suite (pretest: lint + type-check)
npm run test:unit      # unit tests only
npm run test:coverage  # with lcov + text report
```

Coverage targets: core services >70%, feature services >60%.

---

## Squad Team

This project uses Squad for AI-assisted development. Team members:

| Name | Role |
|------|------|
| Danny | Lead / Architect |
| Rusty | Extension Dev |
| Linus | UI Dev (Preact / webview) |
| Basher | Platform Dev |
| Livingston | QA Engineer |

When picking up a `squad:{member}` labeled issue, read that member's charter at `.squad/agents/{member}/charter.md` to align with their domain and style.
