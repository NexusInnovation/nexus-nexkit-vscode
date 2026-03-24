# NexKit Quick Reference - Implementation Patterns

**Quick lookup for common implementation tasks**

---

## Adding a New Deployer

### Template (Copy & Adapt)

```typescript
// src/features/initialization/customConfigDeployer.ts
import * as fs from "fs";
import * as path from "path";
import { fileExists, deepMerge } from "../../shared/utils/fileHelper";

export class CustomConfigDeployer {
  async deploy(targetRoot: string): Promise<void> {
    const configPath = path.join(targetRoot, ".vscode", "custom-config.json");
    const configDir = path.dirname(configPath);
    
    await fs.promises.mkdir(configDir, { recursive: true });
    
    const templateConfig = this.getDefaultConfig();
    let config = templateConfig;
    
    // Preserve existing user config (non-destructive)
    if (await fileExists(configPath)) {
      const existingContent = await fs.promises.readFile(configPath, "utf8");
      try {
        const existingConfig = JSON.parse(existingContent);
        config = deepMerge(templateConfig, existingConfig);
      } catch (error) {
        console.warn("Invalid existing config, using defaults");
      }
    }
    
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  }
  
  private getDefaultConfig() {
    return {
      // your defaults here
    };
  }
}
```

### Integration into ServiceContainer

```typescript
// src/core/serviceContainer.ts
const customConfigDeployer = new CustomConfigDeployer();

return {
  // ... other services
  customConfigDeployer,
};
```

### Integration into Initialization

```typescript
// src/features/initialization/workspaceInitializationService.ts
await services.customConfigDeployer.deploy(workspaceFolder.uri.fsPath);
```

---

## Adding a New Setting

### 1. Add to package.json

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "nexkit.myFeature.enabled": {
          "type": "boolean",
          "default": true,
          "scope": "application",
          "description": "Enable my feature"
        }
      }
    }
  }
}
```

### 2. Add to SettingsManager

```typescript
// src/core/settingsManager.ts
export class SettingsManager {
  static isMyFeatureEnabled(): boolean {
    return this.getConfig<boolean>("nexkit.myFeature.enabled", true);
  }
  
  static async setMyFeatureEnabled(enabled: boolean): Promise<void> {
    await this.setConfig("nexkit.myFeature.enabled", enabled);
  }
}
```

### 3. Decide Storage Location

**Use GlobalState** (user-scoped, non-editable):
```typescript
private static globalState: vscode.Memento;
static async setLastCheckTime(time: number): Promise<void> {
  await this.globalState.update("lastCheckTime", time);
}
```

**Use WorkspaceState** (workspace-scoped, non-editable):
```typescript
private static workspaceState: vscode.Memento;
static async setDetectedType(type: string): Promise<void> {
  await this.workspaceState.update("detectedProjectType", type);
}
```

**Use Configuration** (user-editable, synced):
```typescript
// Default choice - goes in contributes.configuration
```

---

## Adding a Validation Check

### Pattern (Return { valid, error })

```typescript
export class MyValidator {
  validate(input: string): { valid: boolean; error?: string } {
    if (!input || input.trim().length === 0) {
      return { valid: false, error: "Input cannot be empty" };
    }
    if (input.length > 255) {
      return { valid: false, error: "Input exceeds 255 characters" };
    }
    return { valid: true };
  }
}
```

### Integrate into Startup Verification

```typescript
// src/features/initialization/startupVerificationService.ts
public async verifyWorkspaceConfiguration(workspaceRoot: string): Promise<void> {
  // ... existing checks ...
  
  const validation = this._myValidator.validate(someInput);
  if (!validation.valid) {
    this._logging.warn(`Validation failed: ${validation.error}`);
    // Handle gracefully - don't throw
    return;
  }
}
```

---

## Implementing Project Type Detection

### Step 1: Create Service

```typescript
// src/features/initialization/projectTypeDetectorService.ts
import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";

export type ProjectType = "frontend" | "backend" | "fullstack" | null;

export class ProjectTypeDetectorService {
  async detectProjectType(workspaceRoot: string): Promise<ProjectType> {
    const [hasFrontend, hasBackend] = await Promise.all([
      this.hasFrontendIndicators(workspaceRoot),
      this.hasBackendIndicators(workspaceRoot),
    ]);
    
    if (hasFrontend && hasBackend) return "fullstack";
    if (hasBackend) return "backend";
    if (hasFrontend) return "frontend";
    return null;
  }
  
