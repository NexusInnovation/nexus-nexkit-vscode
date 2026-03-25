# NexKit Architecture Exploration Report
**Date**: March 17, 2026  
**Scope**: Comprehensive analysis of project initialization flow, type detection, settings management, and service patterns

---

## Executive Summary

NexKit is a VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes, skills, hooks) from GitHub repositories. The architecture is built on **service-oriented design with dependency injection**.

**Key finding**: There is **NO automatic project type detection** (for .NET, Node.js, Python, etc.) in the current codebase. The extension uses **operation modes** ("APM" vs "Developer") which are user-selectable. Project type detection would need to be implemented as a new feature.

---

## 1. Project Type Detection Mechanisms

### Current State: Operation Modes (Not Project Type Detection)

The extension currently uses **operation modes** instead of project type detection:

```typescript
// From src/features/ai-template-files/models/aiTemplateFile.ts
export enum OperationMode {
  None = "None",
  Developers = "Developers",  // Full feature set
  APM = "APM",                // Essential features only
}
```

**How it works:**
1. User is prompted on first-time activation: "Choose APM Mode or Developer Mode"
2. Mode selection is stored globally via `SettingsManager.setUserMode()`
3. Repositories are filtered by mode using `RepositoryConfigManager.getRepositoriesForMode(mode)`
4. Templates are filtered to show only those relevant to selected mode

### Repository Configuration & Mode-Based Filtering

Repositories can have optional `modes` property:

```typescript
// From src/features/ai-template-files/models/repositoryConfig.ts
export interface RepositoryConfig {
  name: string;
  type?: RepositoryType;  // "github" | "local"
  url: string;
  branch?: string;
  paths: Partial<Record<AITemplateFileType, string>>;
  enabled: boolean;
  modes?: OperationMode[];  // NEW: Filter by mode
}

// Built-in repositories with mode filters:
// - "Nexus Templates" -> modes: [OperationMode.Developers]
// - "APM Templates" -> modes: [OperationMode.APM]

// Repositories without modes are shown in all modes
```

### No Automatic Project Type Detection

**Finding**: Searching the entire codebase for keywords like "detect", "project", "node", "python", ".NET", "csharp" yields NO results related to project type detection.

**What exists:**
- Environment detection: CI vs local vs test (in `githubAuthHelper.ts`)
- Workspace detection: Whether a folder is open (throughout)
- Node.js version tracking: Only for telemetry purposes

**What does NOT exist:**
- Detection of `.csproj`, `package.json`, `requirements.txt`, `pyproject.toml`, etc.
- Logic to identify project runtime or framework
- Conditional template recommendations based on project type

---

## 2. Settings Structure & SettingsManager

### Architecture: Three-Tier Settings Storage

```
┌─────────────────────────────────────────────┐
│      VS Code ExtensionContext               │
├─────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐   │
│  │  GlobalState (User level)            │   │
│  │  - firstTimeUser                     │   │
│  │  - extensionLastUpdateCheck          │   │
│  │  - repositoryCommitShas              │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  WorkspaceState (Per-workspace)      │   │
│  │  - workspaceInitialized              │   │
│  │  - workspaceInitPromptDismissed      │   │
│  │  - lastAppliedProfile                │   │
│  │  - activeDevOpsConnection            │   │
│  │  - devOpsConnections                 │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  Configuration API (Synced scope)    │   │
│  │  - nexkit.repositories               │   │
│  │  - nexkit.profiles                   │   │
│  │  - nexkit.telemetry.*                │   │
│  │  - nexkit.extension.*                │   │
│  │  - nexkit.templates.*                │   │
│  │  - nexkit.mode                       │   │
│  │  - nexkit.userMode                   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### SettingsManager Pattern

`SettingsManager` is a **static facade** over VS Code's configuration and extension state APIs:

```typescript
// Initialization (in extension.ts activation)
SettingsManager.initialize(context);

// Usage pattern: static methods with getters/setters
const isInitialized = SettingsManager.isWorkspaceInitialized();
await SettingsManager.setWorkspaceInitialized(true);

// Three categories of settings:
// 1. Workspace State getters/setters
//    - isWorkspaceInitialized()
//    - isWorkspaceInitPromptDismissed()
//    - getLastAppliedProfile()

// 2. Global State getters/setters
//    - isFirstTimeUser()
//    - getLastUpdateCheck()

