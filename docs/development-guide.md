# Development Guide — Nexkit VS Code Extension

## Prerequisites

| Requirement | Version              | Notes                                       |
| ----------- | -------------------- | ------------------------------------------- |
| Node.js     | 20.x+ (CI uses 22.x) | LTS recommended                             |
| VS Code     | 1.105.0+             | Extension API minimum                       |
| npm         | Bundled with Node.js | `npm ci` for reproducible installs          |
| Git         | Any recent           | Required for commit message feature testing |

## Getting Started

### Clone and Install

```bash
git clone https://github.com/NexusInnovation/nexus-nexkit-vscode.git
cd nexus-nexkit-vscode
npm ci
```

### Build

```bash
# One-shot build (esbuild)
npm run compile        # or: npm run build

# Watch mode (auto-recompile on save — use during development)
npm run watch

# Type-check only (no output)
npm run check:types

# Production bundle (type-check + lint + esbuild --production)
npm run package
```

**Output directory:** `out/`
- `out/extension.js` — Compiled extension entry point
- `out/webview.js` — Bundled Preact webview
- `out/webview/` — Static assets (HTML, CSS, codicons)

### Run Locally

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension appears in the Activity Bar sidebar (Nexkit icon)
4. Changes are picked up after rebuild (`npm run watch` handles this automatically)

### Debug

- **Extension logs**: Output panel → "Nexkit"
- **Webview debugging**: In the Extension Development Host, `Help → Toggle Developer Tools`
- Breakpoints work in both extension host and webview code

## Testing

```bash
# Compile test files (required before running tests)
npm run test-compile     # compiles src + test to out/

# Run all tests
npm test                 # runs pretest (compile + lint) then tests

# Run unit tests only
npm run test:unit

# Run with coverage (lcov + text reports)
npm run test:coverage
```

### Test Structure

- Tests live in `test/suite/` and mirror the `src/` structure
- Framework: **Mocha** with **Sinon** for mocking
- Naming: `test/suite/<serviceName>.test.ts`
- Shared mocks: `test/suite/mockAuthentication.ts`

### Coverage Targets

| Area             | Target      |
| ---------------- | ----------- |
| Core services    | >70%        |
| Feature services | >60%        |
| UI/commands      | Best effort |

### Current Test Files (31)

| Test File                                   | Tests                        |
| ------------------------------------------- | ---------------------------- |
| `aiTemplateDataService.test.ts`             | Template data service        |
| `backupService.test.ts`                     | Backup/restore operations    |
| `commitMessageService.test.ts`              | AI commit message generation |
| `commitMessageService.integration.test.ts`  | Commit message integration   |
| `devOpsUrlParser.test.ts`                   | Azure DevOps URL parsing     |
| `extension.test.ts`                         | Extension activation         |
| `extensionUpdateService.test.ts`            | Self-update mechanism        |
| `fuzzySearch.test.ts`                       | Template fuzzy search        |
| `githubAuthPromptService.test.ts`           | GitHub auth prompting        |
| `githubWorkflowRunnerService.test.ts`       | GitHub Actions runner        |
| `installedTemplatesStateManager.test.ts`    | Installed state tracking     |
| `localFolderTemplateProvider.test.ts`       | Local folder provider        |
| `localTemplateFileWatcher.test.ts`          | File watcher                 |
| `loggingService.test.ts`                    | Logging service              |
| `mcpConfigService.test.ts`                  | MCP configuration            |
| `modeSelectionService.test.ts`              | Mode selection               |
| `nexkitFileMigrationService.test.ts`        | File migration               |
| `nexkitFileWatcherService.test.ts`          | File watcher service         |
| `profileChangeDetection.test.ts`            | Profile change detection     |
| `recommendedSettingsConfigDeployer.test.ts` | Settings deployer            |
| `repositoryManager.test.ts`                 | Repository management        |
| `serviceContainer.test.ts`                  | DI container                 |
| `settingsManager.test.ts`                   | Settings facade              |
| `startupVerificationService.test.ts`        | Startup verification         |
| `telemetryService.test.ts`                  | Telemetry                    |
| `templateDiagnostics.test.ts`               | Template diagnostics         |
| `templateMetadataScannerService.test.ts`    | Metadata scanner             |
| `templateMetadataService.test.ts`           | Metadata service             |
| `updateInstalledTemplates.test.ts`          | Template updating            |

## Code Style