  private async hasFrontendIndicators(root: string): Promise<boolean> {
    // Check for: react/vue/angular in package.json, vite.config.*, playwright.config.*, src/components/
    const hasPackageJson = await this.hasReactInPackageJson(root);
    const hasViteConfig = await this.hasConfigFile(root, "vite.config.*");
    const hasComponentsDir = await fileExists(path.join(root, "src/components"));
    
    return hasPackageJson || hasViteConfig || hasComponentsDir;
  }
  
  private async hasBackendIndicators(root: string): Promise<boolean> {
    // Check for: .csproj, go.mod, pyproject.toml, Dockerfile, src/routes/
    const hasCsproj = await this.hasCsprojFiles(root);
    const hasGoMod = await fileExists(path.join(root, "go.mod"));
    const hasPyproject = await fileExists(path.join(root, "pyproject.toml"));
    const hasDockerfile = await fileExists(path.join(root, "Dockerfile"));
    
    return hasCsproj || hasGoMod || hasPyproject || hasDockerfile;
  }
  
  private async hasReactInPackageJson(root: string): Promise<boolean> {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!await fileExists(pkgPath)) return false;
      const content = await fs.promises.readFile(pkgPath, "utf8");
      const pkg = JSON.parse(content);
      return !!pkg.dependencies && 
             (!!pkg.dependencies.react || !!pkg.dependencies.vue);
    } catch {
      return false;
    }
  }
  
  private async hasCsprojFiles(root: string): Promise<boolean> {
    try {
      const files = await fs.promises.readdir(root);
      return files.some(f => f.endsWith(".csproj") || f.endsWith(".sln"));
    } catch {
      return false;
    }
  }
  
  private async hasConfigFile(root: string, pattern: string): Promise<boolean> {
    try {
      const files = await fs.promises.readdir(root);
      const regex = new RegExp(`^${pattern.replace("*", ".*")}$`);
      return files.some(f => regex.test(f));
    } catch {
      return false;
    }
  }
}
```

### Step 2: Add to ServiceContainer

```typescript
// src/core/serviceContainer.ts
const projectTypeDetector = new ProjectTypeDetectorService();

interface ServiceContainer {
  // ... existing
  projectTypeDetector: ProjectTypeDetectorService;
}

return {
  // ... existing
  projectTypeDetector,
};
```

### Step 3: Call During Initialization

```typescript
// src/features/initialization/workspaceInitializationService.ts
public async initializeWorkspace(
  workspaceFolder: vscode.WorkspaceFolder,
  profileName: string | null,
  services: ServiceContainer
) {
  // ... existing code ...
  
  // NEW: Detect and store project type
  const projectType = await services.projectTypeDetector.detectProjectType(
    workspaceFolder.uri.fsPath
  );
  if (projectType) {
    await SettingsManager.setDetectedProjectType(projectType);
    services.logging.info(`Detected project type: ${projectType}`);
  }
  
  // ... rest of initialization ...
}
```

### Step 4: Add Storage Methods to SettingsManager

```typescript
// src/core/settingsManager.ts
export class SettingsManager {
  // ... existing ...
  
  static async setDetectedProjectType(type: string): Promise<void> {
    await this.workspaceState.update("detectedProjectType", type);
  }
  
  static getDetectedProjectType(): string | undefined {
    return this.workspaceState.get("detectedProjectType");
  }
}
```

### Step 5: Filter Templates by Type (Optional)

```typescript
// src/features/ai-template-files/services/aiTemplateDataService.ts
async getFilteredTemplates(repo: Repository) {
  const templates = await this.fetchTemplates(repo);
  const projectType = SettingsManager.getDetectedProjectType();
  
  if (!projectType) return templates;
  
  // Filter based on project type
  return templates.filter(t => {
    if (t.supportedTypes && !t.supportedTypes.includes(projectType)) {
      return false;
    }
    return true;
  });
}
```

---

## Writing Tests

### Basic Service Test

```typescript
// test/suite/myService.test.ts
import * as assert from "assert";
import * as sinon from "sinon";
import { MyService } from "../../src/features/myfeature/myService";

