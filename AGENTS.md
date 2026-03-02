# AGENTS.md

## Project Overview

Nexkit is a VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories. It also handles workspace initialization, MCP server configuration, and automated extension self-updates.

**Key technologies:**

- TypeScript 5.x (strict mode)
- VS Code Extension API 1.105.0+
- Preact for the webview sidebar UI
- esbuild for bundling
- Mocha + Sinon for testing
- semantic-release + Conventional Commits for automated versioning

**Architecture:** Service-oriented with dependency injection via `ServiceContainer`. All services are instantiated in `src/core/serviceContainer.ts`.

## Setup Commands

```bash
# Prerequisites: Node.js 20.x+, VS Code 1.105.0+
git clone https://github.com/NexusInnovation/nexus-nexkit-vscode.git
cd nexus-nexkit-vscode
npm ci
```

## Development Workflow

```bash
# Incremental build (one-shot)
npm run compile          # or: npm run build

# Watch mode (recompiles on every save — use this during development)
npm run watch

# Type-check only (no output)
npm run check:types

# Format all TS/JS files with Prettier
npm run format
```

**Run the extension locally:**  
Press `F5` in VS Code. This opens an Extension Development Host with the extension loaded. Changes are picked up after rebuilding (`npm run watch` handles this automatically).

**Output directory:** `out/`  
The compiled extension entry point is `out/extension.js`. The bundled webview is `out/webview.js`.

## Testing Instructions

```bash
# Compile test files first (required before running tests)
npm run test-compile      # compiles src + test to out/

# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run with coverage (generates lcov + text reports)
npm run test:coverage
```

Tests live in `test/suite/` and mirror the `src/` structure. They use **Mocha** with **Sinon** for mocking.

**Naming convention:**

```
test/suite/<serviceName>.test.ts
```

**Coverage targets:**

- Core services: >70%
- Feature services: >60%
- UI/commands: best effort

**Important:** `npm test` runs `pretest` automatically, which compiles and lints before running tests. If lint or type errors exist, tests will not run.

## Code Style

```bash
# Lint all TypeScript source files
npm run lint             # ESLint with @typescript-eslint

# Format source files
npm run format           # Prettier — runs on **/*.{ts,tsx,js}
```

**Conventions:**

- Strict TypeScript — explicit return types on all public methods
- `async/await` always preferred over `.then()` chains
- Private fields prefixed with underscore: `_fieldName`
- Services end with `Service`, deployers with `Deployer`, providers with `Provider`
- Constants use `UPPER_SNAKE_CASE` or a `const`-asserted PascalCase object
- One class per file; related interfaces may live in the same file
- All commands registered via `registerCommand()` in `src/shared/commands/commandRegistry.ts`
- Settings accessed exclusively through `SettingsManager` — never via `vscode.workspace.getConfiguration()` directly

## Project Structure

```
src/
├── extension.ts                  # Activation / deactivation entry point
├── core/
│   ├── serviceContainer.ts       # Dependency injection container
│   └── settingsManager.ts        # VS Code settings facade
├── features/                     # One sub-folder per feature
│   ├── ai-template-files/        # Template fetching, caching, installation
│   ├── backup-management/        # Backup/restore before destructive ops
│   ├── extension-updates/        # Checks GitHub releases, installs updates
│   ├── initialization/           # Workspace first-run setup
│   ├── mcp-management/           # MCP server config (user & workspace level)
│   ├── panel-ui/                 # Webview sidebar (Preact)
│   │   └── webview/              # Preact app (components, hooks, contexts)
│   └── profile-management/       # Save / apply / delete template profiles
└── shared/
    ├── commands/                 # commandRegistry.ts
    ├── constants/                # Commands, settings keys, etc.
    ├── services/                 # TelemetryService, LoggingService
    └── utils/                    # Helper functions
```

## Adding New Features

### New command

