import * as fs from "fs";
import * as path from "path";
import { checkFileExists, deepMerge } from "../helpers/fileSystemHelper";

/**
 * Service for managing VS Code settings
 */
export class VscodeSettingsService {
  /**
   * Deploy VS Code settings
   * NON-DESTRUCTIVE: Deep merges with existing settings, user values take priority
   */
  async deployVscodeSettings(
    templateSettings: string,
    targetRoot: string
  ): Promise<void> {
    const settingsPath = path.join(targetRoot, ".vscode", "settings.json");
    const settingsDir = path.dirname(settingsPath);

    await fs.promises.mkdir(settingsDir, { recursive: true });

    // Parse template settings
    let settings = JSON.parse(templateSettings);

    // Merge with existing settings if they exist (user settings take priority)
    if (await checkFileExists(settingsPath)) {
      const existingContent = await fs.promises.readFile(settingsPath, "utf8");
      try {
        const existingSettings = JSON.parse(existingContent);
        // Deep merge: template as base, user settings override
        settings = deepMerge(settings, existingSettings);
      } catch (error) {
        // If existing settings are invalid JSON, log warning but preserve template
        console.warn(
          "Existing .vscode/settings.json is invalid JSON. Using template settings.",
          error
        );
      }
    }

    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      "utf8"
    );
  }
}