suite("MyService", () => {
  let service: MyService;
  let loggingStub: sinon.SinonStub;
  
  setup(() => {
    loggingStub = sinon.stub();
    service = new MyService(loggingStub);
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test("should validate input", () => {
    const result = service.validate("valid-input");
    assert.strictEqual(result.valid, true);
  });
  
  test("should reject empty input", () => {
    const result = service.validate("");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });
});
```

### Mocking File System

```typescript
// Mock fs.promises.readFile
const fsStub = sinon.stub(fs.promises, "readFile");
fsStub.resolves(JSON.stringify({ test: "data" }));

// Run test
const data = await deployerService.readConfig("path");

// Verify
assert.ok(fsStub.calledOnce);
sinon.restore();
```

### Testing Async Operations

```typescript
test("should initialize service", async () => {
  const result = await service.initialize();
  assert.ok(result);
});
```

---

## Common Command Registration Pattern

```typescript
// src/features/myfeature/commands.ts
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";

export function registerMyCommand(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): void {
  registerCommand(
    context,
    Commands.MY_COMMAND,
    async () => {
      services.logging.info("Command executed");
      
      try {
        const result = await services.myService.doSomething();
        services.telemetry.trackEvent("myCommand_success", { result: result.toString() });
        vscode.window.showInformationMessage("Success!");
      } catch (error) {
        services.logging.error("Command failed", error);
        services.telemetry.trackError("myCommand_failure", error as Error);
        vscode.window.showErrorMessage("Command failed");
      }
    },
    services.telemetry
  );
}
```

### Register in extension.ts

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  // ... setup ...
  registerMyCommand(context, services);
  // ... other commands ...
}
```

---

## Logging & Telemetry Pattern

```typescript
import { LoggingService } from "../../shared/services/loggingService";

export class MyService {
  private readonly _logging = LoggingService.getInstance();
  
  async doSomething(input: string): Promise<void> {
    this._logging.info("Starting operation", { input });
    
    try {
      const result = await this.process(input);
      this._logging.info("Operation completed", { result });
    } catch (error) {
      this._logging.error("Operation failed", error);
      throw error;
    }
  }
}
```

### Telemetry (Only Non-Sensitive Data)

```typescript
import { TelemetryService } from "../../shared/services/telemetryService";

// ✅ Good: Anonymous metrics
services.telemetry.trackEvent("template_installed", {
  templateType: "agent",
  source: "nexus-templates",
});

// ❌ Bad: Contains PII
services.telemetry.trackEvent("workspace_init", {
  workspacePath: "/Users/john/my-project",  // ❌ Never log paths
  userName: "john.doe",  // ❌ Never log names
});
```

---

## Error Handling Pattern

```typescript
export async function riskyOperation() {
  try {
    // risky operation
    const result = await fs.promises.readFile(path, "utf8");
    return result;
  } catch (error) {
    this._logging.error("File read failed", error);
    
    // Return graceful default
    return null;
    
    // OR show user message
    vscode.window.showErrorMessage("Failed to read file");
    
    // OR re-throw if critical
    throw error;
  }
}
```

---

## File System Operations Best Practices

### ✅ Correct

```typescript
import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";

// Use path.join for cross-platform paths
const filePath = path.join(workspaceRoot, ".vscode", "settings.json");

// Use vscode.Uri for paths in APIs
const uri = vscode.Uri.joinPath(workspaceFolder.uri, ".vscode/settings.json");

// Use fs.promises for async operations
const content = await fs.promises.readFile(filePath, "utf8");
const files = await fs.promises.readdir(directory);

// Use helper function to check existence
if (await fileExists(filePath)) {
  // ...
}
```

### ❌ Avoid

```typescript
// Never concatenate paths
const filePath = workspaceRoot + "/.vscode/settings.json";  // ❌

// Never use synchronous fs
const content = fs.readFileSync(filePath, "utf8");  // ❌

// Never manually check existence
try {
  fs.statSync(filePath);
} catch {
  // file doesn't exist
}  // ❌ Use fileExists() instead
```

---

## Disposing Resources

```typescript
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("...", () => {
    // ...
  });
  
  // ✅ Always register with subscriptions
  context.subscriptions.push(disposable);
  
  // For EventEmitters
  const emitter = new vscode.EventEmitter<string>();
  context.subscriptions.push(emitter);
  
  // For watchers
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.md");
  context.subscriptions.push(watcher);
}

export function deactivate() {
  // Disposables are automatically cleaned up
}
```

---

## Key Checklist Before Submitting Code

- [ ] All public methods have JSDoc comments with `@param` and `@returns`
- [ ] Uses `async/await` instead of `.then()` chains
- [ ] Private fields prefixed with `_` (e.g., `_logging`)
- [ ] Services end with `Service`, deployers with `Deployer`
- [ ] All DI dependencies passed via constructor
- [ ] Settings only accessed via `SettingsManager` (never `vscode.workspace.getConfiguration()`)
- [ ] File paths use `path.join()` or `vscode.Uri.joinPath()`
- [ ] Validations return `{ valid: boolean; error?: string }` objects
- [ ] Errors logged via `LoggingService`, never `console.log()`
- [ ] All disposables registered with `context.subscriptions`
- [ ] Non-destructive file operations (merge, delimiters, conditionals)
- [ ] No sensitive data in telemetry (paths, names, workspace content)
- [ ] Unit tests in `test/suite/` with >60% coverage
- [ ] `npm run lint` and `npm run check:types` pass locally
- [ ] `npm test` passes with no failures

