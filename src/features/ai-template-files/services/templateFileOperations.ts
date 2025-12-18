import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AI_TEMPLATE_FILE_TYPES, AITemplateFile, AITemplateFileType, InstalledTemplatesMap } from "../models/aiTemplateFile";
import { fileExists, getWorkspaceRoot } from "../../../shared/utils/fileHelper";
import { TemplateFetcherService } from "./templateFetcherService";

/**
 * Options for installing a template
 */
export interface InstallOptions {
  silent?: boolean; // Suppress notifications
  overwrite?: boolean; // Overwrite if exists
}

/**
 * Summary of batch installation
 */
export interface BatchInstallSummary {
  installed: number;
  failed: number;
  types: Record<AITemplateFileType, number>;
}

/**
 * Service responsible for file system operations on templates
 * Handles installing, uninstalling, and checking installed templates
 */
export class TemplateFileOperations {
  constructor(private readonly fetcherService: TemplateFetcherService) {}

  /**
   * Get the directory path for a type of template
   */
  private getTemplateTypePath(templateFileType: AITemplateFileType): string {
    const workspaceRoot = getWorkspaceRoot();
    return path.join(workspaceRoot, ".github", templateFileType);
  }

  /**
   * Install a template to the workspace
   */
  public async installTemplate(templateFile: AITemplateFile, options: InstallOptions = {}): Promise<void> {
    const { silent = false, overwrite = true } = options;

    try {
      const dirPath = this.getTemplateTypePath(templateFile.type);
      const filePath = path.join(dirPath, templateFile.name);

      // Check if file already exists
      if (!overwrite && (await fileExists(filePath))) {
        if (!silent) {
          vscode.window.showWarningMessage(`Template "${templateFile.name}" already exists`);
        }
        return;
      }

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Download file content
      const content = await this.fetcherService.downloadTemplate(templateFile);

      // Write file (overwrites if it already exists)
      await fs.promises.writeFile(filePath, content, "utf8");

      if (!silent) {
        vscode.window.showInformationMessage(`Installed "${templateFile.name}" from '${templateFile.repository}'`);
      }
    } catch (error) {
      console.error(`Failed to install ${templateFile.name}:`, error);
      if (!silent) {
        vscode.window.showErrorMessage(`Failed to install ${templateFile.name}: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Uninstall a template from the workspace
   */
  public async uninstallTemplate(templateFile: AITemplateFile, silent: boolean = false): Promise<void> {
    try {
      const filePath = path.join(this.getTemplateTypePath(templateFile.type), templateFile.name);

      // Check if file exists
      if (!(await fileExists(filePath))) {
        if (!silent) {
          vscode.window.showWarningMessage(`File ${templateFile.name} not found in .github/${templateFile.type}/`);
        }
        return;
      }

      // Delete file
      await fs.promises.unlink(filePath);

      if (!silent) {
        vscode.window.showInformationMessage(`Removed ${templateFile.name} from .github/${templateFile.type}/`);
      }
    } catch (error) {
      console.error(`Failed to remove ${templateFile.name}:`, error);
      if (!silent) {
        vscode.window.showErrorMessage(`Failed to remove ${templateFile.name}: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Get all installed templates organized by type
   */
  public async getInstalledTemplates(): Promise<InstalledTemplatesMap> {
    const installed: InstalledTemplatesMap = {
      agents: [],
      prompts: [],
      instructions: [],
      chatmodes: [],
    };

    for (const type of AI_TEMPLATE_FILE_TYPES) {
      try {
        const dirPath = this.getTemplateTypePath(type);
        if (await fileExists(dirPath)) {
          const files = await fs.promises.readdir(dirPath);
          files.forEach((file) => {
            if (file.endsWith(".md")) {
              installed[type].push(file);
            }
          });
        }
      } catch (error) {
        console.error(`Error scanning ${type} directory:`, error);
        // Continue with other categories
      }
    }

    return installed;
  }

  /**
   * Install multiple templates in batch
   */
  public async installBatch(templates: AITemplateFile[], options: InstallOptions = {}): Promise<BatchInstallSummary> {
    const result: BatchInstallSummary = {
      installed: 0,
      failed: 0,
      types: {
        agents: 0,
        prompts: 0,
        instructions: 0,
        chatmodes: 0,
      },
    };

    const installPromises = templates.map(async (template) => {
      try {
        await this.installTemplate(template, { ...options, silent: true });
        result.installed++;
        result.types[template.type] = (result.types[template.type] || 0) + 1;
      } catch (error) {
        result.failed++;
        console.error(`Failed to install ${template.name}:`, error);
      }
    });

    await Promise.allSettled(installPromises);

    return result;
  }

  /**
   * Check if a template is installed
   */
  public async isTemplateInstalled(templateFile: AITemplateFile): Promise<boolean> {
    const filePath = path.join(this.getTemplateTypePath(templateFile.type), templateFile.name);
    return await fileExists(filePath);
  }
}
