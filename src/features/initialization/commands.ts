import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { SettingsManager } from "../../core/settingsManager";
import { registerCommand } from "../../shared/commands/commandRegistry";
import { Commands } from "../../shared/constants/commands";
import { ProfileSelectionPromptService } from "./profileSelectionPromptService";
import { OperationMode } from "../ai-template-files/models/aiTemplateFile";

/**
 * Register initialization-related commands
 */
export function registerInitializeWorkspaceCommand(context: vscode.ExtensionContext, services: ServiceContainer): void {
  // Initialize Project command
  registerCommand(
    context,
    Commands.INIT_WORKSPACE,
    async () => {
      services.logging.info("Starting workspace initialization...");

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        services.logging.warn("Workspace initialization failed: No workspace folder open");
        vscode.window.showErrorMessage("No workspace folder open. Please open a workspace first.");
        return;
      }

      services.logging.info(`Initializing workspace: ${workspaceFolder.uri.fsPath}`);

      // Check if already initialized
      const isInitialized = SettingsManager.isWorkspaceInitialized();
      if (isInitialized) {
        services.logging.info("Workspace already initialized, prompting for confirmation...");
        const result = await vscode.window.showWarningMessage(
          "Workspace already initialized with Nexkit. This will run the initialization wizard again and reconfigure your Nexkit settings. Continue?",
          "Yes",
          "No"
        );
        if (result !== "Yes") {
          services.logging.info("Workspace re-initialization cancelled by user");
          return;
        }
      }

      // Prompt user to select mode
      services.logging.info("Prompting user to select operation mode...");
      const selectedMode = await services.modeSelectionPrompt.promptModeSelection();
      await SettingsManager.setMode(selectedMode);
      services.logging.info(`Selected mode: ${selectedMode}`);

      // Prompt user to select a profile if any are saved
      const selectedProfileName = await new ProfileSelectionPromptService(services.profileService).promptProfileSelection();

      services.logging.info("Running workspace initialization...");
      const { deploymentSummary, backupPath } = await services.workspaceInitialization.initializeWorkspace(
        workspaceFolder,
        selectedProfileName,
        services
      );

      services.logging.info("Workspace initialization completed successfully", {
        installedTemplates: deploymentSummary?.installed ?? 0,
        backupPath,
      });

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
          label: OperationMode.Developers,
          description: "Full feature set",
          detail: "Access to Actions, Profiles, Templates, Repositories, and Footer sections",
          picked: currentMode === OperationMode.Developers,
        },
        {
          label: OperationMode.APM,
          description: "Essential features only",
          detail: "Access to Footer section only",
          picked: currentMode === OperationMode.APM,
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
      await SettingsManager.setMode(selected.label as OperationMode);

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
