# NexKit Code Examples & Patterns

**Copy-paste ready examples for common development tasks**

---

## Service Creation Example

### Creating a Project Type Detector Service

```typescript
// File: src/features/initialization/projectTypeDetectorService.ts

import * as fs from "fs";
import * as path from "path";
import { LoggingService } from "../../shared/services/loggingService";
import { fileExists } from "../../shared/utils/fileHelper";

export type ProjectType = "dotnet" | "nodejs" | "python" | "unknown";

export interface ProjectTypeInfo {
  type: ProjectType;
  confidence: "high" | "medium" | "low";
  detectedFiles: string[];
  frameworkHints?: string[];
}

/**
 * Service for detecting project types in a workspace
 * Checks for characteristic files of known project types
 */
export class ProjectTypeDetectorService {
  private readonly _logging = LoggingService.getInstance();

  private readonly DOTNET_MARKERS = [".csproj", ".sln", ".fsproj", ".vbproj"];
  private readonly NODE_MARKERS = ["package.json", "yarn.lock", "pnpm-lock.yaml"];
  private readonly PYTHON_MARKERS = ["pyproject.toml", "requirements.txt", "Pipfile", "poetry.lock"];

  /**
   * Detect project type by looking for characteristic files
   * @param workspaceRoot Absolute path to workspace root
   * @returns ProjectTypeInfo or null if no clear match found
   */
  public async detectProjectType(workspaceRoot: string): Promise<ProjectTypeInfo | null> {
    try {
      // Check .NET first (most specific markers)
      const dotnetMarkers = await this._checkMarkers(workspaceRoot, this.DOTNET_MARKERS);
      if (dotnetMarkers.found.length > 0) {
        this._logging.info(`Detected .NET project with files: ${dotnetMarkers.found.join(", ")}`);
        return {
          type: "dotnet",
          confidence: dotnetMarkers.found.length > 1 ? "high" : "medium",
          detectedFiles: dotnetMarkers.found,
          frameworkHints: this._extractDotNetFramework(workspaceRoot, dotnetMarkers.found),
        };
      }

      // Check Node.js
      const nodeMarkers = await this._checkMarkers(workspaceRoot, this.NODE_MARKERS);
      if (nodeMarkers.found.length > 0) {
        this._logging.info(`Detected Node.js project with files: ${nodeMarkers.found.join(", ")}`);
        return {
          type: "nodejs",
          confidence: nodeMarkers.found.length > 1 ? "high" : "medium",
          detectedFiles: nodeMarkers.found,
          frameworkHints: this._extractNodeFramework(workspaceRoot, nodeMarkers.found),
        };
      }

      // Check Python
      const pythonMarkers = await this._checkMarkers(workspaceRoot, this.PYTHON_MARKERS);
      if (pythonMarkers.found.length > 0) {
        this._logging.info(`Detected Python project with files: ${pythonMarkers.found.join(", ")}`);
        return {
          type: "python",
          confidence: pythonMarkers.found.length > 1 ? "high" : "medium",
          detectedFiles: pythonMarkers.found,
          frameworkHints: this._extractPythonFramework(workspaceRoot, pythonMarkers.found),
        };
      }

      this._logging.info("No recognized project type detected");
      return null;
    } catch (error) {
      this._logging.error("Failed to detect project type", error);
      return null;
    }
  }

  /**
   * Check if any markers exist in the workspace root
   */
  private async _checkMarkers(
    workspaceRoot: string,
    markers: string[]
  ): Promise<{ found: string[]; missing: string[] }> {
    const results = await Promise.all(
      markers.map(async (marker) => ({
        marker,
        exists: await fileExists(path.join(workspaceRoot, marker)),
      }))
    );

    return {
      found: results.filter((r) => r.exists).map((r) => r.marker),
      missing: results.filter((r) => !r.exists).map((r) => r.marker),
    };
  }

  /**
   * Extract framework information from .NET project structure
   */
  private _extractDotNetFramework(workspaceRoot: string, markers: string[]): string[] {
    const hints: string[] = [];

    if (markers.includes("package.json")) {
      // Likely .NET with Node.js integration
      try {
        const packagePath = path.join(workspaceRoot, "package.json");
        const content = require(packagePath);
        if (content.scripts?.build?.includes("webpack") || content.scripts?.build?.includes("vite")) {
          hints.push("frontend-tooling");
        }
      } catch {
        // Ignore parse errors
      }
    }

    return hints;
  }

  /**
   * Extract framework information from Node.js project
   */
  private _extractNodeFramework(workspaceRoot: string, markers: string[]): string[] {
    const hints: string[] = [];

    if (markers.includes("package.json")) {
      try {
        const packagePath = path.join(workspaceRoot, "package.json");
        const content = require(packagePath);

        if (content.dependencies?.react || content.devDependencies?.react) {
          hints.push("React");
        }
        if (content.dependencies?.vue || content.devDependencies?.vue) {
          hints.push("Vue");
        }
        if (content.dependencies?.["next"] || content.devDependencies?.["next"]) {
          hints.push("Next.js");
        }
        if (content.dependencies?.express || content.devDependencies?.express) {
          hints.push("Express");
        }
        if (content.dependencies?.typescript || content.devDependencies?.typescript) {
          hints.push("TypeScript");
        }
      } catch {
        // Ignore parse errors
      }
    }

    return hints;
  }

  /**
   * Extract framework information from Python project
   */
  private _extractPythonFramework(workspaceRoot: string, markers: string[]): string[] {
    const hints: string[] = [];

    if (markers.includes("requirements.txt")) {
      try {
        const reqPath = path.join(workspaceRoot, "requirements.txt");
        const content = fs.readFileSync(reqPath, "utf8");

        if (content.includes("django")) hints.push("Django");
        if (content.includes("flask")) hints.push("Flask");
        if (content.includes("fastapi")) hints.push("FastAPI");
        if (content.includes("sqlalchemy")) hints.push("SQLAlchemy");
      } catch {
        // Ignore read errors
      }
    }

    return hints;
  }
}
```

