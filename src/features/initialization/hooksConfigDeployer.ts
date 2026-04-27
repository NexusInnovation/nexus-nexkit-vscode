import * as fs from "fs";
import * as path from "path";
import { fileExists, deepMerge } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";

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
 * Detects the project's test framework and creates a Stop hook
 * in .nexkit/hooks/run-tests.json so tests run when an agent session ends.
 *
 * NON-DESTRUCTIVE: Merges with existing hook configuration.
 */
export class HooksConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Deploy the run-tests hook to the workspace.
   * Detects the project test command and writes .nexkit/hooks/run-tests.json.
   * @param targetRoot Absolute path to the workspace root
   */
  public async deployRunTestsHook(targetRoot: string): Promise<void> {
    try {
      const testCommand = await this._detectTestCommand(targetRoot);
      if (!testCommand) {
        this._logging.info("No test framework detected — skipping run-tests hook deployment.");
        return;
      }

      const hooksDir = path.join(targetRoot, ".nexkit", "hooks");
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

      // Merge with existing hook file if present
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
    } catch (error) {
      this._logging.error("Failed to deploy run-tests hook:", error);
    }
  }

  /**
   * Detect the test command for the project by checking for known project files.
   * Returns null if no test framework is detected.
   */
  private async _detectTestCommand(targetRoot: string): Promise<DetectedTestCommand | null> {
    // Node.js — check package.json for test scripts
    const packageJsonPath = path.join(targetRoot, "package.json");
    if (await fileExists(packageJsonPath)) {
      try {
        const content = await fs.promises.readFile(packageJsonPath, "utf8");
        const pkg = JSON.parse(content);
        const scripts = pkg.scripts || {};

        // Prefer test:headless > test:unit > test
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

    // .NET — check for *.sln or *.csproj
    const entries = await fs.promises.readdir(targetRoot).catch(() => [] as string[]);
    const hasSolution = entries.some((e) => e.endsWith(".sln"));
    const hasCsproj = entries.some((e) => e.endsWith(".csproj"));
    if (hasSolution || hasCsproj) {
      return { command: "dotnet test" };
    }

    // Python — check for pytest.ini, pyproject.toml, or setup.py
    if (
      (await fileExists(path.join(targetRoot, "pytest.ini"))) ||
      (await fileExists(path.join(targetRoot, "pyproject.toml"))) ||
      (await fileExists(path.join(targetRoot, "setup.py")))
    ) {
      return { command: "python -m pytest" };
    }

    // Go — check for go.mod
    if (await fileExists(path.join(targetRoot, "go.mod"))) {
      return { command: "go test ./..." };
    }

    return null;
  }
}
