import { LoggingService } from "../../shared/services/loggingService";
import { GitExcludeConfigDeployer } from "./gitExcludeConfigDeployer";
import { NexkitFileMigrationService, MigrationSummary } from "./nexkitFileMigrationService";
import { HooksConfigDeployer } from "./hooksConfigDeployer";
import { GitHubAuthPromptService } from "./githubAuthPromptService";
import { getWorkspaceRoot } from "../../shared/utils/fileHelper";

/**
 * Service that runs essential Nexkit verification checks at every VS Code startup.
 * Startup verification keeps workspace-local configuration (git exclude, hooks, nexkit file layout) in sync.
 * It is READ-ONLY with respect to VS Code settings.json: it never writes user- or workspace-level settings.
 * Settings deployment happens exclusively from the sanctioned initialization/migration entry points.
 */
export class StartupVerificationService {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _gitExcludeConfigDeployer: GitExcludeConfigDeployer,
    private readonly _hooksConfigDeployer: HooksConfigDeployer,
    private readonly _nexkitFileMigration: NexkitFileMigrationService,
    private readonly _githubAuthPrompt: GitHubAuthPromptService
  ) {}

  /**
   * Run all startup verification checks for the active workspace.
   * This method does not write settings.json and does not block extension activation — errors are logged but not re-thrown.
   */
  public async verifyOnStartup(): Promise<void> {
    let workspaceRoot: string;
    try {
      workspaceRoot = getWorkspaceRoot();
    } catch {
      return;
    }
    this._logging.info("Running Nexkit startup verification...");

    await this.verifyWorkspaceConfiguration(workspaceRoot);
    await this._githubAuthPrompt.ensureAuthenticated();

    this._logging.info("Nexkit startup verification complete.");
  }

  /**
   * Verify and apply essential workspace-local configuration.
   * This is READ-ONLY with respect to settings.json — it never deploys user- or workspace-level settings.
   * Settings deployment is performed only from the sanctioned initialization and migration entry points.
   * @param workspaceRoot Absolute path to the workspace root
   * @returns Summary of migrated files, or null if nothing was migrated
   */
  public async verifyWorkspaceConfiguration(workspaceRoot: string): Promise<MigrationSummary | null> {
    await this._gitExcludeConfigDeployer.deployGitExclude(workspaceRoot);

    // Always deploy the run-tests hook into the workspace .nexkit directory when a workspace is open.
    await this._hooksConfigDeployer.deployRunTestsHook(workspaceRoot);

    // Migrate any nexkit.* files still in .github/<type>/ to .nexkit/<type>/
    return await this._nexkitFileMigration.migrateNexkitFiles(workspaceRoot);
  }
}
