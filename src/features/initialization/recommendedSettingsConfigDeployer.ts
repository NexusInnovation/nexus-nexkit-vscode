import * as fs from "fs";
import * as path from "path";
import { fileExists, deepMerge } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Template for VS Code workspace settings
 */
const SETTINGS_TEMPLATE = {
  "editor.formatOnSave": true,
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "chat.promptFilesLocations": {
    ".nexkit/prompts": true,
  },
  "chat.instructionsFilesLocations": {
    ".nexkit/instructions": true,
    ".nexkit/skills": true,
  },
  "chat.agentFilesLocations": {
    ".nexkit/agents": true,
  },
  "chat.hooksFilesLocations": {
    ".nexkit/hooks": true,
  },
  "chat.useHooks": true,
};

/**
 * Service for deploying recommended VS Code settings to workspace
 */
export class RecommendedSettingsConfigDeployer {
  private readonly _logging = LoggingService.getInstance();
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

    this._logging.info("Deploying VS Code settings...");

    // Merge with existing settings if they exist (user settings take priority)
    let settings = templateSettings;
    if (await fileExists(targetPath)) {
      const existingContent = await fs.promises.readFile(targetPath, "utf8");
      try {
        const existingSettings = JSON.parse(existingContent);
        // Deep merge: template as base, user settings override
        settings = deepMerge(templateSettings, existingSettings);
        this._logging.info("Merged existing settings with template settings.");
      } catch (error) {
        // If existing settings are invalid JSON, log warning but use template
        this._logging.warn("Existing .vscode/settings.json is invalid JSON. Using template settings.", error);
      }
    }

    await fs.promises.writeFile(targetPath, JSON.stringify(settings, null, 2), "utf8");
    this._logging.info("VS Code settings deployed successfully.");
  }
}
