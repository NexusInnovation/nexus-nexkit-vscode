import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CATEGORIES, ItemCategory } from "../types/categories";
import { RepositoryItem, GitHubRepositoryService } from "./gitHubRepositoryService";
import { fileExists, getWorkspaceRoot } from "../helpers/fileSystemHelper";
import { RepositoryConfigManager } from "../config/repositoryConfigManager";

export type InstalledItemsMap = Record<ItemCategory, string[]>;

/**
 * Manages workspace AI resources (agents, prompts, instructions, chatmodes) installation and organization
 */
export class WorkspaceAIResourceService {
  /**
   * Get the directory path for a category
   */
  private getCategoryPath(category: ItemCategory): string {
    const workspaceRoot = getWorkspaceRoot();
    return path.join(workspaceRoot, ".github", category);
  }

  /**
   * Get all installed items organized by category
   */
  public async getInstalledItems(): Promise<InstalledItemsMap> {
    const installed: InstalledItemsMap = {
      agents: [],
      prompts: [],
      instructions: [],
      chatmodes: [],
    };

    for (const category of CATEGORIES) {
      try {
        const dirPath = this.getCategoryPath(category);
        if (await fileExists(dirPath)) {
          const files = await fs.promises.readdir(dirPath);
          files.forEach((file) => {
            if (file.endsWith(".md")) {
              installed[category].push(file);
            }
          });
        }
      } catch (error) {
        console.error(`Error scanning ${category} directory:`, error);
        // Continue with other categories
      }
    }

    return installed;
  }

  /**
   * Install a file from a repository item
   * @param silent If true, suppress user-facing notifications
   */
  async installItem(item: RepositoryItem, content: string, silent: boolean = false): Promise<void> {
    try {
      const dirPath = this.getCategoryPath(item.category);
      const filePath = path.join(dirPath, item.name);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Write file (overwrites if it already exists)
      await fs.promises.writeFile(filePath, content, "utf8");

      if (!silent) {
        vscode.window.showInformationMessage(`Installed ${item.name} from ${item.repository}`);
      }
    } catch (error) {
      console.error(`Failed to install ${item.name}:`, error);
      if (!silent) {
        vscode.window.showErrorMessage(`Failed to install ${item.name}: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Uninstall a file by removing it from the workspace
   */
  async uninstallItem(item: RepositoryItem): Promise<void> {
    try {
      const filePath = path.join(this.getCategoryPath(item.category), item.name);
      // Check if file exists
      if (!(await fileExists(filePath))) {
        vscode.window.showWarningMessage(`File ${item.name} not found in .github/${item.category}/`);
        return;
      }

      // Delete file
      await fs.promises.unlink(filePath);

      vscode.window.showInformationMessage(`Removed ${item.name} from .github/${item.category}/`);
    } catch (error) {
      console.error(`Failed to remove ${item.name}:`, error);
      vscode.window.showErrorMessage(`Failed to remove ${item.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Deploy default resources from the Nexus Templates repository
   * Installs all agents, prompts, and chatmodes (excludes instructions)
   */
  async deployDefaultResources(): Promise<{ installed: number; failed: number; categories: Record<string, number> }> {
    const summary = {
      installed: 0,
      failed: 0,
      categories: {} as Record<string, number>,
    };

    try {
      // Get the default Nexus Templates repository configuration
      const defaultRepo = RepositoryConfigManager.getDefaultRepository();

      if (!defaultRepo) {
        console.error("No default repository found for deploying resources.");
        return summary;
      }

      // Create GitHub repository service
      const githubService = new GitHubRepositoryService(defaultRepo);

      // Fetch all items from the repository
      const allItems = await githubService.fetchAllItems();

      // Filter out instructions (only deploy agents, prompts, chatmodes)
      const itemsToDeploy = allItems.filter((item) => item.category !== "instructions");

      // Install each item in parallel
      const installPromises = itemsToDeploy.map(async (item) => {
        try {
          // Download file content
          const content = await githubService.downloadFile(item);

          // Install the item (silent mode)
          await this.installItem(item, content, true);

          return { success: true, item };
        } catch (error) {
          console.error(`Failed to deploy ${item.name} from ${item.category}:`, error);
          return { success: false, item, error };
        }
      });

      // Wait for all installations to complete
      const results = await Promise.allSettled(installPromises);

      // Process results and update summary
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { success, item } = result.value;
          if (success) {
            summary.installed++;
            summary.categories[item.category] = (summary.categories[item.category] || 0) + 1;
          } else {
            summary.failed++;
          }
        } else {
          summary.failed++;
        }
      }
    } catch (error) {
      console.error("Failed to deploy default resources:", error);
      // Don't throw, return summary as-is
    }

    return summary;
  }
}