// 3. Configuration getters/setters
//    - getRepositories()
//    - getProfiles()
//    - getUserMode()
//    - getTelemetryLevel()
```

### Settings Key Mappings

**Global Settings** (`nexkit.*` section):
```typescript
nexkit.repositories              // RepositoryConfig[]
nexkit.profiles                  // Profile[]
nexkit.mode                       // OperationMode
nexkit.userMode                   // "APM" | "Developer" | "notset"
nexkit.telemetry.enabled          // boolean
nexkit.telemetry.connectionString // string
nexkit.extension.autoCheckUpdates // boolean
nexkit.extension.updateCheckIntervalHours // number
nexkit.templates.autoRefreshIntervalMinutes // number
nexkit.profiles.confirmBeforeSwitch // boolean
nexkit.mcpSetup.dismissed         // boolean
```

**VS Code Settings** (deployed to `.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "chat.promptFilesLocations": { ".nexkit/prompts": true },
  "chat.instructionsFilesLocations": { ".nexkit/instructions": true, ".nexkit/skills": true },
  "chat.agentFilesLocations": { ".nexkit/agents": true },
  "chat.hookFilesLocations": { ".nexkit/hooks": true },
  "chat.useHooks": true
}
```

---

## 3. Initialization Flow & Service Orchestration

### Complete Initialization Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extension Activation                         │
│                  (activate() in src/extension.ts)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  Initialize SettingsManager │
                │  Initialize all Services    │
                │  (ServiceContainer)         │
                └─────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  ┌──────────────┐    ┌──────────────────┐   ┌─────────────┐
  │Mode Selection│    │Startup Verification   │Extension    │
  │(First-time)  │    │Checks                 │Updates      │
  └──────────────┘    └──────────────────┘   └─────────────┘
        │                     │
        │ (async)             │ (non-blocking)
        │                     │
        ▼                     ▼
  ┌─────────────────────────────────────────┐
  │  User Triggers: nexus-nexkit.initWorkspace
  │  (OR shown prompt if uninitialized workspace)
  └─────────────────────────────────────────┘
         (Command Handler: initWorkspace command)
         │
         ├─ Check if already initialized
         ├─ Prompt mode selection (if not set)
         ├─ Prompt profile selection
         │
         ▼
  ┌────────────────────────────────────────────────┐
  │ WorkspaceInitializationService.initializeWorkspace()
  └────────────────────────────────────────────────┘
         │
         ├─ StartupVerificationService.verifyWorkspaceConfiguration()
         │  ├─ GitIgnoreConfigDeployer.deployGitignore()
         │  ├─ RecommendedSettingsConfigDeployer.deployVscodeSettings()
         │  └─ NexkitFileMigrationService.migrateNexkitFiles()
         │
         ├─ GitHubTemplateBackupService.backupTemplates()
         │
         ├─ RecommendedExtensionsConfigDeployer.deployVscodeExtensions()
         │
         ├─ MCPConfigDeployer.deployWorkspaceMCPServers()
         │
         ├─ IF profile selected:
         │  │  ProfileService.applyProfile()
         │  │  ├─ Clear state
         │  │  ├─ Install batch
         │  │  └─ Store as last applied
         │  ELSE:
         │  │  AITemplateFilesDeployer.deployTemplateFiles()
         │  │  ├─ Filter out instructions
         │  │  └─ Install batch (silent, overwrite)
         │
         ▼
  ┌────────────────────────────────────────┐
  │ Mark workspace initialized             │
  │ SettingsManager.setWorkspaceInitialized│
  │ Notify listeners                       │
  └────────────────────────────────────────┘
         │
         ▼
  ┌────────────────────────────────────────┐
  │ Show success message with summary      │
  │ (files migrated, templates installed)  │
  └────────────────────────────────────────┘
```

### Initialization Service Architecture

```typescript
// From src/features/initialization/workspaceInitializationService.ts

export class WorkspaceInitializationService {
  // Event emitter for completion
  onWorkspaceInitialized: vscode.Event<void>

  async initializeWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    profileName: string | null,  // null = use defaults
    services: ServiceContainer
  ): Promise<{
    deploymentSummary: BatchInstallSummary | null
    backupPath: string | null
    migrationSummary: MigrationSummary | null
  }>
}
```

### Startup Verification Checks

**Runs at EVERY extension activation AND workspace initialization:**

