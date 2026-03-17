# Quick Reference: NexKit Architecture Patterns

**For developers implementing project type detection or validation features**

---

## 🚀 Quick Start Patterns

### Adding a New Service

```typescript
// 1. Create service file
// src/features/my-feature/myNewService.ts

export class MyNewService {
  async doSomething(): Promise<Result> {
    // implementation
  }
}

// 2. Add to ServiceContainer interface
// src/core/serviceContainer.ts
export interface ServiceContainer {
  myNewService: MyNewService;  // ← Add here
  // ... other services
}

// 3. Instantiate in initializeServices
const myNewService = new MyNewService();

// 4. Add to return object
return {
  myNewService,
  // ... other services
};

// 5. Use in commands
export function registerMyCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(context, Commands.MY_COMMAND, async () => {
    await services.myNewService.doSomething();  // ← Access here
  });
}
```

### Adding a New Setting

```typescript
// 1. Add constant to SettingsManager
private static readonly MY_SETTING = "my.setting";

// 2. Add getter/setter pair
static getMyProperty(): MyType {
  return vscode.workspace
    .getConfiguration(this.NEXKIT_SECTION)
    .get<MyType>(this.MY_SETTING, defaultValue);
}

static async setMyProperty(value: MyType): Promise<void> {
  await vscode.workspace
    .getConfiguration(this.NEXKIT_SECTION)
    .update(this.MY_SETTING, value, vscode.ConfigurationTarget.Global);
}

// 3. Usage
const value = SettingsManager.getMyProperty();
await SettingsManager.setMyProperty(newValue);
```

### Adding a Validation Check

```typescript
// Pattern: Return { valid, error }
public validateMyConfig(config: MyConfig): { valid: boolean; error?: string } {
  if (!config.requiredField) {
    return {
      valid: false,
      error: "Required field 'requiredField' is missing"
    };
  }
  
  return { valid: true };
}

// Usage in initialization
const validation = validator.validateMyConfig(config);
if (!validation.valid) {
  this._logging.warn(`⚠️ Invalid config: ${validation.error}`);
  return null;
}
```

### Adding a File Deployer

```typescript
export class MyConfigDeployer {
  /* Pattern: Non-destructive operations */
  
  // Option 1: Section markers (like gitignore)
  async deploy(targetRoot: string): Promise<void> {
    const markedSection = `# BEGIN NexKit\n${content}\n# END NexKit`;
    // Replace or append strategically
  }
  
  // Option 2: Deep merge (like settings)
  async deploy(targetRoot: string): Promise<void> {
    const existing = await readExistingConfig();
    const merged = deepMerge(template, existing);  // Template is base, existing wins
    await writeConfig(merged);
  }
  
  // Option 3: Conditional addition (like MCP)
  async deploy(targetRoot: string): Promise<void> {
    const existing = await readExistingConfig();
    if (!isAlreadyPresent(existing)) {
      existing.push(newConfig);
      await writeConfig(existing);
    }
  }
}
```

---

## 📊 Storage Types Decision Tree

```
Does this value need to survive between VS Code instances?
├─ YES (Global)
│  └─ Use GlobalState
│     ├─ isFirstTimeUser()
│     ├─ getLastUpdateCheck()
│     └─ (Store via context.globalState)
│
└─ NO, just per-workspace (Workspace)
   ├─ Does workspace config stay same when switching workspaces?
   │  ├─ YES → Use WorkspaceState
   │  │  ├─ isWorkspaceInitialized()
   │  │  ├─ getLastAppliedProfile()
   │  │  └─ (Store via context.workspaceState)
   │  │
   │  └─ NO, user edits it → Use Configuration API
   │     ├─ getRepositories()
   │     ├─ getProfiles()
   │     ├─ getTelemetryLevel()
   │     └─ (Synced via vscode.workspace.getConfiguration)
```

---

## 🔍 Initialization Hook Points

```
┌─ Extension Activation (extension.ts)
│  │
│  ├─ SettingsManager.initialize(context)  ← Must be first!
│  │
│  ├─ initializeServices(context)          ← Dependency injection
│  │
│  ├─ registerAllCommands(context, services)
│  │
│  └─ services.startupVerification.verifyOnStartup()  ← Async, non-blocking
│
└─ User Executes: nexus-nexkit.initWorkspace Command
   │
   ├─ Mode selection prompt (if first-time)
   │
   ├─ Profile selection prompt
   │
   └─ WorkspaceInitializationService.initializeWorkspace()
      ├─ startupVerification.verifyWorkspaceConfiguration()
      ├─ backup.backupTemplates()
      ├─ deployers...
      ├─ profile.applyProfile() OR templateFiles.deployTemplateFiles()
      └─ setWorkspaceInitialized(true)
```

---

## ✅ Validation Checklist

When adding a new validation or check:

- [ ] Follow `{ valid: boolean; error?: string }` return pattern
- [ ] Create validation method in appropriate service/manager class
- [ ] Use descriptive error messages with context
- [ ] Log results via `LoggingService` for debugging
- [ ] Add unit tests with both valid and invalid cases
- [ ] Call validation early in initialization flow (not too late)
- [ ] Handle validation failures gracefully (continue with defaults, log warning)
- [ ] Document validation rules in class JSDoc comments

---

## 🧪 Common Test Mocks

```typescript
// Extension context mock
const mockContext: vscode.ExtensionContext = {
  workspaceState: {
    get: sinon.stub().returns(false),
    update: sinon.stub().resolves()
  },
  globalState: {
    get: sinon.stub().returns(0),
    update: sinon.stub().resolves()
  },
  subscriptions: []
};

// Settings mock
sinon.stub(vscode.workspace, 'getConfiguration').returns({
  get: sinon.stub().returns([]),
  update: sinon.stub().resolves()
});