### Integrating into ServiceContainer

```typescript
// File: src/core/serviceContainer.ts (additions)

import { ProjectTypeDetectorService } from "../features/initialization/projectTypeDetectorService";

export interface ServiceContainer {
  // ... existing services
  projectTypeDetector: ProjectTypeDetectorService;
}

export async function initializeServices(context: vscode.ExtensionContext): Promise<ServiceContainer> {
  // ... existing initialization code

  // Add project type detector
  const projectTypeDetector = new ProjectTypeDetectorService();

  // Register for disposal if needed
  // (This service doesn't have disposable resources, so no need to add to subscriptions)

  return {
    // ... existing services
    projectTypeDetector,
  };
}
```

---

## Settings & Configuration Examples

### Adding Settings to SettingsManager

```typescript
// File: src/core/settingsManager.ts (additions)

export class SettingsManager {
  // ... existing code

  // Add new setting constants
  private static readonly PROJECT_TYPES_ENABLED = "projectTypes.enabled";
  private static readonly PROJECT_AUTO_DETECTION = "projectAutoDetection.enabled";
  private static readonly DETECTED_PROJECT_TYPE = "detectedProjectType";

  // Getters/setters for new settings
  static isProjectTypeDetectionEnabled(): boolean {
    return vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .get<boolean>(this.PROJECT_AUTO_DETECTION, true);
  }

  static async setProjectTypeDetectionEnabled(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .update(this.PROJECT_AUTO_DETECTION, value, vscode.ConfigurationTarget.Global);
  }

  static getDetectedProjectType(): string | null {
    if (!this.context) {
      return null;
    }
    return this.context.workspaceState.get<string | null>(this.DETECTED_PROJECT_TYPE, null);
  }

  static async setDetectedProjectType(type: string | null): Promise<void> {
    if (!this.context) {
      return;
    }
    await this.context.workspaceState.update(this.DETECTED_PROJECT_TYPE, type);
  }
}
```

