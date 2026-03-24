# NexKit Codebase Exploration Summary

**Date**: March 17, 2026  
**Scope**: Hook configurations, test patterns, initialization flow, file deployment, project type detection

---

## 1. Hook Setup & Configuration

### Current Hook Configuration Status: ✅ **FULLY CONFIGURED**

The project uses **Lefthook** for Git hook management.

#### Files Involved

| File | Purpose |
|------|---------|
| `lefthook.yml` | Hook configuration |
| `package.json` | Hook setup command (`prepare` script) |
| `.github/workflows/commitlint.yml` | CI workflow for commit validation |

#### Hook Definitions

```yaml
# lefthook.yml
commit-msg:
  jobs:
    - run: npx commitlint --edit {1}

pre-commit:
  jobs:
    - run: npm run pretest
```

**Hook Installation**: Automatic via `npm ci` → `prepare` script → `lefthook install`

#### Hooks in VS Code Settings

The project also configures VS Code chat hooks:

```json
{
  "chat.hooksFilesLocations": {
    ".nexkit/hooks": true
  },
  "chat.useHooks": true
}
```

**Location**: `src/features/initialization/recommendedSettingsConfigDeployer.ts`

**Integration Point**: Deployed during workspace initialization via `RecommendedSettingsConfigDeployer`

### Hook Support in Template System

Hooks are treated as a **first-class template type** alongside agents, prompts, instructions, and chatmodes:

- **Template Type Enum**: Includes `"hooks"` type
- **Repository Paths**: Can specify `"hooks"` path in `nexkit.repositories` config
- **Installation**: Same deployment flow as other template types
- **Location**: `.nexkit/hooks/` directory (created during initialization)

---

## 2. Test Command Definitions & Execution Patterns

### Test Scripts in package.json

```json
{
  "test-compile": "tsc -p ./",                    // Compile TypeScript to out/
  "pretest": "npm run test-compile && npm run lint",  // Pre-flight checks
  "test": "node ./out/test/runTest.js",           // Main test runner
  "test:unit": "node ./out/test/runTest.js",      // Unit tests (same runner)
  "test:integration": "node ./out/test/runTest.js",  // Integration tests (same runner)
  "test:coverage": "nyc --reporter=lcovonly --reporter=text node ./out/test/runTest.js"
}
```

### Test Execution Flow

```
npm test
  ↓
pretest script (auto-run)
  ├─ npm run test-compile → TypeScript → out/
  └─ npm run lint → ESLint validation
  ↓
test script
  └─ node ./out/test/runTest.js
      └─ Mocha test runner (in out/test/suite/)
```

### Key Test Framework Details

| Tool | Purpose | Config |
|------|---------|--------|
| **TypeScript** | Type compilation | `tsconfig.json` |
| **Mocha** | Test runner | Tests in `test/suite/` |
| **Sinon** | Mocking/stubbing | Used in unit tests |
| **NYC/nyc** | Coverage reporting | `test:coverage` script |
| **@vscode/test-electron** | VS Code extension testing | ESM test environment |

### Test File Structure

```
test/
├── runTest.ts              # Test initialization (opens VS Code test window)
├── suite/
│   ├── <feature>.test.ts   # One test file per service
│   ├── extension.test.ts
│   ├── startupVerificationService.test.ts
│   ├── recommendedSettingsConfigDeployer.test.ts
│   └── ... (30+ test files)
```

**Naming Convention**: `<serviceName>.test.ts` mirrors `src/` structure

### Test Execution Constraints

- **Pretest Hook**: Lint and type-check must pass before tests run
- **Pre-commit Hook**: `npm run pretest` runs on every commit
- **Coverage Targets**:
  - Core services: >70%
  - Feature services: >60%
  - UI/commands: best effort

### How Tests Run in CI/CD

1. **GH Actions Workflow**: `.github/workflows/ci-cd.yml`
2. **Steps**: Version → Install → Test (pretest auto-runs)
3. **On Failure**: CI pipeline stops; no release created
4. **Semantic Release**: `npm run release` runs on successful test + lint

