import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { fileExists, deepMerge } from "../../shared/utils/fileSystemHelper";

/**
 * Service for managing VS Code workspace files (settings.json and extensions.json)
 */
export class VscodeWorkspaceService {
  private templatesPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.templatesPath = path.join(context.extensionPath, "resources", "templates", ".vscode");
  }

  /**
   * Deploy VS Code settings to the target workspace root
   * NON-DESTRUCTIVE: Deep merges with existing settings, user values take priority
   * @param targetRoot Root directory of the workspace
   */
  async deployVscodeSettings(targetRoot: string): Promise<void> {
    const templatePath = path.join(this.templatesPath, "settings.json");
    const targetPath = path.join(targetRoot, ".vscode", "settings.json");
    const targetDir = path.dirname(targetPath);

    await fs.promises.mkdir(targetDir, { recursive: true });

    // Read template settings
    let templateSettings: any;
    try {
      const templateContent = await fs.promises.readFile(templatePath, "utf8");
      templateSettings = JSON.parse(templateContent);
    } catch (error) {
      console.error("Failed to read template settings.json:", error);
      throw new Error("Template settings.json not found or invalid");
    }

    // Merge with existing settings if they exist (user settings take priority)
    let settings = templateSettings;
    if (await fileExists(targetPath)) {
      const existingContent = await fs.promises.readFile(targetPath, "utf8");
      try {
        const existingSettings = JSON.parse(existingContent);
        // Deep merge: template as base, user settings override
        settings = deepMerge(templateSettings, existingSettings);
      } catch (error) {
        // If existing settings are invalid JSON, log warning but use template
        console.warn("Existing .vscode/settings.json is invalid JSON. Using template settings.", error);
      }
    }

    await fs.promises.writeFile(targetPath, JSON.stringify(settings, null, 2), "utf8");
  }

  /**
   * Deploy VS Code extensions recommendations to the target workspace root
   * NON-DESTRUCTIVE: Merges with existing extensions, avoiding duplicates
   * @param targetRoot Root directory of the workspace
   */
  async deployVscodeExtensions(targetRoot: string): Promise<void> {
    const templatePath = path.join(this.templatesPath, "extensions.json");
    const targetPath = path.join(targetRoot, ".vscode", "extensions.json");
    const targetDir = path.dirname(targetPath);

    await fs.promises.mkdir(targetDir, { recursive: true });

    // Read template extensions
    let templateExtensions: any;
    try {
      const templateContent = await fs.promises.readFile(templatePath, "utf8");
      templateExtensions = JSON.parse(templateContent);
    } catch (error) {
      console.error("Failed to read template extensions.json:", error);
      throw new Error("Template extensions.json not found or invalid");
    }

    // Merge with existing extensions if they exist
    let extensions = templateExtensions;
    if (await fileExists(targetPath)) {
      const existingContent = await fs.promises.readFile(targetPath, "utf8");
      try {
        const existingExtensions = JSON.parse(existingContent);

        // Merge recommendations, avoiding duplicates
        const combinedRecommendations = new Set([
          ...(templateExtensions.recommendations || []),
          ...(existingExtensions.recommendations || []),
        ]);

        extensions = {
          ...existingExtensions,
          recommendations: Array.from(combinedRecommendations),
        };
      } catch (error) {
        // If existing extensions are invalid JSON, log warning but use template
        console.warn("Existing .vscode/extensions.json is invalid JSON. Using template extensions.", error);
      }
    }

    await fs.promises.writeFile(targetPath, JSON.stringify(extensions, null, 2), "utf8");
  }
}
