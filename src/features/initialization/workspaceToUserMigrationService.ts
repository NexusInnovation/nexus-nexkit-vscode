import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { fileExists, copyDirectory } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";
import { GitHubTemplateBackupService } from "../backup-management/backupService";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";

/**
 * Key used in globalState to track migration state.
 */
const MIGRATION_STATE_KEY = "nexkit.workspaceToUserMigration";

/**
 * Possible migration states for a workspace.
 */
type MigrationState = "pending" | "completed" | "dismissed";

/**
 * Result of detecting a workspace .nexkit/ installation.
 */
export interface WorkspaceMigrationDetection {
  /** Whether a workspace .nexkit/ directory exists */
  hasWorkspaceNexkit: boolean;
  /** Template files found in workspace .nexkit/ grouped by type */
  templateFiles: Record<string, string[]>;
  /** Whether project-specific instructions exist (may need user decision) */
  hasProjectSpecificInstructions: boolean;
}

/**
 * Summary of a completed migration.
 */
export interface WorkspaceToUserMigrationSummary {
  /** Total files copied */
  copiedCount: number;
  /** Files copied grouped by type */
  copiedFiles: Record<string, string[]>;
  /** Files skipped (already exist in user dir) */
  skippedCount: number;
  /** Whether .nexkit/ was deleted from workspace */
  workspaceDeleted: boolean;
  /** Whether .gitignore section was removed */
  gitignoreCleaned: boolean;
  /** Whether workspace settings were cleaned */
  settingsCleaned: boolean;
}

/**
 * Service for migrating workspace-level .nexkit/ templates to the user directory.
 * Provides detection, notification, and the full migration flow with backup safety.
 */