---

## 3. Initialization Flow & Validation Points

### Workspace Initialization Overview

**Entry Point**: `src/features/initialization/`

#### High-Level Flow

```
Extension Activation
  ↓
SettingsManager.initialize()
  ↓
initializeServices() [DI Container]
  ↓
Async Background Tasks:
  ├─ startupVerification.verifyOnStartup()
  ├─ extensionUpdate.checkForExtensionUpdates()
  ├─ mcpConfig.promptInstallMCPs()
  ├─ aiTemplateData.initialize()
  └─ workspaceInitPrompt.promptInitWorkspace()
  ↓
User Triggers: Nexkat: Initialize Workspace
  ↓
workspaceInitializationService.initializeWorkspace()
```

### Validation Checklist During Initialization

| Step | Service | Validation |
|------|---------|-----------|
| 1. Verify Config | `StartupVerificationService` | Checks gitignore, settings, file migration |
| 2. Backup | `BackupService` | Backs up `.nexkit/` templates before operations |
| 3. Deploy Extensions | `RecommendedExtensionsConfigDeployer` | Creates/merges `.vscode/extensions.json` |
| 4. Deploy MCP | `MCPConfigDeployer` | Creates/merges `.vscode/mcp.json` |
| 5. Deploy Settings | `RecommendedSettingsConfigDeployer` | Deep-merges `.vscode/settings.json` |
| 6. Deploy Gitignore | `GitIgnoreConfigDeployer` | Adds `.nexkit/` section with delimiters |
| 7. Apply Profile or Defaults | `ProfileService` or `AITemplateFilesDeployer` | Installs templates to `.nexkit/` |
| 8. Mark as Initialized | `SettingsManager` | Sets `nexkit.workspace.initialized = true` |

### StartupVerificationService Details

**Called On**: Every extension activation + workspace initialization

**Checks Performed**:

```typescript
public async verifyWorkspaceConfiguration(workspaceRoot: string): Promise<MigrationSummary | null> {
  // 1. Ensure .gitignore contains .nexkit/ exclusion
  await this._gitIgnoreConfigDeployer.deployGitignore(workspaceRoot);
  
  // 2. Ensure VS Code settings contain chat file locations + hooks config
  await this._recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceRoot);
  
  // 3. Migrate nexkit.* files from .github/ to .nexkit/
  return await this._nexkitFileMigration.migrateNexkitFiles(workspaceRoot);
}
```

**Key Property**: All checks are **non-destructive** — can run repeatedly without side effects

### Where to Add New Validations

**Option 1: Startup Verification** (runs on every activation)



```typescript
// Add to StartupVerificationService.verifyWorkspaceConfiguration()
// Used for: environment checks, config migrations, non-blocking validations
```



**Option 2: During Initialization** (runs when user explicitly initializes)

```typescript
// Add to WorkspaceInitializationService.initializeWorkspace()

// Used for: one-time setup, project-specific configs, deployment phases
```


**Option 3: Command-Specific** (runs when user triggers a command)

```typescript
// Add to specific command handler
// Used for: operation-specific validation, user input validation
```

---

## 4. File Deployer Pattern

### Deployer Architecture

All deployers follow the **same interface**:

```typescript
interface Deployer {
  deploy(workspaceRoot: string): Promise<void>;
}
```

### Existing Deployers

| Deployer | Output | Pattern | Operation |
|----------|--------|---------|-----------|
| `GitIgnoreConfigDeployer` | `.gitignore` | Section markers | Non-destructive |
| `RecommendedSettingsConfigDeployer` | `.vscode/settings.json` | Deep merge | User settings win |
| `RecommendedExtensionsConfigDeployer` | `.vscode/extensions.json` | Array merge | No duplicates |
| `MCPConfigDeployer` | `.vscode/mcp.json` | Deep merge | Preserve server entries |
| `AITemplateFilesDeployer` | `.nexkit/` templates | File write + backup | Overwrite (with backup) |

