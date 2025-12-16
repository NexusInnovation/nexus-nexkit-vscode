import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CATEGORIES, ItemCategory } from "../types/categories";
import { RepositoryItem } from "./gitHubRepositoryService";
import { getWorkspaceRoot } from "../helpers/fileSystemHelper";

export type InstalledItemsMap = Record<ItemCategory, string[]>;

/**
 * Manages content installation and organization within the workspace
 */
export class ContentManagerService {
  /**
   * Get the directory path for a category
   */
  private getCategoryPath(category: ItemCategory): string {
    const workspaceRoot = getWorkspaceRoot();
    return path.join(workspaceRoot, ".github", category);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
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
        if (await this.fileExists(dirPath)) {
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
   */
  async installItem(item: RepositoryItem, content: string): Promise<void> {
    try {
      const dirPath = this.getCategoryPath(item.category);
      const filePath = path.join(dirPath, item.name);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Write file (overwrites if it already exists)
      await fs.promises.writeFile(filePath, content, "utf8");

      vscode.window.showInformationMessage(
        `Installed ${item.name} from ${item.repository}`
      );
    } catch (error) {
      console.error(`Failed to install ${item.name}:`, error);
      vscode.window.showErrorMessage(`Failed to install ${item.name}: ${error}`);
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
      if (!(await this.fileExists(filePath))) {
        vscode.window.showWarningMessage(
          `File ${item.name} not found in .github/${item.category}/`
        );
        return;
      }

      // Delete file
      await fs.promises.unlink(filePath);

      vscode.window.showInformationMessage(
        `Removed ${item.name} from .github/${item.category}/`
      );
    } catch (error) {
      console.error(`Failed to remove ${item.name}:`, error);
      vscode.window.showErrorMessage(`Failed to remove ${item.name}: ${error}`);
      throw error;
    }
  }
}
