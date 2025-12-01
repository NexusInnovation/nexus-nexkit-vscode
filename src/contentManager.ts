import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface InstalledItemsMap {
  agents: Set<string>;
  prompts: Set<string>;
  instructions: Set<string>;
}

export class ContentManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get workspace root path
   */
  private getWorkspaceRoot(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }
    return workspaceFolder.uri.fsPath;
  }

  /**
   * Get the directory path for a category
   */
  private getCategoryPath(
    category: "agents" | "prompts" | "instructions"
  ): string {
    const workspaceRoot = this.getWorkspaceRoot();
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
  async getInstalledItems(): Promise<InstalledItemsMap> {
    const installed: InstalledItemsMap = {
      agents: new Set<string>(),
      prompts: new Set<string>(),
      instructions: new Set<string>(),
    };

    const categories: Array<"agents" | "prompts" | "instructions"> = [
      "agents",
      "prompts",
      "instructions",
    ];

    for (const category of categories) {
      try {
        const dirPath = this.getCategoryPath(category);
        if (await this.fileExists(dirPath)) {
          const files = await fs.promises.readdir(dirPath);
          files.forEach((file) => {
            if (this.isValidFile(file, category)) {
              installed[category].add(file);
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
   * Check if a file is valid for the category
   */
  private isValidFile(
    filename: string,
    category: "agents" | "prompts" | "instructions"
  ): boolean {
    const extension =
      category === "agents"
        ? ".agent.md"
        : category === "prompts"
        ? ".prompt.md"
        : ".instructions.md";
    return filename.endsWith(extension);
  }

  /**
   * Check if an item is installed
   */
  async isInstalled(
    category: "agents" | "prompts" | "instructions",
    filename: string
  ): Promise<boolean> {
    const filePath = path.join(this.getCategoryPath(category), filename);
    return this.fileExists(filePath);
  }

  /**
   * Install a file to the appropriate category directory
   */
  async installFile(
    category: "agents" | "prompts" | "instructions",
    filename: string,
    content: string
  ): Promise<void> {
    try {
      const dirPath = this.getCategoryPath(category);
      const filePath = path.join(dirPath, filename);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Write file (overwrite if exists since checkbox controls state)
      await fs.promises.writeFile(filePath, content, "utf8");

      vscode.window.showInformationMessage(
        `Installed ${filename} to .github/${category}/`
      );
    } catch (error) {
      console.error(`Failed to install ${filename}:`, error);
      vscode.window.showErrorMessage(`Failed to install ${filename}: ${error}`);
      throw error;
    }
  }

  /**
   * Remove a file from the category directory
   */
  async removeFile(
    category: "agents" | "prompts" | "instructions",
    filename: string
  ): Promise<void> {
    try {
      const filePath = path.join(this.getCategoryPath(category), filename);

      // Check if file exists
      if (!(await this.fileExists(filePath))) {
        vscode.window.showWarningMessage(
          `File ${filename} not found in .github/${category}/`
        );
        return;
      }

      // Delete file
      await fs.promises.unlink(filePath);

      vscode.window.showInformationMessage(
        `Removed ${filename} from .github/${category}/`
      );
    } catch (error) {
      console.error(`Failed to remove ${filename}:`, error);
      vscode.window.showErrorMessage(`Failed to remove ${filename}: ${error}`);
      throw error;
    }
  }

  /**
   * Get count of installed items for a category
   */
  async getInstalledCount(
    category: "agents" | "prompts" | "instructions"
  ): Promise<number> {
    try {
      const dirPath = this.getCategoryPath(category);
      if (!(await this.fileExists(dirPath))) {
        return 0;
      }

      const files = await fs.promises.readdir(dirPath);
      return files.filter((file) => this.isValidFile(file, category)).length;
    } catch (error) {
      console.error(`Error counting installed items in ${category}:`, error);
      return 0;
    }
  }

  /**
   * List all files in a category
   */
  async listFiles(
    category: "agents" | "prompts" | "instructions"
  ): Promise<string[]> {
    try {
      const dirPath = this.getCategoryPath(category);
      if (!(await this.fileExists(dirPath))) {
        return [];
      }

      const files = await fs.promises.readdir(dirPath);
      return files.filter((file) => this.isValidFile(file, category));
    } catch (error) {
      console.error(`Error listing files in ${category}:`, error);
      return [];
    }
  }
}
