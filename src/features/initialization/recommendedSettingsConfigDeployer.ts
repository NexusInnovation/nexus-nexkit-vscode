import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { fileExists } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";
import { SettingsManager } from "../../core/settingsManager";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";

const CHAT_LOCATION_SETTINGS: Record<string, string> = {
  "chat.agentFilesLocations": "agents",
  "chat.agentSkillsLocations": "skills",
  "chat.hookFilesLocations": "hooks",
  "chat.instructionsFilesLocations": "instructions",
  "chat.promptFilesLocations": "prompts",
};

const LEGACY_WORKSPACE_KEYS = [
  "chat.agentFilesLocations",
  "chat.agentSkillsLocations",
  "chat.hookFilesLocations",
  "chat.instructionsFilesLocations",
  "chat.promptFilesLocations",
  "chat.useHooks",
];

/**
 * Service for deploying recommended VS Code settings at user-global scope
 */
export class RecommendedSettingsConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  constructor(private readonly _userDirectory: UserDirectoryService = new UserDirectoryService()) {}

  /**
   * Deploy chat location settings to user-level VS Code configuration.
   * NON-DESTRUCTIVE: Merges NexKit paths with existing user entries — never overwrites.
   * Also cleans up legacy workspace-level settings previously created by NexKit.
   */
  async deployVscodeSettings(workspaceRoot: string): Promise<void> {
    this._logging.info("Deploying chat settings to user-level configuration...");

    await this._userDirectory.ensureUserDirectoryStructure(workspaceRoot);

    await this._deployUserLevelChatSettings(workspaceRoot);
    await this._cleanupWorkspaceSettings(workspaceRoot);

    this._logging.info("Chat settings deployed to user-level configuration successfully.");
  }

  /**
   * Write/merge user-level chat file location settings.
   */
  private async _deployUserLevelChatSettings(workspaceRoot: string): Promise<void> {
    const projectLocations = this._userDirectory.getAbsoluteTemplateLocations(workspaceRoot);
    const globalLocations = this._userDirectory.getAbsoluteGlobalTemplateLocations();
    const chatConfig = vscode.workspace.getConfiguration("chat");
    const workspaceOverrideActive = SettingsManager.isWorkspaceOverrideActive();

    for (const [settingKey, subdir] of Object.entries(CHAT_LOCATION_SETTINGS)) {
      const projectTildePath = this._toTildePath(projectLocations[subdir]);
      const globalTildePath = this._toTildePath(globalLocations[subdir]);
      const shortKey = settingKey.replace("chat.", "");

      const existing: Record<string, boolean> | undefined = chatConfig.inspect<Record<string, boolean>>(shortKey)?.globalValue;
      const merged: Record<string, boolean> = { ...existing, [globalTildePath]: true, [projectTildePath]: true };

      if (workspaceOverrideActive) {
        merged[`.nexkit/${subdir}`] = true;
      }

      await chatConfig.update(shortKey, merged, vscode.ConfigurationTarget.Global);
      this._logging.debug(
        `Set user-level ${settingKey}: added ${globalTildePath} + ${projectTildePath}${workspaceOverrideActive ? " + workspace path" : ""}`
      );
    }

    const useHooksInspect = chatConfig.inspect<boolean>("useHooks");
    if (useHooksInspect?.globalValue !== true) {
      await chatConfig.update("useHooks", true, vscode.ConfigurationTarget.Global);
      this._logging.debug("Set user-level chat.useHooks: true");
    }
  }

  /**
   * Remove NexKit-managed legacy entries from workspace .vscode/settings.json.
   */
  private async _cleanupWorkspaceSettings(workspaceRoot: string): Promise<void> {
    const settingsPath = path.join(workspaceRoot, ".vscode", "settings.json");

    if (!(await fileExists(settingsPath))) {
      return;
    }

    try {
      const content = await fs.promises.readFile(settingsPath, "utf8");
      const settings = JSON.parse(content);
      let modified = false;

      for (const key of LEGACY_WORKSPACE_KEYS) {
        if (!(key in settings)) {
          continue;
        }

        if (typeof settings[key] === "object" && settings[key] !== null && !Array.isArray(settings[key])) {
          const locationObj = settings[key] as Record<string, boolean>;
          for (const pathKey of Object.keys(locationObj)) {
            if (this._isNexkitManagedPath(pathKey)) {
              delete locationObj[pathKey];
              modified = true;
            }
          }

          if (Object.keys(locationObj).length === 0) {
            delete settings[key];
            modified = true;
          }
        } else if (key === "chat.useHooks") {
          delete settings[key];
          modified = true;
        }
      }

      if (!modified) {
        return;
      }

      const remainingKeys = Object.keys(settings);
      if (remainingKeys.length === 0) {
        await fs.promises.unlink(settingsPath);
        this._logging.info("Removed empty .vscode/settings.json after NexKit cleanup.");

        const vscodeDir = path.join(workspaceRoot, ".vscode");
        try {
          const entries = await fs.promises.readdir(vscodeDir);
          if (entries.length === 0) {
            await fs.promises.rmdir(vscodeDir);
          }
        } catch {
          // ignore
        }
      } else {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
        this._logging.info("Cleaned up NexKit entries from .vscode/settings.json.");
      }
    } catch (error) {
      this._logging.warn("Could not clean up workspace settings.json.", error);
    }
  }

  /**
   * Check whether a path is a NexKit-managed legacy entry.
   */
  private _isNexkitManagedPath(pathKey: string): boolean {
    return pathKey.startsWith(".nexkit/") || pathKey.includes("/.nexkit/") || pathKey.includes("\\.nexkit\\");
  }

  /**
   * Convert absolute path to ~/ path with forward slashes.
   */
  private _toTildePath(absolutePath: string): string {
    const homeDir = os.homedir().replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");

    if (normalized.startsWith(homeDir)) {
      return `~${normalized.slice(homeDir.length)}`;
    }

    this._logging.warn(`Path is not under home directory; keeping absolute path: ${absolutePath}`);
    return normalized;
  }
}
