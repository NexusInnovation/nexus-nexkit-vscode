# Architecture — Nexkit VS Code Extension

## Executive Summary

Nexkit is a service-oriented VS Code extension built with TypeScript and Preact. It follows a dependency injection pattern via a centralized `ServiceContainer`, communicates between the extension host and a webview sidebar through message passing, and organizes code by feature modules with shared infrastructure.

## Technology Stack

| Category       | Technology                 | Version     | Justification                                         |
| -------------- | -------------------------- | ----------- | ----------------------------------------------------- |
| Language       | TypeScript                 | 5.9.x       | Strict typing, VS Code ecosystem standard             |
| Runtime        | Node.js                    | 22.x (CI)   | VS Code extension host runtime                        |
| Module System  | CommonJS                   | —           | Required by VS Code extension host                    |
| Compile Target | ES2022                     | —           | Modern JS features, VS Code minimum                   |
| Extension API  | VS Code Extension API      | ^1.105.0    | Webview, commands, settings, SCM, authentication      |
| UI Framework   | Preact                     | 10.25.x     | Lightweight React-compatible for webviews             |
| Bundler        | esbuild                    | 0.27.x      | Fast bundling, two entry points (extension + webview) |
| Testing        | Mocha + Sinon              | 10.x / 19.x | VS Code recommended test framework                    |
| Coverage       | nyc                        | 15.x        | Istanbul-based coverage (lcov + text)                 |
| Telemetry      | Azure Application Insights | 2.9.x       | Usage analytics (opt-in, privacy-respecting)          |
| Formatting     | Prettier                   | 3.7.x       | Runtime dependency (used for MCP config formatting)   |

## Architecture Pattern

### Service-Oriented with Dependency Injection

The extension uses a **service-oriented architecture** with manual dependency injection through a `ServiceContainer` interface. All services are instantiated in `initializeServices()` and passed to commands and providers.

```
┌───────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                 │
│                                                           │
│  ┌──────────────┐    ┌──────────────────────────────────┐ │
│  │ extension.ts │───►│      ServiceContainer            │ │
│  │  activate()  │    │  ┌─────────────────────────────┐ │ │
│  └──────┬───────┘    │  │ 27 Services:                │ │ │
│         │            │  │  - LoggingService           │ │ │
│         │            │  │  - TelemetryService         │ │ │
│         │            │  │  - AITemplateDataService    │ │ │
│         │            │  │  - MCPConfigService         │ │ │
│         │            │  │  - ExtensionUpdateService   │ │ │
│         │            │  │  - ProfileService           │ │ │
│         │            │  │  - CommitMessageService     │ │ │
│         │            │  │  - ... (20 more)            │ │ │
│         │            │  └─────────────────────────────┘ │ │
│         │            └──────────────┬───────────────────┘ │
│         │                           │                     │
│         ▼                           ▼                     │
│  ┌──────────────┐    ┌──────────────────────────────────┐ │
│  │   Commands   │    │   NexkitPanelMessageHandler      │ │
│  │  (16+ cmds)  │    │   (Extension ↔ Webview bridge)   │ │
│  └──────────────┘    └──────────────┬───────────────────┘ │
│                                     │ postMessage()       │
└─────────────────────────────────────┼─────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │        Webview (Preact SPA)        │
                    │                                    │
                    │  ┌──────────────────────────────┐  │
                    │  │  AppStateContext (central)   │  │
                    │  │  TemplateMetadataContext     │  │
                    │  └──────────┬───────────────────┘  │
                    │             │                      │
                    │  ┌──────────▼───────────────────┐  │
                    │  │  Hooks (11 custom hooks)     │  │
                    │  │  useAppState, useTemplateData│  │
                    │  │  useProfileData, useMode ... │  │
                    │  └──────────┬───────────────────┘  │
                    │             │                      │
                    │  ┌──────────▼───────────────────┐  │
                    │  │  Components (Atomic Design)  │  │
                    │  │  atoms → molecules → organisms│ │
                    │  └──────────────────────────────┘  │
                    └────────────────────────────────────┘
```

### Message Passing Protocol

The extension host and webview communicate via a typed message protocol:

- **Webview → Extension**: `WebviewMessage` (e.g., `installTemplate`, `getTemplateData`, `applyProfile`)
- **Extension → Webview**: `ExtensionMessage` (e.g., `templateData`, `workspaceState`, `metadataScanProgress`)

All message handling is centralized in `NexkitPanelMessageHandler` (extension side) and `AppStateContext` (webview side).

### Event-Driven Inter-Service Communication

Services use VS Code's `EventEmitter` pattern for loose coupling:

```typescript
// Service emits
_onDataChanged = new vscode.EventEmitter<void>();
onDataChanged: vscode.Event<void> = this._onDataChanged.event;

// Consumer subscribes
services.aiTemplateData.onDataChanged(() => sendTemplateData());
services.profileService.onProfilesChanged(() => sendProfilesData());
services.devOpsConfig.onConnectionsChanged(() => sendDevOpsConnections());
```

## Feature Modules

### ai-template-files (Core Feature)

The template management system is the largest feature, organized as a layered architecture:

```
providers/           → Data source abstraction (GitHub API, local folders)
  ├── RepositoryTemplateProvider   — Fetches from GitHub repos via API
  └── LocalFolderTemplateProvider  — Reads from local filesystem

services/            → Business logic layer
  ├── RepositoryManager            — Manages configured repository sources
  ├── TemplateFetcherService       — Orchestrates fetching from all providers
  ├── TemplateDataStore            — In-memory cache with change events
  ├── TemplateFileOperations       — Install/uninstall file I/O
  ├── InstalledTemplatesStateManager — Tracks installed templates (workspace state)
  ├── AITemplateDataService        — ★ Facade — single entry point for all template ops
  ├── TemplateMetadataService      — Template metadata (descriptions, tags)
  └── TemplateMetadataScannerService — Background metadata indexing for fuzzy search

models/              → Data structures
  ├── AITemplateFile               — Template descriptor (name, type, rawUrl, repository)
  ├── InstalledTemplateRecord      — Installed template tracking record
  ├── RepositoryConfig             — Repository source configuration
  └── TemplateMetadata             — Extended metadata for search
```

### initialization (Workspace Setup)

Orchestrates first-run workspace configuration through deployers:

```
WorkspaceInitializationService    → Orchestrator
  ├── GitIgnoreConfigDeployer     → Adds .nexkit/ to .gitignore
  ├── MCPConfigDeployer           → Deploys workspace MCP config
  ├── RecommendedExtensionsConfigDeployer → extensions.json
  ├── RecommendedSettingsConfigDeployer   → settings.json
  ├── AITemplateFilesDeployer     → Deploys selected templates
  └── ProfileSelectionPromptService → Profile picker during init

StartupVerificationService        → Runs on every activation
  ├── GitIgnoreConfigDeployer     → Verify .gitignore
  ├── RecommendedSettingsConfigDeployer → Verify settings
  ├── NexkitFileMigrationService  → Migrate legacy files
  └── GitHubAuthPromptService     → Prompt for GitHub auth
```

### panel-ui (Webview Sidebar)

Preact single-page application using Atomic Design:

- **State**: Centralized `AppState` in `AppStateContext.tsx` — workspace, templates, profiles, devOps, workflows, metadataScan
- **Hooks**: Selector hooks abstract state access (`useTemplateData`, `useProfileData`, `useMode`)
- **Components**: Purely presentational, action logic lives in hooks
- **No direct `addEventListener('message')`** in components — all handled by context

### mcp-management

Manages MCP server configuration at two levels:

- **User-level**: `~/.vscode/mcp.json` (persists across workspaces)
- **Workspace-level**: `.vscode/mcp.json` (project-specific)

Required servers: Context7, Sequential Thinking.

### commit-management

Uses VS Code's Language Model API (GitHub Copilot backend) to generate commit messages:

1. Gets staged diff from Git extension API
2. Truncates to 8000 chars max
3. Sends to LM with configurable system prompt (supports `{{diff}}` placeholder)
4. Populates SCM input box with result

### extension-updates

Self-update mechanism:

1. `ExtensionGitHubReleaseService` checks GitHub Releases API
2. Downloads `.vsix` asset if newer version found
3. Installs via `vscode.commands.executeCommand('workbench.extensions.installExtension')`
4. Status bar indicator shows update availability

## Settings Architecture

All settings are accessed through `SettingsManager` (static class):

- **VS Code Configuration** (`nexkit.*`): Repositories, telemetry, mode, profiles, commit message settings
- **Workspace State**: `workspaceInitialized`, `lastAppliedProfile`, `devOpsConnections`
- **Global State**: `lastUpdateCheck`, `firstTimeUser`

Direct calls to `vscode.workspace.getConfiguration()` are forbidden outside `SettingsManager`.

## Build Architecture

Two esbuild entry points producing two bundles:

| Bundle    | Entry                                    | Output             | Target                 |
| --------- | ---------------------------------------- | ------------------ | ---------------------- |
| Extension | `src/extension.ts`                       | `out/extension.js` | Node.js (CommonJS)     |
| Webview   | `src/features/panel-ui/webview/main.tsx` | `out/webview.js`   | Browser (IIFE bundle)  |

Static assets (HTML, CSS, codicons) are copied from `src/features/panel-ui/webview/static/` and from `src/features/panel-ui/webview/index.html` and `styles.css` to the corresponding locations under `out/webview/`.

## Testing Strategy

- **Framework**: Mocha + Sinon (VS Code recommended)
- **Coverage**: nyc with lcov + text reporters
- **Test location**: `test/suite/` mirrors `src/` structure
- **Naming**: `<serviceName>.test.ts`, `<serviceName>.integration.test.ts`
- **Targets**: Core services >70%, feature services >60%, UI/commands best effort
- **CI**: Tests run on Ubuntu (headless via xvfb), Windows, and macOS
- **Pre-commit**: Lefthook runs `npm run pretest` (compile + lint)

## CI/CD Pipeline

```
ci-cd.yml
  ├── quality-gate (3 OS matrix)
  │   ├── Type checking
  │   ├── Lint
  │   ├── Compile
  │   └── Tests
  ├── security
  │   ├── npm audit (high severity)
  │   └── CycloneDX SBOM generation
  ├── build
  │   ├── Package (esbuild --production)
  │   ├── VSIX bundle
  │   └── Bundle size check (512KB target)
  └── release (semantic-release)
      ├── main → stable vX.Y.Z
      └── develop → beta vX.Y.Z-beta.N
```

## Security Considerations

- **CSP**: Webview uses Content Security Policy with nonce-based script loading
- **Telemetry**: Opt-in, respects VS Code global setting, no PII logged
- **GitHub API**: User-Agent header, 4xx/5xx handling, rate-limit awareness
- **Auth**: GitHub authentication via VS Code's built-in auth provider
- **Secrets**: No hardcoded secrets; connection strings in settings
- **SBOM**: CycloneDX generated per CI run for supply chain visibility