```typescript
// From src/features/initialization/startupVerificationService.ts

public async verifyOnStartup(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  
  await this.verifyWorkspaceConfiguration(workspaceRoot);
  await this._githubAuthPrompt.ensureAuthenticated();
}

public async verifyWorkspaceConfiguration(workspaceRoot: string): Promise<MigrationSummary | null> {
  // ✓ Ensure .gitignore contains .nexkit/ exclusion
  await this._gitIgnoreConfigDeployer.deployGitignore(workspaceRoot);
  
  // ✓ Ensure VS Code settings contain all required chat file locations
  await this._recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceRoot);
  
  // ✓ Migrate any nexkit.* files from .github/{type}/ to .nexkit/{type}/
  return await this._nexkitFileMigration.migrateNexkitFiles(workspaceRoot);
}
```

**Non-destructive pattern**: All deployers use deep merge or section markers, safe to run repeatedly.

---

## 4. Validation Patterns & Checks

### Pattern: Return `{ valid, error }` Object

Used consistently across services:

```typescript
// Repository validation (RepositoryConfigManager)
public static validateRepository(config: RepositoryConfig): 
  { valid: boolean; error?: string } 
{
  const type = config.type || "github";
  
  if (type === "github") {
    if (!config.url.includes("github.com")) {
      return {
        valid: false,
        error: `GitHub URL must contain "github.com". Got: ${config.url}`
      };
    }
  }
  
  if (type === "local") {
    if (config.url.startsWith("http://") || config.url.startsWith("https://")) {
      return {
        valid: false,
        error: `Local repository must use a file path, not URL`
      };
    }
  }
  
  return { valid: true };
}

// Usage pattern:
const validation = RepositoryConfigManager.validateRepository(config);
if (!validation.valid) {
  console.warn(`⚠️ Invalid repository: "${config.name}". ${validation.error}.`);
  continue;  // Skip this repository
}
```

### Input Validation via vscode.InputBox

**Pattern used in profile and workspace commands:**

```typescript
const input = await vscode.window.showInputBox({
  placeHolder: "Enter profile name",
  validateInput: (value) => {
    if (!value || value.trim().length === 0) {
      return "Profile name cannot be empty";
    }
    // Return undefined if valid, error message if invalid
    return undefined;
  }
});
```

### Validation Locations

1. **Repository Configuration** (`RepositoryConfigManager`)
   - GitHub URL format checking
   - Local path format checking
   - Duplicate name/URL detection

2. **MCP Server Validation** (`MCPConfigService`)
   - Required fields presence check
   - Server command availability

3. **Profile Validation** (`ProfileService`)
   - Profile name non-empty check
   - Profile existence check

4. **DevOps URL Validation** (`DevOpsMcpConfigService`)
   - Format validation (protocol, organization, project)

---

## 5. Service Container & Dependency Injection

### Single Initialization Point

```typescript
// From src/core/serviceContainer.ts

export interface ServiceContainer {
  logging: LoggingService;
  telemetry: TelemetryService;
  mcpConfig: MCPConfigService;
  aiTemplateData: AITemplateDataService;
  // ... 20+ services
}

export async function initializeServices(
  context: vscode.ExtensionContext
): Promise<ServiceContainer> {
  // 1. Initialize logging first
  const logging = LoggingService.getInstance();
  
  // 2. Initialize telemetry with logging
  const telemetry = new TelemetryService();
  await telemetry.initialize();
  
  // 3. Initialize services with dependencies
  const installedTemplatesState = new InstalledTemplatesStateManager(context);
  const aiTemplateData = new AITemplateDataService(installedTemplatesState);
  const templateMetadata = new TemplateMetadataService(aiTemplateData.getRepositoryManager());
  
  // 4. Initialize composite services with injected dependencies
  const startupVerification = new StartupVerificationService(
    gitIgnoreConfigDeployer,
    recommendedSettingsConfigDeployer,
    nexkitFileMigration,
    githubAuthPrompt
  );
  
  // 5. Register for disposal
  context.subscriptions.push(logging, telemetry, aiTemplateData, ...);
  
  // 6. Return typed container
  return { logging, telemetry, ..., startupVerification };
}
```

### Dependency Injection in Commands

**Pattern: Always inject via ServiceContainer**