```bash
# Lint
npm run lint             # ESLint with @typescript-eslint

# Format
npm run format           # Prettier on **/*.{ts,tsx,js}
```

### Conventions

- **Strict TypeScript** — explicit return types on all public methods
- **`async/await`** always preferred over `.then()` chains
- **Private fields** prefixed with underscore: `_fieldName`
- **Naming**: Services → `*Service`, Deployers → `*Deployer`, Providers → `*Provider`
- **Constants**: `UPPER_SNAKE_CASE` or `const`-asserted PascalCase object
- **One class per file**; related interfaces may share a file
- **Commands**: Registered via `register*Command()` in each feature, called from `extension.ts`
- **Settings**: Always via `SettingsManager` — never `vscode.workspace.getConfiguration()` directly
- **Paths**: Always `vscode.Uri.joinPath()` — never string concatenation
- **Disposables**: Register with `context.subscriptions`
- **Webview**: No `window.addEventListener('message')` in components — only in `AppStateContext`

## Git Workflow

### Branching

| Branch      | Purpose                           |
| ----------- | --------------------------------- |
| `main`      | Stable releases (`vX.Y.Z`)        |
| `develop`   | Beta releases (`vX.Y.Z-beta.N`)   |
| `feature/*` | Feature branches (from `develop`) |
| `fix/*`     | Bug fix branches (from `develop`) |

### Commit Messages (Conventional Commits)

```
<type>[optional scope]: <description>

# Examples:
feat(mcp-management): add workspace-level MCP server support
fix(panel-ui): resolve template checkbox state race condition
docs: update README installation section
```

| Type                                 | Version Bump |
| ------------------------------------ | ------------ |
| `fix`, `perf`, `revert`              | Patch        |
| `feat`                               | Minor        |
| `feat!` or `BREAKING CHANGE:` footer | Major        |

Enforced by Lefthook + commitlint on every commit.

### Pre-commit Hooks (Lefthook)

- `commit-msg`: Validates commit message via commitlint
- `pre-commit`: Runs `npm run pretest` (compile + lint)

### Pull Request Process

1. Branch from `develop`
2. Run `npm run lint` and `npm test` locally
3. PR title follows Conventional Commits format
4. Do **not** manually edit `CHANGELOG.md` or bump `package.json` version
5. Fill in PR template (`.github/PULL_REQUEST_TEMPLATE.md`)

## Adding New Features

### New Command

1. Add constant to `src/shared/constants/commands.ts`
2. Add command entry to `package.json` `contributes.commands`
3. Create `register<Feature>Command()` in the feature folder
4. Call it inside `src/extension.ts` activation

### New Service

1. Create class in `src/features/<feature>/`
2. Add to `ServiceContainer` interface in `src/core/serviceContainer.ts`
3. Instantiate in `initializeServices()`
4. Inject via constructor into commands/providers that need it

### New Setting

1. Add to `package.json` `contributes.configuration`
2. Add getter/setter to `src/core/settingsManager.ts`
3. Document in `README.md`

### New Webview Component

1. Create in appropriate atomic level (`atoms/`, `molecules/`, `organisms/`)
2. Keep purely presentational — action logic in hooks
3. Use selector hooks (`useTemplateData`, etc.) — not raw `useAppState()`
4. Never add direct message listeners in components

## Common Pitfalls

| Pitfall              | Guidance                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| Blocking activation  | Heavy operations must be deferred — don't block `activate()`               |
| File operations      | Always create backup (`BackupService`) before overwriting `.github/` files |
| Cross-platform paths | Use `vscode.Uri.joinPath()` — never string-concatenate                     |
| Disposables          | Register every `Disposable` with `context.subscriptions`                   |
| GitHub API           | Include `User-Agent` header; handle 4xx/5xx and rate-limit                 |
| Telemetry            | Never log file names, paths, workspace names, or user content              |
| Settings             | Always via `SettingsManager` — never direct config access                  |

## CI/CD Pipeline

Automated via `.github/workflows/ci-cd.yml`:

1. **Quality Gate**: Type check → Lint → Compile → Tests (Ubuntu, Windows, macOS)
2. **Security**: `npm audit` (high severity) + CycloneDX SBOM
3. **Build**: `npm run package` → VSIX bundle → size check (512KB target)
4. **Release**: `semantic-release` creates GitHub Release with VSIX asset

Merging to `main` produces stable releases; merging to `develop` produces beta releases.
