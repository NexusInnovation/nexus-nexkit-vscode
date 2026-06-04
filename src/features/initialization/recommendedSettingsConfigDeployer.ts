import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";
import { ConfirmationService } from "../../shared/services/confirmationService";
import { UserDirectoryService } from "../ai-template-files/services/userDirectoryService";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Mapping from VS Code chat setting keys to UserDirectoryService subdirectory names.
 */
const CHAT_LOCATION_SETTINGS: Record<string, string> = {
  "chat.agentFilesLocations": "agents",
  "chat.agentSkillsLocations": "skills",
  "chat.hookFilesLocations": "hooks",
  "chat.instructionsFilesLocations": "instructions",
  "chat.promptFilesLocations": "prompts",
};

/**
 * Old relative-path entries previously written to .vscode/settings.json by NexKit.
 * Used for cleanup of workspace-level leftovers.
 */
const LEGACY_WORKSPACE_KEYS = [
  "chat.agentFilesLocations",
  "chat.agentSkillsLocations",
  "chat.hookFilesLocations",
  "chat.instructionsFilesLocations",
  "chat.promptFilesLocations",
  "chat.useHooks",
];

/**
 * Service for deploying recommended VS Code chat settings to user-level (global) scope.
 * Uses ~/ relative paths from UserDirectoryService (VS Code requires relative or ~/ paths).
 */
export class RecommendedSettingsConfigDeployer {
  private readonly _logging = LoggingService.getInstance();

  constructor(
    private readonly _userDirectory: UserDirectoryService,
    private readonly _confirmation: ConfirmationService
  ) {}

  /**
   * Deploy chat location settings to user-level VS Code configuration.
   * NON-DESTRUCTIVE: Merges NexKit paths with existing user entries — never overwrites.
   * Also cleans up legacy workspace-level settings previously created by NexKit.
   * When workspace override is active, adds both user-level and workspace-level paths.
   * Prompts the user for confirmation before writing any settings; skips if refused.
   * @param workspaceRoot Root directory of the workspace (used for legacy cleanup and workspace paths)
   */
  async deployVscodeSettings(workspaceRoot: string): Promise<void> {
    const result = await this._confirmation.confirm(
      "Nexkit wants to update your VS Code chat settings",
      "Nexkit will update your VS Code chat settings (chat.*Locations) to point to your user-level template directory. This allows GitHub Copilot to find your agents, prompts, instructions, and hooks.",
      SettingsManager.CONFIRMATION_KEYS.CHAT_SETTINGS
    );

    if (result !== "accepted") {
      this._logging.info("User declined chat settings deployment.");
      return;
    }

    this._logging.info("Deploying chat settings to user-level configuration...");

    await this._deployUserLevelChatSettings(workspaceRoot);
    await this._cleanupWorkspaceSettings(workspaceRoot);

    this._logging.info("Chat settings deployed to user-level configuration successfully.");
  }

  /**
   * Write chat.*Locations settings to ConfigurationTarget.Global using ~/relative paths
   * from UserDirectoryService. Merges with any existing user entries.
   * VS Code requires chat.*Locations paths to be relative to the workspace or start with ~/.
   * When workspace override is active, also includes workspace .nexkit/ paths (relative).
   */
  private async _deployUserLevelChatSettings(workspaceRoot: string): Promise<void> {
    const locations = this._userDirectory.getAbsoluteTemplateLocations();
    const chatConfig = vscode.workspace.getConfiguration("chat");
    const workspaceOverrideActive = SettingsManager.isWorkspaceOverrideActive();

    for (const [settingKey, subdir] of Object.entries(CHAT_LOCATION_SETTINGS)) {
      const tildePath = this._toTildePath(locations[subdir]);
      // Suffix key removes the "chat." prefix for the update call
      const shortKey = settingKey.replace("chat.", "");

      // Read existing user-level value (merge, don't overwrite)
      const existing: Record<string, boolean> | undefined = chatConfig.inspect<Record<string, boolean>>(shortKey)?.globalValue;
      const merged: Record<string, boolean> = { ...existing, [tildePath]: true };

      // When workspace override is active, also add workspace .nexkit/ paths (relative)
      if (workspaceOverrideActive) {
        const workspaceRelativePath = `.nexkit/${subdir}`;
        merged[workspaceRelativePath] = true;
      }

      await chatConfig.update(shortKey, merged, vscode.ConfigurationTarget.Global);
      this._logging.debug(
        `Set user-level ${settingKey}: added ${tildePath}${workspaceOverrideActive ? ` + workspace path` : ""}`
      );
    }

    // Ensure chat.useHooks is enabled at user-level
    const useHooksInspect = chatConfig.inspect<boolean>("useHooks");
    if (useHooksInspect?.globalValue !== true) {
      await chatConfig.update("useHooks", true, vscode.ConfigurationTarget.Global);
      this._logging.debug("Set user-level chat.useHooks: true");
    }
  }

  /**
   * Remove NexKit-created entries from .vscode/settings.json (workspace scope).
   * Only removes keys that NexKit previously managed — leaves all other workspace settings intact.
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
        if (key in settings) {
          // For location objects, remove only .nexkit/* entries (preserve user's custom paths)
          if (typeof settings[key] === "object" && settings[key] !== null && !Array.isArray(settings[key])) {
            const locationObj = settings[key] as Record<string, boolean>;
            for (const pathKey of Object.keys(locationObj)) {
              if (this._isNexkitManagedPath(pathKey)) {
                delete locationObj[pathKey];
                modified = true;
              }
            }
            // Remove the entire key if no entries remain
            if (Object.keys(locationObj).length === 0) {
              delete settings[key];
              modified = true;
            }
          } else if (key === "chat.useHooks") {
            // Remove the boolean setting entirely from workspace — it's now user-level
            delete settings[key];
            modified = true;
          }
        }
      }

      if (modified) {
        const remainingKeys = Object.keys(settings);
        if (remainingKeys.length === 0) {
          // If the settings file is now empty, remove it
          await fs.promises.unlink(settingsPath);
          this._logging.info("Removed empty .vscode/settings.json after NexKit cleanup.");

          // Remove .vscode dir if empty
          const vscodeDir = path.join(workspaceRoot, ".vscode");
          try {
            const entries = await fs.promises.readdir(vscodeDir);
            if (entries.length === 0) {
              await fs.promises.rmdir(vscodeDir);
            }
          } catch {
            // Ignore — directory may have other files
          }
        } else {
          await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
          this._logging.info("Cleaned up NexKit entries from .vscode/settings.json.");
        }
      }
    } catch (error) {
      this._logging.warn("Could not clean up workspace settings.json.", error);
    }
  }

  /**
   * Check whether a path is a NexKit-managed entry that should be cleaned up.
   * Detects both legacy relative paths (.nexkit/) and absolute paths containing .nexkit/.
   */
  private _isNexkitManagedPath(pathKey: string): boolean {
    return pathKey.startsWith(".nexkit/") || pathKey.includes("/.nexkit/");
  }

  /**
   * Convert an absolute path to a ~/ relative path with forward slashes.
   * VS Code chat.*Locations require paths to be relative or start with ~/.
   */
  private _toTildePath(absolutePath: string): string {
    const homeDir = os.homedir().replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");

    if (normalized.startsWith(homeDir)) {
      return "~" + normalized.slice(homeDir.length);
    }

    // Fallback: return forward-slashed path if not under home directory
    return normalized;
  }
}