```typescript
// ✅ CORRECT: Via dependency injection
export function registerCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer  // Injected here
): void {
  registerCommand(context, Commands.INIT_WORKSPACE, async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Use injected services
    await services.workspaceInitialization.initializeWorkspace(...);
  });
}

// ❌ AVOID: Never instantiate new
// Don't do: const service = new MyService();
```

### Disposable & Resource Management

```typescript
// Services that have cleanup logic implement vscode.Disposable
// Registered in extension context for automatic cleanup
context.subscriptions.push(logging);
context.subscriptions.push(aiTemplateData);
context.subscriptions.push(telemetry);

// When extension deactivates, all registered subscriptions are disposed
```

---

## 6. Hook-Related Code & Configuration

### Hooks as First-Class Template Type

```typescript
// From src/features/ai-template-files/models/aiTemplateFile.ts

export const AI_TEMPLATE_FILE_TYPES = 
  ["agents", "prompts", "skills", "instructions", "chatmodes", "hooks"] as const;

export type AITemplateFileType = (typeof AI_TEMPLATE_FILE_TYPES)[number];

// Hooks are treated as regular template files:
// - Can be stored in repository configurations
// - Can be installed/uninstalled like other templates
// - Count is tracked in template statistics
```

### VS Code Setting Configuration

```typescript
// From src/features/initialization/recommendedSettingsConfigDeployer.ts

const SETTINGS_TEMPLATE = {
  // ... other settings ...
  
  "chat.promptFilesLocations": {
    ".nexkit/prompts": true,
  },
  "chat.instructionsFilesLocations": {
    ".nexkit/instructions": true,
    ".nexkit/skills": true,
  },
  "chat.agentFilesLocations": {
    ".nexkit/agents": true,
  },
  "chat.hookFilesLocations": {
    ".nexkit/hooks": true,           // ← Hooks location
  },
  "chat.useHooks": true,             // ← Enable hooks globally
};
```

### Hook Repository Configuration

```typescript
// From src/features/ai-template-files/models/repositoryConfig.ts

// Nexus Templates repository paths
{
  name: "Nexus Templates",
  paths: {
    prompts: "prompts",
    skills: "skills",
    instructions: "instructions",
    agents: "agents",
    hooks: "hooks",              // ← Hooks path
  }
}

// APM Templates (hooks not included in APM mode)
{
  name: "APM Templates",
  paths: {
    agents: ".github/agents",
    // No hooks path for APM
  }
}
```

### Hook Installation Flow

Hooks follow the same installation pattern as other templates:

```
1. Templates fetched from repository
2. Filtered by type: "hooks"
3. User can install/uninstall
4. Stored in `.nexkit/hooks/` directory
5. VS Code loads them via settings configuration
6. Available in chat interface when chat.useHooks = true
```

---

## 7. Existing File Deployer Patterns

### Pattern: Non-Destructive Deployment

All deployers follow the same safety-first pattern:

```typescript
/**
 * Three strategies for safety:
 * 
 * 1. Section Markers (.gitignore)
 *    - Use delimited sections: "# BEGIN NexKit ... # END NexKit"
 *    - Replace only NexKit section, preserve other content
 * 
 * 2. Deep Merge (VS Code settings)
 *    - Merge template with existing settings
 *    - User values take priority
 *    - Display differences in logs
 * 
 * 3. Non-overwrite with inputs (.mcp.json)
 *    - Only add config if not present
 *    - Respect user's manual additions
 */
```

**Gitignore Deployer** - Section markers:
```typescript
const nexkitSection = `# BEGIN NexKit
.nexkit/
# END NexKit`;

// Replace or append strategically
if (sectionRegex.test(content)) {
  content = content.replace(sectionRegex, nexkitSection);
} else {
  content += nexkitSection + "\n";
}
```

**Settings Deployer** - Deep merge:
```typescript
// Merge with existing, user settings take priority
const merged = deepMerge(templateSettings, existingSettings);

// Log what's new
const newSettings = Object.keys(merged)
  .filter(key => !(key in existingSettings));