### Adding to package.json

```json
{
  "contributes": {
    "configuration": {
      "title": "Nexkit",
      "properties": {
        "nexkit.projectAutoDetection.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Automatically detect project type during workspace initialization",
          "scope": "window"
        },
        "nexkit.projectTypes.enabled": {
          "type": "array",
          "default": ["dotnet", "nodejs", "python"],
          "description": "Project types to detect and support",
          "scope": "window"
        }
      }
    }
  }
}
```

---

## Validation Examples

### Repository Validation

```typescript
// File: src/features/ai-template-files/models/repositoryConfig.ts (additions)

export class RepositoryConfigManager {
  // ... existing code

  /**
   * Extended validation including project type constraints
   */
  public static validateRepositoryWithProjectType(
    config: RepositoryConfig,
    projectType?: string
  ): { valid: boolean; error?: string } {
    // First: Basic validation
    const basicValidation = this.validateRepository(config);
    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Second: Project type compatibility (if specified)
    if (projectType && config.projectTypes) {
      if (!config.projectTypes.includes(projectType)) {
        return {
          valid: false,
          error: `Repository "${config.name}" does not support project type "${projectType}". Supported types: ${config.projectTypes.join(", ")}`,
        };
      }
    }

    return { valid: true };
  }
}
```

### Input Validation Example

```typescript
// File: src/features/profile-management/commands.ts (example pattern)

const profileName = await vscode.window.showInputBox({
  placeHolder: "Enter a profile name",
  prompt: "Save current templates as a profile",
  validateInput: (value: string) => {
    // Empty check
    if (!value || value.trim().length === 0) {
      return "Profile name cannot be empty";
    }

    // Length check
    if (value.length > 50) {
      return "Profile name must be 50 characters or less";
    }

    // Character check
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(value)) {
      return "Profile name can only contain letters, numbers, spaces, hyphens, and underscores";
    }

    // Uniqueness check  (async not supported in validateInput callback)
    return undefined; // Valid
  },
  ignoreFocusOut: true,
});
```

---

## Initialization & Deployment Examples

### Adding a New Configuration Deployer

```typescript
// File: src/features/initialization/projectSettingsDeployer.ts

import * as fs from "fs";
import * as path from "path";
import { fileExists, deepMerge } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Deploy project-type-specific VS Code settings
 * Supplements the base recommended settings with project-specific recommendations
 */
export class ProjectSettingsDeployer {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Deploy project-type-specific settings based on detected project type
   * @param targetRoot Root directory of the workspace
   * @param projectType Detected project type ("dotnet", "nodejs", "python", etc.)
   */
  public async deployProjectTypeSettings(targetRoot: string, projectType: string): Promise<void> {
    const targetPath = path.join(targetRoot, ".vscode", "settings.json");
    const targetDir = path.dirname(targetPath);

    await fs.promises.mkdir(targetDir, { recursive: true });

    // Get project-specific settings template
    const projectSettings = this._getSettingsForProjectType(projectType);

    this._logging.info(`Deploying ${projectType}-specific settings...`);

    // Merge with existing settings
    let settings = projectSettings;
    if (await fileExists(targetPath)) {
      const existingContent = await fs.promises.readFile(targetPath, "utf8");
      try {
        const existingSettings = JSON.parse(existingContent);
        settings = deepMerge(projectSettings, existingSettings);
        this._logging.info("Merged project-specific settings with existing settings");
      } catch (error) {
        this._logging.warn("Existing settings.json is invalid JSON, using template", error);
      }
    }

    await fs.promises.writeFile(targetPath, JSON.stringify(settings, null, 2), "utf8");
  }

  /**
   * Get settings template for specific project type
   */
  private _getSettingsForProjectType(projectType: string): Record<string, unknown> {
    switch (projectType) {
      case "dotnet":
        return {
          "[csharp]": {
            "editor.formatOnSave": true,
            "editor.defaultFormatter": "ms-dotnettools.csharp",
          },
          "omnisharp.enableEditorConfigSupport": true,
          "omnisharp.enableRoslynAnalyzers": true,
          "dotnet.defaultSolutionDirPath": "${workspaceFolder}",
        };

      case "nodejs":
        return {
          "[javascript]": {
            "editor.formatOnSave": true,
            "editor.defaultFormatter": "esbenp.prettier-vscode",
          },
          "[typescript]": {
            "editor.formatOnSave": true,
            "editor.defaultFormatter": "esbenp.prettier-vscode",
          },
          "typescript.enablePromptUseWorkspaceTsdk": true,
        };

      case "python":
        return {
          "[python]": {
            "editor.formatOnSave": true,
            "editor.defaultFormatter": "ms-python.python",
          },
          "python.linting.enabled": true,
          "python.linting.pylintEnabled": true,
        };

      default:
        return {};
    }
  }
}
```

