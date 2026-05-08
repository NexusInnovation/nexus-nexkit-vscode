import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fileExists, getNexkitUserDirectory } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";
import { LoggingService } from "../../shared/services/loggingService";
import { NexkitFileWatcherService } from "../nexkit-file-watcher/nexkitFileWatcherService";

/**
 * Summary of files migrated from workspace to user .nexkit
 */
export interface MigrationSummary {
  /** Total number of files migrated */
  migratedCount: number;
  /** Files that were migrated, grouped by template type */
  migratedFiles: Record<string, string[]>;
}

/**
 * Prefix used to identify Nexkit-managed template files
 */
const NEXKIT_FILE_PREFIX = "nexkit.";

/**
 * Service for migrating Nexkit template files from workspace locations to user .nexkit directory.
 * During workspace initialization, this service scans .github/<type>/ subdirectories for files whose names
 * start with "nexkit.", and also migrates legacy workspace .nexkit/<type>/ content.
 * Root-level project files such as .github/copilot-instructions.md are intentionally untouched.
 */
export class NexkitFileMigrationService {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Migrate Nexkit-managed files from workspace to user-level .nexkit.
    *
    * @param workspaceRoot Absolute path to the workspace root
    * @returns Summary of migrated files, or null if nothing was migrated
    */
  public async migrateNexkitFiles(workspaceRoot: string): Promise<MigrationSummary | null> {
    const githubDir = path.join(workspaceRoot, ".github");
    const workspaceNexkitDir = path.join(workspaceRoot, ".nexkit");
    const userNexkitDir = getNexkitUserDirectory(vscode.env.appName);

    const migratedFiles: Record<string, string[]> = {};
    let migratedCount = 0;

    const watcher = NexkitFileWatcherService.getInstance();
    watcher.beginBulkOperation();
    try {
      for (const templateType of AI_TEMPLATE_FILE_TYPES) {
        const movedFromGithub = await this.migrateGithubTemplateType(githubDir, userNexkitDir, templateType);
        const movedFromWorkspace = await this.migrateWorkspaceTemplateType(workspaceNexkitDir, userNexkitDir, templateType);
        const movedFiles = [...movedFromGithub, ...movedFromWorkspace];
        migratedFiles[templateType] = movedFiles;
        migratedCount += movedFiles.length;
      }

      await this.cleanupEmptyWorkspaceNexkit(workspaceNexkitDir);
    } finally {
      await watcher.endBulkOperation();
    }

    if (migratedCount === 0) {
      return null;
    }

    this._logging.info(`Migration complete: moved ${migratedCount} file(s) from workspace to user .nexkit`);

    const nonEmptyMigratedFiles = Object.fromEntries(Object.entries(migratedFiles).filter(([, files]) => files.length > 0));
    return { migratedCount, migratedFiles: nonEmptyMigratedFiles };
  }

  private async migrateGithubTemplateType(githubDir: string, userNexkitDir: string, templateType: string): Promise<string[]> {
    const sourceDir = path.join(githubDir, templateType);
    if (!(await fileExists(sourceDir))) {
      return [];
    }

    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.startsWith(NEXKIT_FILE_PREFIX)).map((entry) => entry.name);
    if (files.length === 0) {
      return [];
    }

    const targetDir = path.join(userNexkitDir, templateType);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const movedFiles: string[] = [];
    for (const fileName of files) {
      const sourcePath = path.join(sourceDir, fileName);
      const targetPath = path.join(targetDir, fileName);

      try {
        await fs.promises.copyFile(sourcePath, targetPath);
        await fs.promises.unlink(sourcePath);
        movedFiles.push(fileName);
        this._logging.info(`Migrated ${templateType}/${fileName} from .github to user .nexkit`);
      } catch (error) {
        this._logging.error(
          `Failed to migrate ${templateType}/${fileName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return movedFiles;
  }

  private async migrateWorkspaceTemplateType(
    workspaceNexkitDir: string,
    userNexkitDir: string,
    templateType: string
  ): Promise<string[]> {
    const sourceDir = path.join(workspaceNexkitDir, templateType);
    if (!(await fileExists(sourceDir))) {
      return [];
    }

    const targetDir = path.join(userNexkitDir, templateType);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const movedFiles = await this.copyDirectoryAndCollectFiles(sourceDir, targetDir);
    await fs.promises.rm(sourceDir, { recursive: true, force: true });
    this._logging.info(`Migrated ${movedFiles.length} file(s) from workspace .nexkit/${templateType} to user .nexkit/${templateType}`);

    return movedFiles;
  }

  private async copyDirectoryAndCollectFiles(sourceDir: string, targetDir: string, relativeBase: string = ""): Promise<string[]> {
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
    const movedFiles: string[] = [];

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await fs.promises.mkdir(targetPath, { recursive: true });
        const nestedFiles = await this.copyDirectoryAndCollectFiles(sourcePath, targetPath, relativePath);
        movedFiles.push(...nestedFiles);
      } else if (entry.isFile()) {
        await fs.promises.copyFile(sourcePath, targetPath);
        movedFiles.push(relativePath);
      }
    }

    return movedFiles;
  }

  private async cleanupEmptyWorkspaceNexkit(workspaceNexkitDir: string): Promise<void> {
    if (!(await fileExists(workspaceNexkitDir))) {
      return;
    }

    const remaining = await fs.promises.readdir(workspaceNexkitDir);
    if (remaining.length === 0) {
      await fs.promises.rm(workspaceNexkitDir, { recursive: true, force: true });
    }
  }
}