### Deployer Patterns in Detail

#### Pattern 1: Section Markers (GitIgnore)

```typescript
// Safe to run repeatedly - wraps content in markers
const nexkitSection = `# BEGIN NexKit
.nexkit/
# END NexKit`;

if (sectionRegex.test(content)) {
  // Replace existing section
  content = content.replace(sectionRegex, nexkitSection);
} else {
  // Append new section
  content += "\n" + nexkitSection;
}
```

#### Pattern 2: Deep Merge with User Priority (Settings)

```typescript
// Reads existing → deep merges → user settings take priority
if (await fileExists(targetPath)) {
  const existing = JSON.parse(await fs.promises.readFile(targetPath, 'utf8'));
  const merged = deepMerge(templateSettings, existing);  // 2nd arg overrides
  await fs.promises.writeFile(targetPath, JSON.stringify(merged, null, 2));
}
```

#### Pattern 3: Array Deduplication (Extensions)

```typescript
// Merges recommendation arrays without duplicates
const combined = new Set([
  ...(templateExtensions.recommendations || []),
  ...(existingExtensions.recommendations || []),
]);
```

### How to Create a New Deployer

```typescript
export class ProjectSettingsDeployer {
  async deploy(targetRoot: string): Promise<void> {
    const configPath = path.join(targetRoot, ".vscode", "project-settings.json");
    const configDir = path.dirname(configPath);
    
    await fs.promises.mkdir(configDir, { recursive: true });
    
    let config = this.getDefaultConfig();
    if (await fileExists(configPath)) {
      const existing = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
      config = deepMerge(this.getDefaultConfig(), existing);
    }
    
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }
  
  private getDefaultConfig() {
    return { /* your defaults */ };
  }
}
```

### Integration into Initialization

```typescript
// In WorkspaceInitializationService.initializeWorkspace()
await services.gitIgnoreDeployer.deploy(workspaceRoot);
await services.recommendedSettingsDeployer.deploy(workspaceRoot);
await services.projectSettingsDeployer.deploy(workspaceRoot);  // NEW
```

---

## 5. .github Directory Configuration

### Current Structure

```
.github/
├── workflows/
│   ├── ci-cd.yml          # Main CI workflow
│   └── commitlint.yml     # Commit message validation
├── copilot-instructions.md
├── prompts/               # Chat prompts (symlink to .nexkit/prompts)
├── skills/                # Chat skills (symlink to .nexkit/skills)
├── agents/                # Chat agents (symlink to .nexkit/agents)
└── workflows/ (subfolder)
    └── [auto-generated workflows]
```


### Key Configurations


#### CI/CD Workflow (ci-cd.yml)

The workflow:

- Runs on all pushes and PRs
- Executes: `npm ci` → `npm test` → `npm run lint` → `semantic-release`
- Sets environment: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`
- Deploys: Creates releases on `main` and beta releases on `develop`

#### Commit Linting (commitlint.yml)


- **Trigger**: PR validation
- **Validation**: `npx commitlint --edit {1}`
- **Format**: Enforces Conventional Commits (feat, fix, docs, etc.)
- **Standard**: @commitlint/config-conventional


### Important Pattern

**Template folders are symlinked, not copied**:

- Actual location: `.nexkit/agents`, `.nexkit/prompts`, `.nexkit/skills`
- Symlink location: `.github/agents`, `.github/prompts`, `.github/skills`
- Reason: Keeps VS Code chat file locations pointing to `.github/` (legacy)

---


## 6. Project Type Detection Patterns

### Current State: ❌ **NOT AUTOMATICALLY DETECTED**



The NexKit extension currently does **NOT** detect project types. It uses user-selected **operation modes** instead.

### Project Type Indicators (from BMad workflow docs)

#### Frontend Indicators



