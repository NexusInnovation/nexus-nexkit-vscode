import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";
import { AI_TEMPLATE_FILE_TYPES } from "../ai-template-files/models/aiTemplateFile";
import { LoggingService } from "../../shared/services/loggingService";
import { NexkitFileWatcherService } from "../nexkit-file-watcher/nexkitFileWatcherService";

/**
 * Summary of files migrated from .github to .nexkit
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
 * Service for migrating Nexkit template files from .github to .nexkit directory.
 * During workspace initialization, this service scans .github/<type>/ subdirectories
 * for files whose names start with "nexkit." and moves them to .nexkit/<type>/.
 */
export class NexkitFileMigrationService {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Migrate Nexkit-managed files from .github to .nexkit.
   * Scans each template-type subdirectory (agents, prompts, instructions, chatmodes, skills)
   * inside .github/ for files starting with "nexkit." and moves them to the corresponding
   * .nexkit/<type>/ directory.
   *
   * @param workspaceRoot Absolute path to the workspace root
   * @returns Summary of migrated files, or null if nothing was migrated
   */
  public async migrateNexkitFiles(workspaceRoot: string): Promise<MigrationSummary | null> {
    const githubDir = path.join(workspaceRoot, ".github");

    if (!(await fileExists(githubDir))) {
      return null;
    }

    const migratedFiles: Record<string, string[]> = {};
    let migratedCount = 0;

    const watcher = NexkitFileWatcherService.getInstance();
    watcher.beginBulkOperation();
    try {
      for (const templateType of AI_TEMPLATE_FILE_TYPES) {
        const sourceDir = path.join(githubDir, templateType);

        if (!(await fileExists(sourceDir))) {
          continue;
        }

        const files = await this.findNexkitFiles(sourceDir);
        if (files.length === 0) {
          continue;
        }

        const targetDir = path.join(workspaceRoot, ".nexkit", templateType);
        await fs.promises.mkdir(targetDir, { recursive: true });

        const movedFiles: string[] = [];

        for (const fileName of files) {
          const sourcePath = path.join(sourceDir, fileName);
          const targetPath = path.join(targetDir, fileName);

          try {
            await fs.promises.copyFile(sourcePath, targetPath);
            await fs.promises.unlink(sourcePath);
            movedFiles.push(fileName);
            migratedCount++;
            this._logging.info(`Migrated ${templateType}/${fileName} from .github to .nexkit`);
          } catch (error) {
            this._logging.error(
              `Failed to migrate ${templateType}/${fileName}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        if (movedFiles.length > 0) {
          migratedFiles[templateType] = movedFiles;
        }
      }
    } finally {
      await watcher.endBulkOperation();
    }

    if (migratedCount === 0) {
      return null;
    }

    this._logging.info(`Migration complete: moved ${migratedCount} file(s) from .github to .nexkit`);

    return { migratedCount, migratedFiles };
  }

  /**
   * Find files in a directory whose names start with the Nexkit prefix
   */
  private async findNexkitFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.startsWith(NEXKIT_FILE_PREFIX)).map((entry) => entry.name);
    } catch {
      return [];
    }
  }
}
