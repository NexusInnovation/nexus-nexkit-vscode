import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { ProfileSelectionPromptService } from "./profileSelectionPromptService";

/**
 * Register initialization-related commands
 */
export function registerInitializeWorkspaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  // Initialize Project command
  registerCommand(
    context,
    Commands.INIT_WORKSPACE,
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open. Please open a workspace first.");
        return;
      }

      // Check if already initialized
      const isInitialized = SettingsManager.isWorkspaceInitialized();
      if (isInitialized) {
        const result = await vscode.window.showWarningMessage(
          "Workspace already initialized with Nexkit. This will run the initialization wizard again and reconfigure your Nexkit settings. Continue?",
          "Yes",
          "No"
        );
        if (result !== "Yes") {
          return;
        }
      }

      // Prompt user to select mode
      const selectedMode = await services.modeSelectionPrompt.promptModeSelection();
      await SettingsManager.setMode(selectedMode);

      // Prompt user to select a profile if any are saved
      const selectedProfileName = await new ProfileSelectionPromptService(services.profileService).promptProfileSelection();

      const { deploymentSummary, backupPath } = await services.workspaceInitialization.initializeWorkspace(
        workspaceFolder,
        selectedProfileName,
        services
      );

      // Show success message with deployment summary
      let resultMessage = "Nexkit project initialized successfully!";

      if (deploymentSummary !== null && deploymentSummary.installed > 0) {
        resultMessage += ` Installed ${deploymentSummary.installed} templates.`;
      }

      if (backupPath) {
        resultMessage += ` Backed up existing templates to: ${backupPath}.`;
      }

      vscode.window.showInformationMessage(`${resultMessage}`);
    },
    services.telemetry
  );
}

/**
 * Register mode switching command
 */
export function registerSwitchModeCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  registerCommand(
    context,
    Commands.SWITCH_MODE,
    async () => {
      const currentMode = SettingsManager.getMode();

      // Build quick pick items
      const modes: vscode.QuickPickItem[] = [
        {
          label: "Developers",
          description: "Full feature set",
          detail: "Access to Actions, Profiles, Templates, Repositories, and Footer sections",
          picked: currentMode === "Developers",
        },
        {
          label: "APM",
          description: "Essential features only",
          detail: "Access to Footer section only",
          picked: currentMode === "APM",
        },
      ];

      // Show quick pick
      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: `Current mode: ${currentMode}. Select a new mode`,
        title: "Switch Nexkit Operation Mode",
      });

      // User cancelled
      if (!selected) {
        return;
      }

      // No change
      if (selected.label === currentMode) {
        vscode.window.showInformationMessage(`Already in ${currentMode} mode`);
        return;
      }

      // Update mode
      await SettingsManager.setMode(selected.label);

      // Track mode switch with transition
      services.telemetry.trackEvent("mode.switched", {
        fromMode: currentMode,
        toMode: selected.label,
      });

      vscode.window.showInformationMessage(`Switched to ${selected.label} mode`);
    },
    services.telemetry
  );
}
