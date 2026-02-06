import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { TelemetryService } from "../../shared/services/telemetryService";
import { OperationMode } from "../ai-template-files/models/aiTemplateFile";

/**
 * Service for prompting users to select an operation mode during workspace initialization
 */
export class ModeSelectionPromptService {
  constructor(private readonly telemetry?: TelemetryService) {}

  /**
   * Prompt user to select an operation mode
   * @returns The selected mode, or Developers as default
   */
  public async promptModeSelection(): Promise<OperationMode> {
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
      placeHolder: "Select Nexkit operation mode",
      ignoreFocusOut: false,
      title: "Workspace Initialization - Mode Selection",
    });

    // Return selected mode or default to Developers
    const selectedMode = (selected?.label as OperationMode) || OperationMode.Developers;

    // Track mode selection
    this.telemetry?.trackEvent("mode.selected", {
      mode: selectedMode,
      context: "initialization",
    });

    return selectedMode;
  }
}