export class WorkspaceToUserMigrationService {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _userDirectory: UserDirectoryService,
    private readonly _backup: GitHubTemplateBackupService
  ) {}

  /**
   * Check on activation whether a workspace migration should be offered.
   * Does not block activation. Respects dismissal state.
   * @param context Extension context for globalState access
   */
  public async checkAndPromptMigration(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const state = this._getMigrationState(context, workspaceRoot);

    if (state === "completed" || state === "dismissed") {
      return;
    }

    const detection = await this.detectWorkspaceInstallation(workspaceRoot);
    if (!detection.hasWorkspaceNexkit) {
      return;
    }

    this._logging.info("Detected workspace .nexkit/ installation — prompting for migration.");
    await this._showMigrationPrompt(context, workspaceRoot, detection);
  }

  /**
   * Detect whether the current workspace has a .nexkit/ directory with templates.
   */
  public async detectWorkspaceInstallation(workspaceRoot: string): Promise<WorkspaceMigrationDetection> {
    const nexkitDir = path.join(workspaceRoot, ".nexkit");

    if (!(await fileExists(nexkitDir))) {
      return { hasWorkspaceNexkit: false, templateFiles: {}, hasProjectSpecificInstructions: false };
    }

    const templateFiles: Record<string, string[]> = {};
    let hasProjectSpecificInstructions = false;

    for (const templateType of AI_TEMPLATE_FILE_TYPES) {
      const typeDir = path.join(nexkitDir, templateType);
      if (!(await fileExists(typeDir))) {
        continue;
      }

      try {
        const entries = await fs.promises.readdir(typeDir, { withFileTypes: true });
        // Include both files and directories (e.g. skills/ are directory-based templates)
        const names = entries.filter((e) => e.isFile() || e.isDirectory()).map((e) => e.name);
        if (names.length > 0) {
          templateFiles[templateType] = names;
        }
      } catch {
        // Directory not readable — skip
      }
    }

    // Check for instructions that may be project-specific (not prefixed with nexkit.)
    const instructionsDir = path.join(nexkitDir, "instructions");
    if (await fileExists(instructionsDir)) {
      try {
        const entries = await fs.promises.readdir(instructionsDir, { withFileTypes: true });
        hasProjectSpecificInstructions = entries.some((e) => e.isFile() && !e.name.startsWith("nexkit."));
      } catch {
        // Ignore
      }
    }

    const hasFiles = Object.keys(templateFiles).length > 0;
    return { hasWorkspaceNexkit: hasFiles, templateFiles, hasProjectSpecificInstructions };
  }

  /**
   * Execute the full migration flow from workspace .nexkit/ to user directory.
   * Creates a backup before any destructive operations.
   * @param workspaceRoot Workspace root path
   * @param deleteWorkspaceDir Whether to delete .nexkit/ from workspace after copying
   * @param skipProjectSpecificInstructions Whether to skip non-nexkit instruction files
   */
  public async executeMigration(
    workspaceRoot: string,
    deleteWorkspaceDir: boolean,
    skipProjectSpecificInstructions: boolean = false
  ): Promise<WorkspaceToUserMigrationSummary> {
    const nexkitDir = path.join(workspaceRoot, ".nexkit");

    // Step 0: Create backup as safety net
    this._logging.info("Creating backup before migration...");
    const backupPath = await this._backup.backupTemplates(workspaceRoot);
    if (backupPath) {
      this._logging.info(`Backup created at: ${backupPath}`);
    }

    // Step 1: Ensure user directory structure exists
    await this._userDirectory.ensureUserDirectoryStructure(workspaceRoot);

    // Step 2: Copy templates to user directory
    const { copiedCount, copiedFiles, skippedCount } = await this._copyTemplatesToUserDir(
      workspaceRoot,
      nexkitDir,
      skipProjectSpecificInstructions
    );
    this._logging.info(`Migration: copied ${copiedCount} items, skipped ${skippedCount} (already exist).`);

    // Step 3: Remove .nexkit/ section from .gitignore
    const gitignoreCleaned = await this._removeGitignoreSection(workspaceRoot);

    // Step 4: Clean up .vscode/settings.json entries
    const settingsCleaned = await this._cleanupWorkspaceSettings(workspaceRoot);

    // Step 5: Optionally delete workspace .nexkit/
    let workspaceDeleted = false;
    if (deleteWorkspaceDir) {
      try {
        await fs.promises.rm(nexkitDir, { recursive: true, force: true });
        workspaceDeleted = true;
        this._logging.info("Deleted workspace .nexkit/ directory.");
      } catch (error) {
        this._logging.error(`Failed to delete workspace .nexkit/: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { copiedCount, copiedFiles, skippedCount, workspaceDeleted, gitignoreCleaned, settingsCleaned };
  }

  /**
   * Copy all template files/directories from workspace .nexkit/ to user directory.
   * Skips entries that already exist in the user directory (no overwrite).
   * When skipProjectSpecificInstructions is true, instruction files not prefixed with
   * "nexkit." are treated as project-specific and left in the workspace.
   */
  private async _copyTemplatesToUserDir(
    workspaceRoot: string,
    workspaceNexkitDir: string,
    skipProjectSpecificInstructions: boolean = false
  ): Promise<{ copiedCount: number; copiedFiles: Record<string, string[]>; skippedCount: number }> {
    const userLocations = this._userDirectory.getAbsoluteTemplateLocations(workspaceRoot);
    const copiedFiles: Record<string, string[]> = {};
    let copiedCount = 0;
    let skippedCount = 0;

    for (const templateType of AI_TEMPLATE_FILE_TYPES) {
      const sourceDir = path.join(workspaceNexkitDir, templateType);
      if (!(await fileExists(sourceDir))) {
        continue;
      }

      const targetDir = userLocations[templateType];
      if (!targetDir) {
        continue;
      }

      await fs.promises.mkdir(targetDir, { recursive: true });

      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
      } catch {
        continue;
      }

      const copied: string[] = [];
      for (const entry of entries) {
        // When requested, skip project-specific instruction files (not prefixed with nexkit.)
        if (
          skipProjectSpecificInstructions &&
          templateType === "instructions" &&
          entry.isFile() &&
          !entry.name.startsWith("nexkit.")
        ) {
          this._logging.info(`Skipped project-specific instruction: ${entry.name}`);
          continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isFile()) {
          if (await fileExists(targetPath)) {
            skippedCount++;
            this._logging.info(`Skipped ${templateType}/${entry.name} (already exists in user directory).`);
            continue;
          }

          await fs.promises.copyFile(sourcePath, targetPath);
          copied.push(entry.name);
          copiedCount++;
        } else if (entry.isDirectory()) {
          if (await fileExists(targetPath)) {
            skippedCount++;
            this._logging.info(`Skipped ${templateType}/${entry.name}/ (already exists in user directory).`);
            continue;
          }

          await copyDirectory(sourcePath, targetPath);
          copied.push(entry.name);
          copiedCount++;
        }
      }

      if (copied.length > 0) {
        copiedFiles[templateType] = copied;
      }
    }

    return { copiedCount, copiedFiles, skippedCount };
  }

  /**
   * Remove the NexKit section from .gitignore that references .nexkit/.
   */
  private async _removeGitignoreSection(workspaceRoot: string): Promise<boolean> {
    const gitignorePath = path.join(workspaceRoot, ".gitignore");

    if (!(await fileExists(gitignorePath))) {
      return false;
    }

    try {
      const content = await fs.promises.readFile(gitignorePath, "utf8");
      const sectionRegex = /\n?# BEGIN NexKit[\s\S]*?# END NexKit\n?/;

      if (!sectionRegex.test(content)) {
        return false;
      }

      const updatedContent = content.replace(sectionRegex, "");
      await fs.promises.writeFile(gitignorePath, updatedContent, "utf8");
      this._logging.info("Removed NexKit section from .gitignore.");
      return true;
    } catch (error) {
      this._logging.error(`Failed to clean .gitignore: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Remove NexKit-specific entries from .vscode/settings.json.
   * Removes workspace-level chat.*Locations entries that point to .nexkit/.
   */
  private async _cleanupWorkspaceSettings(workspaceRoot: string): Promise<boolean> {
    const settingsPath = path.join(workspaceRoot, ".vscode", "settings.json");

    if (!(await fileExists(settingsPath))) {
      return false;
    }

    try {
      const raw = await fs.promises.readFile(settingsPath, "utf8");
      const settings = JSON.parse(raw);
      let modified = false;

      const chatLocationKeys = [
        "chat.agentFilesLocations",
        "chat.agentSkillsLocations",
        "chat.hookFilesLocations",
        "chat.instructionsFilesLocations",
        "chat.promptFilesLocations",
      ];

      const isLegacyNexkitLocation = (loc: string): boolean => loc.startsWith(".nexkit/") || loc.includes("/.nexkit/");

      for (const key of chatLocationKeys) {
        if (settings[key]) {
          // Remove entries that reference the legacy workspace .nexkit/ directory
          const locations = settings[key] as Record<string, boolean>;
          const filtered: Record<string, boolean> = {};
          let removedAny = false;

          for (const [loc, enabled] of Object.entries(locations)) {
            if (isLegacyNexkitLocation(loc)) {
              removedAny = true;
              continue;
            }
            filtered[loc] = enabled;
          }

          if (removedAny) {
            if (Object.keys(filtered).length === 0) {
              delete settings[key];
            } else {
              settings[key] = filtered;
            }
            modified = true;
          }
        }
      }

      // Remove chat.useHooks if it was set by NexKit
      if (settings["chat.useHooks"] !== undefined) {
        delete settings["chat.useHooks"];
        modified = true;
      }

      if (modified) {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
        this._logging.info("Cleaned up NexKit entries from .vscode/settings.json.");
      }

      return modified;
    } catch (error) {
      this._logging.error(`Failed to clean workspace settings: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Show the migration prompt notification to the user.
   */
  private async _showMigrationPrompt(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    detection: WorkspaceMigrationDetection
  ): Promise<void> {
    const itemCount = Object.values(detection.templateFiles).reduce((sum, names) => sum + names.length, 0);
    const message = `NexKit now stores templates in your user directory. ${itemCount} template(s) found in workspace .nexkit/. Migrate now?`;

    const migrate = "Migrate";
    const later = "Later";
    const dismiss = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(message, migrate, later, dismiss);

    if (choice === migrate) {
      await this._runMigrationWithUI(context, workspaceRoot, detection);
    } else if (choice === dismiss) {
      await this._setMigrationState(context, workspaceRoot, "dismissed");
    }
    // "Later" — do nothing, will prompt again next activation
  }

  /**
   * Run migration with progress UI and user confirmation for deletion.
   */
  private async _runMigrationWithUI(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    detection: WorkspaceMigrationDetection
  ): Promise<void> {
    // Ask about project-specific instructions if detected
    let skipProjectSpecificInstructions = false;
    if (detection.hasProjectSpecificInstructions) {
      const instructionsChoice = await vscode.window.showInformationMessage(
        "Some instruction files in .nexkit/instructions/ appear to be project-specific. Migrate them to user directory anyway?",
        "Yes, migrate all",
        "Skip project-specific"
      );
      if (instructionsChoice === "Skip project-specific") {
        skipProjectSpecificInstructions = true;
        this._logging.info("User chose to skip project-specific instructions during migration.");
      }
    }

    // Ask about deleting workspace .nexkit/
    const deleteChoice = await vscode.window.showInformationMessage(
      "Delete workspace .nexkit/ folder after migration? (A backup will be created first.)",
      "Yes, delete",
      "No, keep it"
    );
    const deleteWorkspaceDir = deleteChoice === "Yes, delete";

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Migrating templates to user directory..." },
      async (progress) => {
        progress.report({ increment: 10, message: "Creating backup..." });

        try {
          const summary = await this.executeMigration(workspaceRoot, deleteWorkspaceDir, skipProjectSpecificInstructions);

          await this._setMigrationState(context, workspaceRoot, "completed");

          progress.report({ increment: 90, message: "Migration complete!" });

          vscode.window.showInformationMessage(
            `Migration complete: ${summary.copiedCount} template(s) migrated to user directory.` +
              (summary.skippedCount > 0 ? ` ${summary.skippedCount} template(s) skipped (already existed).` : "")
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this._logging.error(`Migration failed: ${errorMessage}`);
          vscode.window.showErrorMessage(`Migration failed: ${errorMessage}. Your templates have been backed up and are safe.`);
        }
      }
    );
  }

  /**
   * Get migration state for a workspace from globalState.
   */
  private _getMigrationState(context: vscode.ExtensionContext, workspaceRoot: string): MigrationState {
    const states = context.globalState.get<Record<string, MigrationState>>(MIGRATION_STATE_KEY, {});
    return states[workspaceRoot] ?? "pending";
  }

  /**
   * Set migration state for a workspace in globalState.
   */
  private async _setMigrationState(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    state: MigrationState
  ): Promise<void> {
    const states = context.globalState.get<Record<string, MigrationState>>(MIGRATION_STATE_KEY, {});
    states[workspaceRoot] = state;
    await context.globalState.update(MIGRATION_STATE_KEY, states);
  }
}