- `package.json` with react/vue/angular/next dependencies
- `playwright.config.*`, `cypress.config.*`
- `vite.config.*`, `webpack.config.*`, `next.config.*`
- Directories: `src/components/`, `src/pages/`, `src/app/`

#### Backend Indicators


- `pyproject.toml`, `pom.xml`/`build.gradle` (Java)
- `go.mod` (Go), `*.csproj`/`*.sln` (.NET)
- `Gemfile` (Ruby), `Cargo.toml` (Rust)
- Jest/vitest configs
- Directories: `src/routes/`, `src/controllers/`, `src/api/`

#### Database/Infrastructure

- `Dockerfile`, `docker-compose.yml`
- `*.tf` (Terraform), `.github/workflows/` (CI/CD)

### Recommended Detection Approach

For implementing auto-detection, scan in this order:

```typescript
// 1. Check for manifest files
const indicators = {
  ".csproj files": !!await hasCsprojFiles(),
  "package.json react": !!await hasReactInPackageJson(),
  "pyproject.toml": !!await fileExists("pyproject.toml"),
  "go.mod": !!await fileExists("go.mod"),
};


// 2. Count indicators
const backendCount = countIf(indicators, isBackendIndicator);
const frontendCount = countIf(indicators, isFrontendIndicator);

// 3. Determine type
if (backendCount > 0 && frontendCount > 0) return "fullstack";
if (backendCount > 0) return "backend";
if (frontendCount > 0) return "frontend";

return null;  // Unable to detect
```

### Where Detection Would Integrate

**Entry Point**: Create `ProjectTypeDetectorService`

**Integration Points**:

1. `ServiceContainer.ts` — Register the service

2. `WorkspaceInitializationService.initializeWorkspace()` — Call during init
3. `SettingsManager.ts` — Store detected type
4. `AITemplateDataService` — Filter templates by project type
5. `RecommendedSettingsConfigDeployer` — Deploy project-type-specific settings

### Storage


**Where**: `nexkit.workspace.detectedProjectType` (WorkspaceState)


**Retrieval**: `await SettingsManager.getDetectedProjectType()`

---


## 7. Settings Architecture

### Three-Tier Storage System


#### Tier 1: GlobalState (survives across VS Code instances)

```typescript
SettingsManager.isFirstTimeUser()
SettingsManager.getLastUpdateCheck()

SettingsManager.getRepositoryCommitSha()

```

#### Tier 2: WorkspaceState (per-workspace, survives reactivation)


```typescript
SettingsManager.isWorkspaceInitialized()
SettingsManager.getLastAppliedProfile()
SettingsManager.getDetectedProjectType()  // NEW (proposed)

```


#### Tier 3: Configuration API (synced, user-editable)

```typescript
SettingsManager.getRepositories()
SettingsManager.getProfiles()

SettingsManager.getUserMode()
SettingsManager.getTelemetryEnabled()
```

### Decision Tree for New Settings


Use **GlobalState** if:

- Metadata about extension state
- Survives across different workspaces
- Example: last update check time

Use **WorkspaceState** if:

- Workspace-specific, not user-editable
- Persists across activation events
- Example: workspace initialization flag, detected project type

Use **Configuration API** if:

- User needs to edit this setting
- Synced across machines (with GitHub Copilot)
- Example: repositories list, operation mode, telemetry enabled

---

## 8. Service Container & Dependency Injection

### DI Container Pattern

**Location**: `src/core/serviceContainer.ts`

```typescript
interface ServiceContainer {
  logging: LoggingService;
  telemetry: TelemetryService;
  workspaceInitialization: WorkspaceInitializationService;
  startupVerification: StartupVerificationService;
  gitIgnoreConfigDeployer: GitIgnoreConfigDeployer;
  recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer;
  // ... 30+ services
}
```

### Service Instantiation Pattern