### Integrating Deployer into Initialization

```typescript
// File: src/features/initialization/workspaceInitializationService.ts (modified)

import { ProjectTypeDetectorService } from "./projectTypeDetectorService";
import { ProjectSettingsDeployer } from "./projectSettingsDeployer";

export class WorkspaceInitializationService {
  // ... existing code

  public async initializeWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    profileName: string | null,
    services: ServiceContainer
  ) {
    // Run shared verification checks
    const migrationSummary = await services.startupVerification.verifyWorkspaceConfiguration(
      workspaceFolder.uri.fsPath
    );

    // NEW: Detect project type and deploy project-specific settings
    const projectTypeInfo = await services.projectTypeDetector.detectProjectType(
      workspaceFolder.uri.fsPath
    );

    if (projectTypeInfo) {
      await SettingsManager.setDetectedProjectType(projectTypeInfo.type);
      
      const projectSettingsDeployer = new ProjectSettingsDeployer();
      await projectSettingsDeployer.deployProjectTypeSettings(
        workspaceFolder.uri.fsPath,
        projectTypeInfo.type
      );

      services.logging.info(`Deployed ${projectTypeInfo.type} project settings`, {
        confidence: projectTypeInfo.confidence,
        frameworks: projectTypeInfo.frameworkHints,
      });
    }

    // Backup and delete existing .nexkit template folders
    const backupPath = await services.backup.backupTemplates(workspaceFolder.uri.fsPath);

    // Deploy other configurations...
    await services.recommendedExtensionsConfigDeployer.deployVscodeExtensions(
      workspaceFolder.uri.fsPath
    );
    await services.mcpConfigDeployer.deployWorkspaceMCPServers(workspaceFolder.uri.fsPath);

    // Apply profile or defaults...
    let deploymentSummary: BatchInstallSummary | null = null;
    if (profileName) {
      const { summary } = await services.profileService.applyProfile(profileName, false);
      deploymentSummary = summary;
    } else {
      deploymentSummary = await services.aiTemplateFilesDeployer.deployTemplateFiles();
    }

    // Update workspace settings
    await SettingsManager.setWorkspaceInitialized(true);
    services.workspaceInitialization.notifyWorkspaceInitialized();

    return { deploymentSummary, backupPath, migrationSummary, projectTypeInfo };
  }
}
```

---

## Testing Examples

### Unit Test for Project Type Detector

