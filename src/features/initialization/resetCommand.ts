import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { fileExists } from "../../shared/utils/fileHelper";
import { OperationMode } from "../ai-template-files/models/aiTemplateFile";

/**
 * Reset options that can be selected by the user
 */
interface ResetOption {
  id: string;
  label: string;
  description: string;
  detail?: string;
  requiresBackup?: boolean;
  picked?: boolean;
}

/**
 * Available reset options
 */
const RESET_OPTIONS: ResetOption[] = [
  {
    id: "workspaceInit",
    label: "Workspace Initialization Status",
    description: "Reset initialization flag, mode, and prompt dismissals",
    detail: "Workspace will appear as uninitialized and you'll need to select a mode",
    picked: true,
  },
  {
    id: "templateFiles",
    label: "All Template Files",
    description: "Remove .github template folders (agents, prompts, instructions, chatmodes)",
    detail: "Warning: This will delete all installed template files",
    requiresBackup: true,
    picked: true,
  },
  {
    id: "installedState",
    label: "Installed Templates State",
    description: "Clear tracking of which templates are installed",
    detail: "Webview will show no templates as installed",
    picked: true,
  },
  {
    id: "profiles",
    label: "Saved Profiles",
    description: "Delete all saved template profiles",
    detail: "All profiles will be permanently removed",
  },
  {
    id: "mcpConfig",
    label: "MCP Configuration",
    description: "Remove workspace MCP config and reset setup dismissal",
    detail: "Will remove .vscode/mcp.json and re-prompt for MCP setup",
  },
  {
    id: "devopsConnections",
    label: "DevOps Connections",
    description: "Clear all saved Azure DevOps connections",
    detail: "All DevOps connections will be removed",
  },
  {
    id: "configSections",
    label: "Nexkit Configuration Sections",
    description: "Remove Nexkit sections from .vscode files and .gitignore",
    detail: "Cleans up .vscode/settings.json, extensions.json, and .gitignore",
  },
  {
    id: "extensionState",
    label: "Extension Update Check State",
    description: "Reset last update check timestamp",
    detail: "Extension will check for updates immediately",
  },
];

/**
 * Register reset workspace command
 */
export function registerResetWorkspaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.RESET_WORKSPACE,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open. Please open a workspace first.");
        return;
      }

      // Show multi-select picker for reset options
      const selectedItems = await vscode.window.showQuickPick(
        RESET_OPTIONS.map((option) => ({
          ...option,
          picked: option.picked || false,
        })),
        {
          canPickMany: true,
          placeHolder: "Select what you want to reset",
          title: "Nexkit: Reset Workspace",
          ignoreFocusOut: true,
        }
      );

      if (!selectedItems || selectedItems.length === 0) {
        return; // User cancelled or selected nothing
      }

      const selectedIds = selectedItems.map((item) => item.id);
      const requiresBackup = selectedItems.some((item) => item.requiresBackup);

      // Confirm reset with warning
      const itemsList = selectedItems.map((item) => `  • ${item.label}`).join("\n");
      const confirmMessage = `You are about to reset the following:\n\n${itemsList}\n\nThis action cannot be undone${requiresBackup ? " (except via backup)" : ""}.`;

      let backupOption: string | undefined = "Reset";
      if (requiresBackup) {
        backupOption = await vscode.window.showWarningMessage(
          confirmMessage,
          { modal: true },
          "Reset with Backup",
          "Reset without Backup",
          "Cancel"
        );
      } else {
        backupOption = await vscode.window.showWarningMessage(confirmMessage, { modal: true }, "Reset", "Cancel");
      }

      if (!backupOption || backupOption === "Cancel") {
        return;
      }

      const createBackup = backupOption === "Reset with Backup";

      try {
        // Create backup if requested and template files are being reset
        let backupPath: string | null = null;
        if (createBackup && selectedIds.includes("templateFiles")) {
          backupPath = await services.backup.backupTemplates(workspaceFolder.uri.fsPath);
        }

        // Perform reset operations based on selections
        const resetResults = await performReset(selectedIds, workspaceFolder, services);

        // Build success message
        let message = "Reset completed successfully!";
        if (resetResults.length > 0) {
          message += `\n\nReset items:\n${resetResults.map((r) => `  • ${r}`).join("\n")}`;
        }
        if (backupPath) {
          message += `\n\nBackup created at: ${path.basename(backupPath)}`;
        }

        vscode.window.showInformationMessage(message);

        // Track reset event
        services.telemetry.trackEvent("workspace.reset", {
          options: selectedIds.join(","),
          withBackup: createBackup.toString(),
        });
      } catch (error) {
        console.error("Failed to reset workspace:", error);
        vscode.window.showErrorMessage(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
        services.telemetry.trackError(error instanceof Error ? error : new Error(String(error)), {
          context: "resetWorkspace",
        });
      }
    },
    services.telemetry
  );
}

/**
 * Perform reset operations based on selected options
 */
