import * as fs from "fs";
import * as path from "path";
import { fileExists, deepMerge } from "../../shared/utils/fileHelper";

/**
 * Template for VS Code workspace settings
 */
const SETTINGS_TEMPLATE = {
  "editor.formatOnSave": true,
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
};

/**
 * Service for deploying recommended VS Code settings to workspace
 */
export class RecommendedSettingsConfigDeployer {
  /**
   * Deploy VS Code settings to the target workspace root
   * NON-DESTRUCTIVE: Deep merges with existing settings, user values take priority
   * @param targetRoot Root directory of the workspace
   */
  async deployVscodeSettings(targetRoot: string): Promise<void> {
    const targetPath = path.join(targetRoot, ".vscode", "settings.json");
    const targetDir = path.dirname(targetPath);

    await fs.promises.mkdir(targetDir, { recursive: true });

    const templateSettings = SETTINGS_TEMPLATE;

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
}
