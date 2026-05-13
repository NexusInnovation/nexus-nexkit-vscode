import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fileExists, deepMerge, getNexkitUserDirectory } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";

/**
 * Test command detection result
 */
interface DetectedTestCommand {
  command: string;
  windows?: string;
}

/**
 * Hook template for running tests at the end of an agent session
 */
interface HookConfig {
  hooks: {
    Stop: Array<{
      type: string;
      command: string;
      windows?: string;
      timeout: number;
    }>;
  };
}

/**
 * Service for deploying chat hooks that run tests automatically.
 * NON-DESTRUCTIVE: merges with existing hook configuration.
 */
export class HooksConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  constructor(private readonly _userDirectory?: UserDirectoryService) {}

  /**
   * Deploy run-tests hook. Uses user directory when available, otherwise legacy path.
   */
  public async deployRunTestsHook(targetRoot: string): Promise<void> {
    try {
      const testCommand = await this._detectTestCommand(targetRoot);
      if (!testCommand) {
        this._logging.info("No test framework detected — skipping run-tests hook deployment.");
        return;
      }

      const hooksDir = this._userDirectory
        ? this._userDirectory.getAbsoluteTemplateLocations(targetRoot)["hooks"]
        : path.join(getNexkitUserDirectory(vscode.env.appName), "hooks");

      await this._writeHookFile(hooksDir, testCommand);
    } catch (error) {
      this._logging.error("Failed to deploy run-tests hook:", error);
    }
  }

  /**
   * Explicit user-directory deployment path (kept for compatibility).
   */
  public async deployRunTestsHookToUserDir(targetRoot: string): Promise<void> {
    if (!this._userDirectory) {
      this._logging.warn("UserDirectoryService not available — skipping user-level hook deployment.");
      return;
    }

    try {
      const testCommand = await this._detectTestCommand(targetRoot);
      if (!testCommand) {
        this._logging.info("No test framework detected — skipping user-level run-tests hook deployment.");
        return;
      }

      const locations = this._userDirectory.getAbsoluteTemplateLocations(targetRoot);
      const hooksDir = locations["hooks"];
      await this._writeHookFile(hooksDir, testCommand);
    } catch (error) {
      this._logging.error("Failed to deploy user-level run-tests hook:", error);
    }
  }

  /**
   * Write and merge hook file content.
   */
  private async _writeHookFile(hooksDir: string, testCommand: DetectedTestCommand): Promise<void> {
    await fs.promises.mkdir(hooksDir, { recursive: true });

    const hookPath = path.join(hooksDir, "run-tests.json");
    const hookConfig: HookConfig = {
      hooks: {
        Stop: [
          {
            type: "command",
            command: testCommand.command,
            ...(testCommand.windows && { windows: testCommand.windows }),
            timeout: 120,
          },
        ],
      },
    };

    if (await fileExists(hookPath)) {
      const existingContent = await fs.promises.readFile(hookPath, "utf8");
      try {
        const existingConfig = JSON.parse(existingContent);
        const merged = deepMerge(hookConfig, existingConfig);
        await fs.promises.writeFile(hookPath, JSON.stringify(merged, null, 2), "utf8");
        this._logging.info("Merged run-tests hook with existing configuration.");
        return;
      } catch {
        this._logging.warn("Existing run-tests.json is invalid JSON — overwriting with detected config.");
      }
    }

    await fs.promises.writeFile(hookPath, JSON.stringify(hookConfig, null, 2), "utf8");
    this._logging.info(`Deployed run-tests hook: ${testCommand.command}`);
  }

  /**
   * Detect test command from project files.
   */
  private async _detectTestCommand(targetRoot: string): Promise<DetectedTestCommand | null> {
    const packageJsonPath = path.join(targetRoot, "package.json");
    if (await fileExists(packageJsonPath)) {
      try {
        const content = await fs.promises.readFile(packageJsonPath, "utf8");
        const pkg = JSON.parse(content);
        const scripts = pkg.scripts || {};

        if (scripts["test:headless"]) {
          return {
            command: "npm run test-compile && npm run test:headless",
            windows: "npm run test-compile; npm run test:headless",
          };
        }
        if (scripts["test:unit"]) {
          return {
            command: "npm run test-compile && npm run test:unit",
            windows: "npm run test-compile; npm run test:unit",
          };
        }
        if (scripts["test"]) {
          return { command: "npm test" };
        }
      } catch {
        this._logging.warn("Failed to parse package.json for test command detection.");
      }
    }

    const entries = await fs.promises.readdir(targetRoot).catch(() => [] as string[]);
    const hasSolution = entries.some((e) => e.endsWith(".sln"));
    const hasCsproj = entries.some((e) => e.endsWith(".csproj"));
    if (hasSolution || hasCsproj) {
      return { command: "dotnet test" };
    }

    if (
      (await fileExists(path.join(targetRoot, "pytest.ini"))) ||
      (await fileExists(path.join(targetRoot, "pyproject.toml"))) ||
      (await fileExists(path.join(targetRoot, "setup.py")))
    ) {
      return { command: "python -m pytest" };
    }

    if (await fileExists(path.join(targetRoot, "go.mod"))) {
      return { command: "go test ./..." };
    }

    return null;
  }
}