async function performReset(
  selectedIds: string[],
  workspaceFolder: vscode.WorkspaceFolder,
  services: ServiceContainer
): Promise<string[]> {
  const results: string[] = [];

  // Reset workspace initialization status
  if (selectedIds.includes("workspaceInit")) {
    await SettingsManager.setWorkspaceInitialized(false);
    await SettingsManager.setWorkspaceInitPromptDismissed(false);
    await SettingsManager.setLastAppliedProfile(null);
    await SettingsManager.setMode(OperationMode.None); // Reset mode to None (user must select)
    results.push("Workspace initialization status");
  }

  // Remove all template files
  if (selectedIds.includes("templateFiles")) {
    await services.backup.deleteTemplateFolders(workspaceFolder.uri.fsPath);
    results.push("All template files");
  }

  // Clear installed templates state
  if (selectedIds.includes("installedState")) {
    await services.installedTemplatesState.clearState();
    results.push("Installed templates state");
  }

  // Delete all profiles
  if (selectedIds.includes("profiles")) {
    const profiles = services.profileService.getProfiles();
    if (profiles.length > 0) {
      const profileNames = profiles.map((p) => p.name);
      await services.profileService.deleteProfiles(profileNames);
      results.push(`Saved profiles (${profiles.length})`);
    }
  }

  // Remove MCP configuration
  if (selectedIds.includes("mcpConfig")) {
    const mcpConfigPath = path.join(workspaceFolder.uri.fsPath, ".vscode", "mcp.json");
    if (await fileExists(mcpConfigPath)) {
      await fs.promises.unlink(mcpConfigPath);
    }
    await SettingsManager.setMcpSetupDismissed(false);
    results.push("MCP configuration");
  }

  // Clear DevOps connections
  if (selectedIds.includes("devopsConnections")) {
    const connections = SettingsManager.getDevOpsConnectionsList();
    if (connections.length > 0) {
      await SettingsManager.setDevOpsConnectionsList([]);
      await SettingsManager.setActiveDevOpsConnection(null);
      results.push(`DevOps connections (${connections.length})`);
    }
  }

  // Remove Nexkit configuration sections
  if (selectedIds.includes("configSections")) {
    await removeNexkitConfigSections(workspaceFolder.uri.fsPath);
    results.push("Nexkit configuration sections");
  }

  // Reset extension update check state
  if (selectedIds.includes("extensionState")) {
    await SettingsManager.setLastUpdateCheck(0);
    results.push("Extension update check state");
  }

  return results;
}

/**
 * Remove Nexkit-specific sections from configuration files
 */
async function removeNexkitConfigSections(workspaceRoot: string): Promise<void> {
  // Remove from .gitignore
  await removeNexkitFromGitignore(workspaceRoot);

  // Remove from .vscode/settings.json
  await removeNexkitFromVSCodeSettings(workspaceRoot);

  // Remove from .vscode/extensions.json
  await removeNexkitFromVSCodeExtensions(workspaceRoot);
}

/**
 * Remove Nexkit section from .gitignore
 */
async function removeNexkitFromGitignore(workspaceRoot: string): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  if (!(await fileExists(gitignorePath))) {
    return;
  }

  const content = await fs.promises.readFile(gitignorePath, "utf-8");
  const startMarker = "# --- BEGIN NEXKIT ---";
  const endMarker = "# --- END NEXKIT ---";

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1) {
    const before = content.substring(0, startIndex).trimEnd();
    const after = content.substring(endIndex + endMarker.length).trimStart();
    const newContent = before + (before && after ? "\n\n" : "") + after;
    await fs.promises.writeFile(gitignorePath, newContent, "utf-8");
  }
}

/**
 * Remove Nexkit settings from .vscode/settings.json
 */
async function removeNexkitFromVSCodeSettings(workspaceRoot: string): Promise<void> {
  const settingsPath = path.join(workspaceRoot, ".vscode", "settings.json");
  if (!(await fileExists(settingsPath))) {
    return;
  }

  try {
    const content = await fs.promises.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    // Remove Nexkit-specific settings (add more as needed)
    const nexkitKeys = Object.keys(settings).filter(
      (key) =>
        key.startsWith("github.copilot.chat.mode") ||
        key.startsWith("github.copilot.chat.codeGeneration.instructions") ||
        key === "github.copilot.chat.useProjectTemplates"
    );

    if (nexkitKeys.length > 0) {
      nexkitKeys.forEach((key) => delete settings[key]);
      await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    }
  } catch (error) {
    console.warn("Failed to remove Nexkit settings from .vscode/settings.json:", error);
  }
}

/**
 * Remove Nexkit extensions from .vscode/extensions.json
 */
async function removeNexkitFromVSCodeExtensions(workspaceRoot: string): Promise<void> {
  const extensionsPath = path.join(workspaceRoot, ".vscode", "extensions.json");
  if (!(await fileExists(extensionsPath))) {
    return;
  }

  try {
    const content = await fs.promises.readFile(extensionsPath, "utf-8");
    const extensions = JSON.parse(content);

    // Remove Nexkit-managed extensions (if any)
    // Currently Nexkit doesn't add specific extensions, but keeping for future use
    if (extensions.recommendations) {
      // Filter out any Nexkit-specific extension recommendations if needed
      // For now, we'll leave extensions.json as is since Nexkit merges recommendations
    }
  } catch (error) {
    console.warn("Failed to process .vscode/extensions.json:", error);
  }
}
