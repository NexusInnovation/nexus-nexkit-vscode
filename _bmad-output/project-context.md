---
project_name: 'nexus-nexkit-vscode'
user_name: 'Eric'
date: '2026-03-25'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: 'complete'
rule_count: 58
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Runtime:** Node.js 22.x, VS Code Extension API ^1.105.0
- **Language:** TypeScript ^5.9.3 (strict mode, target ES2022, module commonjs)
- **UI Framework:** Preact ^10.25.4 (JSX via `react-jsx` with `jsxImportSource: preact`)
- **Bundler:** esbuild ^0.27.2 (two entry points: extension + webview)
- **Testing:** Mocha ^10.0.10 (TDD interface: `suite`/`test`), Sinon ^19.0.2, nyc ^15.1.0
- **Linting:** ESLint ^9.36.0 with @typescript-eslint ^8.45.0
- **Formatting:** Prettier ^3.7.4
- **Git Hooks:** Lefthook ^2.1.1 (pre-commit: `npm run pretest`, commit-msg: commitlint)
- **Commit Linting:** @commitlint/cli ^19.4.0 (config-conventional)
- **Release:** semantic-release ^25.0.2 (Conventional Commits → auto version)
- **Telemetry:** applicationinsights ^2.9.6 (only production dependency)

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **Strict mode obligatory** — `strict: true` in tsconfig. No implicit `any`, no unchecked `null`.
- **Explicit return types on public methods** — all public methods must declare their return type.
- **`async/await` always** — never use `.then()` chains. Always `async/await`.
- **`fs.promises` only** — never use `fs.readFileSync` or other synchronous calls. Always `fs.promises.*`.
- **Paths via `vscode.Uri.joinPath()` or `path.join()`** — never string-concatenate paths.
- **Private fields prefixed `_`** — convention `_myField` for all private fields.
- **Named imports** — convention `camelCase` or `PascalCase` for imports (ESLint rule).
- **`curly`, `eqeqeq`, `semi` required** — braces always present, `===` strict equality, semicolons required.
- **`no-throw-literal`** — always throw an `Error` instance, never a string or arbitrary object.
- **One class per file** — related interfaces may co-locate in the same file.
- **Constants in `UPPER_SNAKE_CASE`** or `const`-asserted PascalCase objects.

### Framework-Specific Rules

#### VS Code Extension Architecture

- **Dependency injection via `ServiceContainer`** — never `new MyService()` at call sites. Always inject via the container in `serviceContainer.ts`.
- **Settings exclusively via `SettingsManager`** — never call `vscode.workspace.getConfiguration()` directly.
- **Command registration via `commandRegistry.ts`** — never call `vscode.commands.registerCommand` manually.
- **Services end with `Service`**, deployers with `Deployer`, providers with `Provider`.
- **Every `vscode.Disposable` must be pushed to `context.subscriptions`** — forgetting causes memory leaks on deactivation.
- **Never block activation path** — defer heavy work in `extension.ts` with fire-and-forget async calls or `setTimeout`.
- **Backup before overwrite** — always call `BackupService.createBackup()` before any operation that overwrites template files in `.github/`.

#### Webview (Preact) Rules

- **Never import `vscode` in webview code** (`src/.../webview/**`) — the webview runs in a browser context without Node.js.
- **Centralized message handling in `AppStateContext.tsx` only** — never add `window.addEventListener('message', …)` inside components or hooks.
- **Never use `useState` for extension host data** — put it in `AppState` and update via `AppStateContext`.
- **Use selector hooks** (`useTemplateData`, `useWorkspaceState`, `useProfileData`, `useMode`) — never `useAppState()` directly in components.
- **Action functions live in hooks, not components** — components are purely presentational.
- **New panel state flow:** add to `AppState` → handler in `AppStateContext.tsx` → selector hook → message types in `types/index.ts` → handler in `NexkitPanelMessageHandler.ts`.

### Testing Rules

- **Mocha TDD interface** — use `suite`/`test` blocks, NOT `describe`/`it`.
- **Test file naming:** `test/suite/<serviceName>.test.ts` (unit), `<serviceName>.integration.test.ts` (integration).
- **Sinon sandbox pattern** — always `sinon.createSandbox()` in `setup()`, always `sandbox.restore()` in `teardown()`.
- **Global auth mock** — `mockAuthentication.ts` stubs `vscode.authentication.getSession` globally before all tests. Do not re-stub it in individual tests.
- **Mock extension context** — create a minimal `context` object with stubbed `workspaceState`, `globalState`, `extensionUri`, etc. Cast as `any`.
- **Coverage targets:** core services >70%, feature services >60%, UI/commands best effort.
- **`npm run pretest` compiles + lints before tests run** — if lint or type errors exist, tests will not execute.
- **Test timeout:** 10,000ms default (configured in `test/suite/index.ts`).
- **Test glob:** only files matching `suite/**/*.test.js` are picked up — do not place test files outside `test/suite/`.
- **No real GitHub API calls in unit tests** — always stub HTTP/auth calls with Sinon.

