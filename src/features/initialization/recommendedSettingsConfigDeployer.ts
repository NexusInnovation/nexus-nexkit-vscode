import * as vscode from "vscode";
import * as path from "path";
import { getNexkitUserDirectory } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Service for deploying recommended VS Code settings to workspace
 */
export class RecommendedSettingsConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  private getSettingsTemplate(): Record<string, boolean | Record<string, boolean>> {
    const nexkitDir = getNexkitUserDirectory(vscode.env.appName);
    return {
      "chat.agentFilesLocations": {
        [path.join(nexkitDir, "agents")]: true,
      },
      "chat.agentSkillsLocations": {
        [path.join(nexkitDir, "skills")]: true,
      },
      "chat.hookFilesLocations": {
        [path.join(nexkitDir, "hooks")]: true,
      },
      "chat.instructionsFilesLocations": {
        [path.join(nexkitDir, "instructions")]: true,
      },
      "chat.promptFilesLocations": {
        [path.join(nexkitDir, "prompts")]: true,
      },
      "chat.useHooks": true,
    };
  }

  /**
   * Deploy VS Code settings at user-global scope
   * NON-DESTRUCTIVE: merges with existing user settings, existing values keep priority
   */
  async deployVscodeSettings(_targetRoot: string): Promise<void> {
    const templateSettings = this.getSettingsTemplate();

    this._logging.info("Deploying VS Code settings...");

    const config = vscode.workspace.getConfiguration();

    for (const [key, value] of Object.entries(templateSettings)) {
      if (typeof value === "boolean") {
        const existing = config.get<boolean>(key, value);
        await config.update(key, existing, vscode.ConfigurationTarget.Global);
        continue;
      }

      const existingLocations = config.get<Record<string, boolean>>(key, {});
      const mergedLocations = { ...value, ...existingLocations };
      await config.update(key, mergedLocations, vscode.ConfigurationTarget.Global);
    }

    this._logging.info("VS Code global settings deployed successfully.");
  }
}
