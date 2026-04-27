import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import { GitIgnoreConfigDeployer } from "./gitIgnoreConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "./recommendedSettingsConfigDeployer";
import { NexkitFileMigrationService, MigrationSummary } from "./nexkitFileMigrationService";
import { HooksConfigDeployer } from "./hooksConfigDeployer";
import { GitHubAuthPromptService } from "./githubAuthPromptService";

/**
 * Service that runs essential Nexkit verification checks at every VS Code startup.
 * Ensures workspace configuration is always correct (settings, gitignore, file migration, auth).
 * These same checks are also part of workspace initialization (initWorkspace command),
 * and this service is the single source of truth for them to avoid duplication.
 */
export class StartupVerificationService {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _gitIgnoreConfigDeployer: GitIgnoreConfigDeployer,
    private readonly _recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer,
    private readonly _hooksConfigDeployer: HooksConfigDeployer,
    private readonly _nexkitFileMigration: NexkitFileMigrationService,
    private readonly _githubAuthPrompt: GitHubAuthPromptService
  ) {}

  /**
   * Run all startup verification checks for the active workspace.
   * All deployers are non-destructive (deep merge / section markers), safe to run repeatedly.
   * This method does not block extension activation — errors are logged but not re-thrown.
   */
  public async verifyOnStartup(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    this._logging.info("Running Nexkit startup verification...");

    await this.verifyWorkspaceConfiguration(workspaceRoot);
    await this._githubAuthPrompt.ensureAuthenticated();

    this._logging.info("Nexkit startup verification complete.");
  }

  /**
   * Verify and apply essential workspace configuration.
   * Ensures .gitignore, VS Code settings, and nexkit file locations are correct.
   * Called both at startup and during workspace initialization.
   * @param workspaceRoot Absolute path to the workspace root
   * @returns Summary of migrated files, or null if nothing was migrated
   */
  public async verifyWorkspaceConfiguration(workspaceRoot: string): Promise<MigrationSummary | null> {
    // Ensure .gitignore contains .nexkit/ exclusion
    await this._gitIgnoreConfigDeployer.deployGitignore(workspaceRoot);

    // Ensure VS Code settings contain all required chat file locations and hooks
    await this._recommendedSettingsConfigDeployer.deployVscodeSettings(workspaceRoot);

    // Deploy run-tests hook based on detected test framework
    await this._hooksConfigDeployer.deployRunTestsHook(workspaceRoot);

    // Migrate any nexkit.* files still in .github/<type>/ to .nexkit/<type>/
    return await this._nexkitFileMigration.migrateNexkitFiles(workspaceRoot);
  }
}