### Code Quality & Style Rules

- **Prettier formats all `*.{ts,tsx,js}` files** — run `npm run format` before committing.
- **ESLint flat config** (`eslint.config.mjs`) — no `.eslintrc` file; uses `@typescript-eslint/parser`.
- **File naming:** kebab-case for feature folders and files (e.g., `ai-template-files/`, `backupService.ts`).
- **Service class naming:** PascalCase matching the file (e.g., `MCPConfigService` in `mcpConfigService.ts`).
- **Feature folder structure:** one sub-folder per feature under `src/features/`, containing services, models, providers, and commands.
- **Shared code goes in `src/shared/`** — commands in `commands/`, constants in `constants/`, utilities in `utils/`, cross-cutting services in `services/`.
- **Error handling pattern:** wrap risky operations in `try/catch`, log via `LoggingService`, show user-facing errors via `vscode.window.showErrorMessage`.
- **GitHub API calls:** always include `User-Agent: nexus-nexkit-vscode/<version>` header; handle 4xx/5xx and rate-limit (429/403) responses; never hard-code tokens.
- **Telemetry rules:** never log file names, paths, workspace names, or any user content. Always check `nexkit.telemetry.enabled` and VS Code global telemetry level before sending.

### Development Workflow Rules

- **Conventional Commits required** — format: `<type>(<optional scope>): <description>`. Validated by commitlint at commit-msg hook.
- **Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`.
- **Type always lowercase**, scope lowercase, subject never ends with `.`, subject never PascalCase/UPPER_CASE.
- **Branching:** `main` → stable releases (`vX.Y.Z`), `develop` → beta releases (`vX.Y.Z-beta.N`). Branch from `develop` for new work.
- **Never manually bump `package.json` version** — semantic-release computes the version from commit types.
- **Never manually edit `CHANGELOG.md`** — generated automatically by semantic-release.
- **Pre-commit hook runs `npm run pretest`** (compile + lint) — code must pass before commit is allowed.
- **PR title must follow Conventional Commits format** — e.g., `feat(mcp-management): add workspace-level support`.
- **Run `npm run lint` and `npm test` locally before opening a PR.**
- **Build output:** `out/extension.js` (extension) + `out/webview.js` (Preact sidebar). Generated by esbuild.

### Critical Don't-Miss Rules

#### Anti-Patterns to Avoid

- **Never import `vscode` in `src/**/webview/**`** — runtime crash. The webview is a browser sandbox.
- **Never add `window.addEventListener('message', …)` outside `AppStateContext.tsx`** — creates race conditions and duplicate state.
- **Never string-concatenate file paths** — always `vscode.Uri.joinPath()` or `path.join()`. Cross-platform breakage otherwise.
- **Never call `vscode.workspace.getConfiguration()` directly** — always through `SettingsManager`.
- **Never `new MyService()` at call sites** — always inject from `ServiceContainer`.
- **Never forget `context.subscriptions.push(disposable)`** — memory leak on deactivation.

#### Edge Cases

- **GitHub API rate limits** — handle 429 and 403 responses gracefully. Include `User-Agent` header on every request.
- **Empty workspace** — many features depend on `vscode.workspace.workspaceFolders`; always null-check.
- **Template overwrite safety** — always `BackupService.createBackup()` before writing to `.github/`.
- **Activation performance** — `extension.ts` must not block. Heavy initialization (template fetch, metadata scan, update check) is fire-and-forget async.

#### Security Rules

- **Never hard-code tokens or secrets** — use `vscode.authentication` API for GitHub tokens.
- **Never log PII or user content in telemetry** — no file names, paths, workspace names.
- **Validate all external input** — GitHub API responses, user settings, local file content.

#### Adding New Features Checklist

- **New command:** constant in `commands.ts` → entry in `package.json` → `register<Feature>Command()` → call from `extension.ts`.
- **New service:** class in `src/features/<feature>/` → add to `ServiceContainer` interface → instantiate in `initializeServices()` → inject where needed.
- **New setting:** add to `package.json` `contributes.configuration` → add getter/setter in `SettingsManager`.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-03-25
