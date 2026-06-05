import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import { GitExcludeConfigDeployer } from "./gitExcludeConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "./recommendedSettingsConfigDeployer";
import { NexkitFileMigrationService, MigrationSummary } from "./nexkitFileMigrationService";
import { HooksConfigDeployer } from "./hooksConfigDeployer";
import { GitHubAuthPromptService } from "./githubAuthPromptService";
import { getWorkspaceRoot } from "../../shared/utils/fileHelper";

/**
 * Service that runs essential Nexkit verification checks at every VS Code startup.
 * Startup verification avoids user-level VS Code settings writes so activation stays non-intrusive.
 * Workspace initialization (initWorkspace command) reuses the same service and performs the full configuration flow.
 */
export class StartupVerificationService {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _gitExcludeConfigDeployer: GitExcludeConfigDeployer,
    private readonly _recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer,
    private readonly _hooksConfigDeployer: HooksConfigDeployer,
    private readonly _nexkitFileMigration: NexkitFileMigrationService,
    private readonly _githubAuthPrompt: GitHubAuthPromptService
  ) {}

  /**
   * Run all startup verification checks for the active workspace.
   * User-level VS Code settings are intentionally not written during activation to avoid opening profile settings.json.
   * This method does not block extension activation — errors are logged but not re-thrown.
   */
  public async verifyOnStartup(): Promise<void> {
    let workspaceRoot: string;
    try {
      workspaceRoot = getWorkspaceRoot();
    } catch {
      return;
    }
    this._logging.info("Running Nexkit startup verification...");

    await this.verifyWorkspaceConfiguration(workspaceRoot, { deployUserLevelSettings: false });
    await this._githubAuthPrompt.ensureAuthenticated();

    this._logging.info("Nexkit startup verification complete.");
  }

  /**
   * Verify and apply essential workspace configuration.
   * Startup verification can skip user-level settings writes; explicit workspace initialization performs the full flow.
   * @param workspaceRoot Absolute path to the workspace root
   * @param options Verification options
   * @returns Summary of migrated files, or null if nothing was migrated
   */
  public async verifyWorkspaceConfiguration(
    workspaceRoot: string,
    options: { deployUserLevelSettings?: boolean } = {}
  ): Promise<MigrationSummary | null> {
    const { deployUserLevelSettings = true } = options;

    await this._gitExcludeConfigDeployer.deployGitExclude(workspaceRoot);

    if (deployUserLevelSettings) {
      await this._recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceRoot);
    }

    // Always deploy the run-tests hook into the workspace .nexkit directory when a workspace is open.
    await this._hooksConfigDeployer.deployRunTestsHook(workspaceRoot);

    // Migrate any nexkit.* files still in .github/<type>/ to .nexkit/<type>/
    return await this._nexkitFileMigration.migrateNexkitFiles(workspaceRoot);
  }
}