```typescript
function initializeServices(context: vscode.ExtensionContext): ServiceContainer {
  // 1. Initialize foundational services first
  const logging = LoggingService.getInstance();
  const telemetry = new TelemetryService(logging);
  
  // 2. Instantiate services with dependencies
  const gitIgnoreDeployer = new GitIgnoreConfigDeployer();
  const settingsDeployer = new RecommendedSettingsConfigDeployer(logging);
  
  // 3. Orchestration services last

  const startupVerification = new StartupVerificationService(
    gitIgnoreDeployer,
    settingsDeployer,
    // ... other dependencies
  );

  
  // 4. Register disposables
  context.subscriptions.push(logging, telemetry);
  
  return {
    logging,
    telemetry,

    startupVerification,
    // ... all services
  };


}
```

### Key Rules



1. **Order Matters**: Foundational services first, then dependent services
2. **Always Inject**: Never instantiate services inline
3. **Disposables**: Register all Disposable objects with `context.subscriptions`
4. **Single Instance**: Each service instantiated once and reused

---


## 9. Key Files Reference

### Core Architecture


- [extension.ts](src/extension.ts) — Activation/deactivation entry point
- [src/core/serviceContainer.ts](src/core/serviceContainer.ts) — DI container
- [src/core/settingsManager.ts](src/core/settingsManager.ts) — Settings facade


### Initialization

- [src/features/initialization/workspaceInitializationService.ts](src/features/initialization/workspaceInitializationService.ts) — Init orchestration
- [src/features/initialization/startupVerificationService.ts](src/features/initialization/startupVerificationService.ts) — Startup checks
- [src/features/initialization/gitIgnoreConfigDeployer.ts](src/features/initialization/gitIgnoreConfigDeployer.ts) — Gitignore deployer
- [src/features/initialization/recommendedSettingsConfigDeployer.ts](src/features/initialization/recommendedSettingsConfigDeployer.ts) — Settings deployer
- [src/features/initialization/mcpConfigDeployer.ts](src/features/initialization/mcpConfigDeployer.ts) — MCP deployer

### AI Template Management

- [src/features/ai-template-files/models/repositoryConfig.ts](src/features/ai-template-files/models/repositoryConfig.ts) — Repository config shape

### Configuration

- [lefthook.yml](lefthook.yml) — Git hook definitions
- [package.json](package.json) — Scripts, dependencies, VS Code config

### Testing

- [test/runTest.ts](test/runTest.ts) — Test initialization
- [test/suite/](test/suite/) — Individual test files

---

## Summary Table

| Aspect | Status | Details |
|--------|--------|---------|
| **Git Hooks** | ✅ Fully Configured | Lefthook + pre-commit (lint/test), commit-msg (commitlint) |
| **Test Commands** | ✅ Well-Defined | npm test, npm run test:unit, npm run test:coverage |
| **Test Execution** | ✅ Automated | pretest hook + Mocha runner + coverage reports |
| **Initialization Flow** | ✅ Well-Orchestrated | 8-step process with validation at each stage |
| **Validation Patterns** | ✅ Standardized | Return `{ valid, error }` objects consistently |
| **File Deployers** | ✅ Excellent Pattern | 5 deployers with different strategies (merge, dedupe, sections) |
| **Project Type Detection** | ❌ Not Implemented | Ready to implement using provided patterns |
| **Settings Architecture** | ✅ Three-Tier System | GlobalState + WorkspaceState + Configuration |
| **Service Container** | ✅ Well-Implemented | DI pattern with ordered initialization |

---

## Recommended Next Steps

1. **For Project Type Detection**: Use workflow docs patterns to create `ProjectTypeDetectorService`
2. **For Hook Validation**: Add checks in `StartupVerificationService` to verify hook functionality
3. **For New Deployers**: Follow section-marker or deep-merge pattern from existing deployers
4. **For Settings**: Use three-tier decision tree and update SettingsManager, package.json, and storage location
5. **For Tests**: Mirror the existing test structure in `test/suite/` with Mocha + Sinon patterns