1. Add constant to `src/shared/constants/commands.ts`
2. Add command entry to `package.json` `contributes.commands`
3. Create `register<Feature>Command()` in the feature folder
4. Call it inside `src/extension.ts` activation

### New service

1. Create the class in the appropriate `src/features/<feature>/` folder
2. Add it to the `ServiceContainer` interface in `src/core/serviceContainer.ts`
3. Instantiate it in `initializeServices()`
4. Inject it into the commands/providers that need it

### New setting

1. Add to `package.json` `contributes.configuration`
2. Add getter/setter to `src/core/settingsManager.ts`
3. Document in `README.md`

## Build and Deployment

```bash
# Production bundle (runs type-check + lint + esbuild --production)
npm run package           # outputs optimised out/extension.js + out/webview.js

# Dry-run semantic-release (see what version would be created)
npm run release:dry
```

**Release process is fully automated** — do not manually bump `package.json` or create `v*` tags:

| Branch    | Release type         |
| --------- | -------------------- |
| `main`    | Stable `vX.Y.Z`      |
| `develop` | Beta `vX.Y.Z-beta.N` |

Merging a PR to either branch triggers the CI pipeline which runs tests, lint, and `semantic-release`. The computed version is based on **Conventional Commits** in the merged commits.

## Commit Message Format (Conventional Commits)

```
<type>[optional scope]: <description>

# Example:
feat(mcp-management): add workspace-level MCP server support
fix(panel-ui): resolve template checkbox state race condition
```

| Type                                 | Version bump |
| ------------------------------------ | ------------ |
| `fix`/`perf`/`revert`                | patch        |
| `feat`                               | minor        |
| `feat!` or `BREAKING CHANGE:` footer | major        |

## Pull Request Guidelines

1. Branch from `develop` for new features/fixes.
2. Run `npm run lint` and `npm test` locally before opening a PR — the CI will catch failures, but fix them first.
3. PR title must follow Conventional Commits format: `feat(scope): description`
4. Do **not** manually edit `CHANGELOG.md` or bump the version in `package.json`.
5. Fill in the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).

## Webview (Preact) Guidelines

The sidebar panel is a Preact single-page app bundled by esbuild.

- **All state** lives in `AppState` (see `src/features/panel-ui/webview/types/appState.ts`)
- **Centralized message handling** in `AppStateContext.tsx` — never add `window.addEventListener('message', …)` inside individual components or hooks
- Use selector hooks (`useTemplateData`, `useWorkspaceState`) instead of calling `useAppState()` directly
- Action functions (e.g. `installTemplate`) belong in hooks, not components
- Components should be purely presentational

## Common Pitfalls

- **Activation performance:** heavy operations must be deferred — do not block the activation path in `extension.ts`
- **File operations:** always create a backup (`BackupService`) before overwriting files in `.github/`
- **Cross-platform paths:** use `vscode.Uri.joinPath()` — never string-concatenate paths
- **Disposables:** register every `Disposable` with `context.subscriptions`
- **GitHub API calls:** include a `User-Agent` header; handle 4xx/5xx and rate-limit responses gracefully
- **Telemetry:** never log file names, paths, workspace names, or any user content; respect `nexkit.telemetry.enabled` and the VS Code global telemetry setting
- **Settings:** always read/write via `SettingsManager`, never touch `vscode.workspace.getConfiguration()` directly

## Debugging

- Use `F5` to launch the Extension Development Host.
- Extension log output appears in the **Output** panel under "Nexkit".
- For webview debugging: open the developer tools inside the Extension Development Host with `Help → Toggle Developer Tools`.
- See `docs/TEMPLATE_DEBUGGING.md` and `docs/LOGGING_ENHANCEMENTS.md` for additional diagnostics.

## Infrastructure

The `infrastructure/` folder contains:

- `telemetry.bicep` — Azure Application Insights deployment
- `badge-service/` — Azure Function that powers the VS Code Marketplace download badge

These are deployment-only concerns; they are not part of the extension bundle.