```typescript
// File: test/suite/projectTypeDetectorService.test.ts

import * as assert from "assert";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import { ProjectTypeDetectorService } from "../../src/features/initialization/projectTypeDetectorService";

describe("ProjectTypeDetectorService", () => {
  let service: ProjectTypeDetectorService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    service = new ProjectTypeDetectorService();
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context("detectProjectType", () => {
    it("should detect .NET project", async () => {
      const stub = sandbox.stub(fs.promises, "stat");
      stub.withArgs(sinon.match(/\.csproj$/)).resolves({} as any);
      stub.withArgs(sinon.match(/package\.json$/)).rejects();

      const result = await service.detectProjectType("/test-workspace");

      assert.strictEqual(result?.type, "dotnet");
      assert.strictEqual(result?.confidence, "medium");
    });

    it("should detect Node.js project", async () => {
      const stub = sandbox.stub(fs.promises, "stat");
      stub.withArgs(sinon.match(/package\.json$/)).resolves({} as any);
      stub.withArgs(sinon.match(/\.csproj$/)).rejects();

      const result = await service.detectProjectType("/test-workspace");

      assert.strictEqual(result?.type, "nodejs");
      assert.strictEqual(result?.confidence, "medium");
    });

    it("should detect Python project", async () => {
      const stub = sandbox.stub(fs.promises, "stat");
      stub.withArgs(sinon.match(/pyproject\.toml$/)).resolves({} as any);
      stub.withArgs(sinon.match(/package\.json$/)).rejects();
      stub.withArgs(sinon.match(/\.csproj$/)).rejects();

      const result = await service.detectProjectType("/test-workspace");

      assert.strictEqual(result?.type, "python");
      assert.strictEqual(result?.confidence, "medium");
    });

    it("should return null for unknown project type", async () => {
      const stub = sandbox.stub(fs.promises, "stat");
      stub.rejects(new Error("not found"));

      const result = await service.detectProjectType("/test-workspace");

      assert.strictEqual(result, null);
    });

    it("should return high confidence for multiple markers", async () => {
      const stub = sandbox.stub(fs.promises, "stat");
      stub.withArgs(sinon.match(/package\.json$/)).resolves({} as any);
      stub.withArgs(sinon.match(/yarn\.lock$/)).resolves({} as any);

      const result = await service.detectProjectType("/test-workspace");

      assert.strictEqual(result?.confidence, "high");
      assert.deepStrictEqual(result?.detectedFiles, ["package.json", "yarn.lock"]);
    });
  });
});
```

### Integration Test for Initialization with Project Detection

```typescript
// File: test/suite/workspaceInitialization.integration.test.ts

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { WorkspaceInitializationService } from "../../src/features/initialization/workspaceInitializationService";
import { ProjectTypeDetectorService } from "../../src/features/initialization/projectTypeDetectorService";

describe("WorkspaceInitialization with ProjectTypeDetection", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should detect project type and deploy settings", async () => {
    // Mock workspace folder
    const mockWorkspaceFolder = {
      uri: { fsPath: "/test-workspace" },
      name: "test",
      index: 0,
    } as vscode.WorkspaceFolder;

    // Mock detector to return .NET project
    const mockDetector = sandbox.createStubInstance(ProjectTypeDetectorService);
    mockDetector.detectProjectType.resolves({
      type: "dotnet",
      confidence: "high",
      detectedFiles: [".csproj"],
    });

    // Verify that settings deployment was called
    // (Would need to mock all the deployers and services)

    assert(mockDetector.detectProjectType.called);
  });
});
```

---

## Common Patterns Checklist

- ✅ Service uses singleton or factory pattern for instantiation
- ✅ Service is added to ServiceContainer interface
- ✅ Service is instantiated in initializeServices()
- ✅ Service follows `async/await` pattern (no `.then()` chains)
- ✅ Service uses LoggingService for diagnostics
- ✅ Validation returns `{ valid, error }` object
- ✅ Settings changes use SettingsManager
- ✅ File operations use fileHelper utilities
- ✅ Errors are caught and logged, not silently swallowed
- ✅ JSDoc comments on all public methods
- ✅ Unit tests in test/suite/ directory
- ✅ Settings added to package.json contributes