// File system mock
sinon.stub(fs.promises, 'readFile').resolves('content');
sinon.stub(fs.promises, 'writeFile').resolves();
```

---

## 📋 Repository Configuration Reference

```typescript
// Minimal valid configuration
{
  name: "My Repo",              // Unique display name
  url: "https://github.com/org/repo",  // GitHub URL or local path
  enabled: true,                // Is it active?
  paths: {
    agents: "agents",           // Relative path in repo
    prompts: "prompts"
  }
}

// With optional fields
{
  name: "My Repo",
  type: "github",               // "github" (default) | "local"
  url: "https://github.com/org/repo",
  branch: "develop",            // Default: "main"
  enabled: true,
  modes: ["Developers"],        // Show only in Developers mode
  paths: {
    agents: "agents",
    prompts: "prompts",
    skills: "skills",
    instructions: "instructions",
    chatmodes: "chatmodes",
    hooks: "hooks"
  }
}
```

---

## 🎯 Project Type Detection (If Implementing)

### Recommended Structure

```typescript
// src/features/initialization/projectTypeDetectorService.ts

export type ProjectType = "node" | "dotnet" | "python" | "generic";

export interface ProjectTypeInfo {
  type: ProjectType;
  confidence: number;           // 0.0 - 1.0
  detectedFiles: string[];      // Files that indicated the type
}

export class ProjectTypeDetectorService {
  async detectProjectType(workspaceRoot: string): Promise<ProjectTypeInfo | null> {
    // Check in order of confidence
    // 1. .NET: .csproj, .sln, .fsproj
    // 2. Node: package.json, yarn.lock, pnpm-lock.yaml
    // 3. Python: pyproject.toml, requirements.txt, Pipfile
    // 4. Return null if no clear match
  }
}
```

### Usage in Initialization

```typescript
// In initializeWorkspace command handler
const projectType = await services.projectTypeDetector.detectProjectType(workspaceRoot);

// Filter templates by project type + operation mode
const templates = this.templateDataService
  .getTemplatesByRepository(repoName)
  .filter(t => {
    const supportsType = !t.projectType || t.projectType === projectType?.type;
    const supportsMode = !t.modes || t.modes.includes(selectedMode);
    return supportsType && supportsMode;
  });
```

---

## 🔗 File Organization Reference

```
src/
├── extension.ts                     ← Activation entry point
│
├── core/
│   ├── serviceContainer.ts          ← All service instantiation
│   └── settingsManager.ts           ← All settings access
│
├── features/
│   ├── initialization/              ← Init flow services
│   │   ├── workspaceInitializationService.ts
│   │   ├── startupVerificationService.ts
│   │   ├── workspaceInitPromptService.ts
│   │   ├── modeSelectionService.ts
│   │   ├── gitIgnoreConfigDeployer.ts
│   │   ├── recommendedSettingsConfigDeployer.ts
│   │   ├── mcpConfigDeployer.ts
│   │   ├── nexkitFileMigrationService.ts
│   │   └── commands.ts
│   │
│   ├── ai-template-files/
│   │   ├── models/
│   │   │   ├── aiTemplateFile.ts    ← Template type definitions
│   │   │   ├── repositoryConfig.ts  ← Repository configs
│   │   │   └── installedTemplateRecord.ts
│   │   │
│   │   └── services/
│   │       ├── aiTemplateDataService.ts
│   │       ├── templateFetcherService.ts
│   │       └── installedTemplatesStateManager.ts
│   │
│   ├── profile-management/
│   │   ├── models/profile.ts
│   │   ├── services/profileService.ts
│   │   └── commands.ts
│   │
│   ├── backup-management/
│   ├── extension-updates/
│   ├── mcp-management/
│   ├── panel-ui/                    ← Webview (Preact)
│   │   ├── nexkitPanelViewProvider.ts
│   │   ├── nexkitPanelMessageHandler.ts
│   │   ├── types/
│   │   │   └── webviewMessages.ts
│   │   └── webview/
│   │       ├── main.tsx
│   │       ├── contexts/
│   │       ├── hooks/
│   │       ├── components/
│   │       └── services/
│   │
│   └── ... other features
│
└── shared/
    ├── commands/
    │   └── commandRegistry.ts       ← All command registration
    ├── constants/
    │   └── commands.ts              ← Command ID constants
    ├── services/
    │   ├── loggingService.ts
    │   └── telemetryService.ts
    └── utils/
        ├── fileHelper.ts
        ├── githubAuthHelper.ts
        └── vscodeProfileHelper.ts
```

---

## 🔐 Security & Telemetry Notes

**NEVER log:**
- File paths
- Workspace names
- User content
- Credential tokens

**ALWAYS log (for debugging):**
- Operation success/failure
- Error messages with context
- Configuration checks applied
- File counts and summaries

**For telemetry:**
- Check `SettingsManager.isNexkitTelemetryEnabled()`
- Check VS Code's global telemetry setting
- Use `services.telemetry.trackEvent()` for metrics
- Use `services.telemetry.trackError()` for exceptions

---

## 📚 Key Files Cheat Sheet

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `extension.ts`                      | Extension lifecycle, command registration |
| `serviceContainer.ts`               | DI container, service instantiation       |
| `settingsManager.ts`                | All settings access patterns              |
| `workspaceInitializationService.ts` | Orchestrates init workflow                |
| `startupVerificationService.ts`     | Runs on every activation                  |
| `repositoryConfig.ts`               | Repository validation & filtering         |
| `profileService.ts`                 | Profile CRUD & application                |
| `aiTemplateDataService.ts`          | Template fetching & installation          |
| `package.json`                      | Command contributions, settings schema    |

