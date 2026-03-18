import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";
import { SettingsManager } from "../../core/settingsManager";
import { ProjectTypeDetectorService } from "./projectTypeDetectorService";
import { TestCommandResolverService, TestCommand } from "./testCommandResolverService";

/**
 * Hook JSON structure matching the GitHub Copilot hooks specification
 */
interface CopilotHookConfig {
  version: number;
  hooks: {
    agentStop?: CopilotHookEntry[];
    [key: string]: CopilotHookEntry[] | undefined;
  };
}

interface CopilotHookEntry {
  type: "command";
  bash?: string;
  powershell?: string;
  cwd?: string;
  timeoutSec?: number;
}

const HOOK_FILE_NAME = "nexkit-auto-test.json";
const HOOKS_DIR = ".nexkit/hooks";

/**
 * Service for deploying Copilot agent hooks that run tests after code modifications.
 * Creates a hook JSON file in .nexkit/hooks/ that triggers test execution on agentStop.
 * NON-DESTRUCTIVE: Overwrites only the NexKit-managed hook file, not user-created hooks.
 */
export class CopilotHookFileDeployer {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _projectTypeDetector: ProjectTypeDetectorService,
    private readonly _testCommandResolver: TestCommandResolverService
  ) {}

  /**
   * Deploy the auto-test hook file for the given workspace.
   * Detects project type, resolves the test command, and writes the hook JSON.
   * Skipped if the setting nexkit.copilot.autoTestHookEnabled is false.
   * @param workspaceRoot Absolute path to the workspace root
   */
  public async deployCopilotTestHook(workspaceRoot: string): Promise<void> {
    if (!SettingsManager.isCopilotAutoTestHookEnabled()) {
      this._logging.info("Copilot auto-test hook is disabled. Skipping deployment.");
      return;
    }

    this._logging.info("Deploying Copilot auto-test hook...");

    const detection = await this._projectTypeDetector.detectProjectType(workspaceRoot);
    const testCommand = this._testCommandResolver.resolveTestCommand(detection.type);

    const hookConfig = this._buildHookConfig(testCommand);

    const hooksDir = path.join(workspaceRoot, HOOKS_DIR);
    const hookFilePath = path.join(hooksDir, HOOK_FILE_NAME);

    await fs.promises.mkdir(hooksDir, { recursive: true });
    await fs.promises.writeFile(hookFilePath, JSON.stringify(hookConfig, null, 2), "utf8");

    this._logging.info(`Copilot auto-test hook deployed: ${hookFilePath} (command: ${testCommand.bash})`);
  }

  /**
   * Verify that the auto-test hook file exists.
   * @param workspaceRoot Absolute path to the workspace root
   * @returns true if the hook file exists, false otherwise
   */
  public async verifyHookExists(workspaceRoot: string): Promise<boolean> {
    const hookFilePath = path.join(workspaceRoot, HOOKS_DIR, HOOK_FILE_NAME);
    return fileExists(hookFilePath);
  }

  /**
   * Build the hook configuration JSON from a resolved test command
   */
  private _buildHookConfig(testCommand: TestCommand): CopilotHookConfig {
    return {
      version: 1,
      hooks: {
        agentStop: [
          {
            type: "command",
            bash: testCommand.bash,
            powershell: testCommand.powershell,
            cwd: ".",
            timeoutSec: testCommand.timeoutSec,
          },
        ],
      },
    };
  }
}
