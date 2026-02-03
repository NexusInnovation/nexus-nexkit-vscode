import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service for prompting users to select an operation mode during workspace initialization
 */
export class ModeSelectionPromptService {
  /**
   * Prompt user to select an operation mode
   * @returns The selected mode, or "Developers" as default
   */
  public async promptModeSelection(): Promise<string> {
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
      placeHolder: "Select Nexkit operation mode",
      ignoreFocusOut: false,
      title: "Workspace Initialization - Mode Selection",
    });

    // Return selected mode or default to Developers
    return selected?.label || "Developers";
  }
}