logging.info("New settings added:", newSettings);
```

**MCP Deployer** - Conditional insertion:
```typescript
// Only add if not present
const adoInputExists = config.inputs.some(
  input => input.id === "ado_org"
);
if (!adoInputExists) {
  config.inputs.push({ id: "ado_org", ... });
}
```

---

## 8. Architecture Summary Diagrams

### Service Dependencies Graph

```
                    ┌─────────────────────┐
                    │  SettingsManager    │
                    │  (Static Facade)    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
    │ AITemplateData   │  │ Profile      │  │ Telemetry    │
    │ Service          │  │ Service      │  │ Service      │
    └────────┬─────────┘  └──────┬───────┘  └──────────────┘
             │                   │
    ┌────────┴───────────────────┴────────────────────┐
    │                                                 │
    ▼                                                 ▼
┌──────────────────┐                        ┌──────────────────┐
│ Deployers        │                        │ Verification     │
│ - Template Files │                        │ Services         │
│ - MCP Config     │                        │ - GitIgnore      │
│ - Extensions     │                        │ - Settings       │
│ - Settings       │                        │ - File Migration │
└──────────────────┘                        └──────────────────┘
    │                                                 │
    └──────────────────────┬──────────────────────┘
                           │
                    ▼─────────────┐
              WorkspaceInitialization
                    Service
```

### State Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Extension Activation                      │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
              isWorkspaceInitialized?
              (WorkspaceState)
                    │
        ┌───────────┴───────────┐
        │ NO                    │ YES
        ▼                       ▼
  ┌──────────────┐        ┌──────────────┐
  │ Show Prompt  │        │ Skip Init    │
  │ "Initialize  │        │ Run Startup  │
  │  Workspace?" │        │ Verification │
  └──────┬───────┘        └──────┬───────┘
         │                       │
         ▼                       ▼
     User Accepts          ┌──────────────────────┐
     Init Command          │ Verify Configuration │
         │                 │ - Settings correct?  │
         ▼                 │ - Gitignore setup?   │
  ┌───────────────┐        │ - Files migrated?    │
  │ Mode Selected?│        │ - Auth configured?   │
  │ (GlobalState) │        └──────────────────────┘
  └───────┬───────┘
          │
          ▼
     ┌──────────────────┐
     │ Apply Profile OR │
     │ Deploy Defaults  │
     └──────┬───────────┘
            │
            ▼
    ┌────────────────────┐
    │ Mark Initialized   │
    │ (WorkspaceState)   │
    └────────────────────┘
```

---

## 9. Key Implementation Considerations

### For Project Type Detection

If implementing project type detection, follow these patterns:

1. **Add detector service**:
   ```typescript
   class ProjectTypeDetectorService {
     async detectProjectType(workspaceRoot: string): Promise<ProjectType | null> {
       // Check for .csproj, package.json, pyproject.toml, etc.
     }
   }
   ```

2. **Add to ServiceContainer**:
   ```typescript
   export interface ServiceContainer {
     projectTypeDetector: ProjectTypeDetectorService;
     // ...
   }
   ```

3. **Use during initialization**:
   ```typescript
   const projectType = await services.projectTypeDetector.detectProjectType(workspaceRoot);
   // Filter templates by project type
   ```

4. **Leverage existing validation pattern**:
   ```typescript
   public detectProjectType(): { type: ProjectType | null; confidence: number } {
     // Return both type and confidence level
   }
   ```

### For New Validations

1. Use `{ valid: boolean; error?: string }` return pattern
2. Add to appropriate manager/service class
3. Call early in initialization flow
4. Log results via `LoggingService` for debugging
5. Store results in `SettingsManager` if needed for re-checks

### For New Settings

1. Add constant to `SettingsManager`
2. Add getter/setter method pair
3. Choose correct storage: WorkspaceState, GlobalState, or Configuration
4. Document default behavior
5. Update `.vscode/settings.json` template if user-facing

---

## 10. Testing Patterns

### Test File Organization

```
test/suite/
├── <featureName>.test.ts       # Unit tests
├── <featureName>.integration.test.ts  # Integration tests
```

### Common Test Patterns Used

1. **Service mocking with Sinon**:
   ```typescript
   const sandbox = sinon.createSandbox();
   const mockService = sandbox.stub(ServiceClass.prototype, 'method');
   ```

2. **Extension context mocking**:
   ```typescript
   const mockContext = {
     workspaceState: { get: stub(), update: stub() },
     globalState: { get: stub(), update: stub() }
   };
   ```

3. **Async/await handling**:
   ```typescript
   it('should initialize successfully', async () => {
     const result = await service.initialize();
     expect(result).to.be.true;
   });
   ```

