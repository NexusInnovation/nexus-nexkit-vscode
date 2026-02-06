import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Service for prompting users to select their preferred mode (APM or Developer)
 * on first-time extension activation
 */
export class ModeSelectionService {
  /**
   * Prompt user to select between APM Mode and Developer Mode
   * @returns The selected mode, or null if user dismissed the prompt
   */
  public async promptModeSelection(): Promise<"APM" | "Developer" | null> {
    const options: vscode.QuickPickItem[] = [
      {
        label: "$(briefcase) APM Mode",
        description: "Application Performance Management",
        detail:
          "Optimized templates and settings for APM workflows. Best for monitoring, observability, and performance analysis.",
      },
      {
        label: "$(code) Developer Mode",
        description: "Comprehensive Development Tools",
        detail: "Full suite of development tools and templates. Best for software development and coding workflows.",
      },
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: "Choose your preferred mode for Nexkit",
      ignoreFocusOut: true,
      title: "Welcome to Nexkit!",
    });

    if (!selected) {
      return null;
    }

    // Extract the mode from the label (remove the icon and "Mode" text)
    if (selected.label.includes("APM")) {
      return "APM";
    } else if (selected.label.includes("Developer")) {
      return "Developer";
    }

    return null;
  }

  /**
   * Check if user has selected a mode, and prompt if not
   * @returns The user's mode, or null if they dismissed the prompt
   */
  public async ensureModeSelected(): Promise<"APM" | "Developer" | null> {
    const currentMode = SettingsManager.getUserMode();

    // If mode is already set, return it
    if (currentMode !== "notset") {
      return currentMode as "APM" | "Developer";
    }

    // Check if this is first time user
    const isFirstTime = SettingsManager.isFirstTimeUser();
    if (!isFirstTime) {
      // User has used extension before but mode is not set
      // Don't prompt again, just use Developer mode as default
      return "Developer";
    }

    // Prompt for mode selection
    const selectedMode = await this.promptModeSelection();

    if (selectedMode) {
      // Save the selected mode
      await SettingsManager.setUserMode(selectedMode);
      // Mark user as no longer first-time
      await SettingsManager.setFirstTimeUser(false);

      // Show confirmation message
      vscode.window.showInformationMessage(
        `Nexkit configured in ${selectedMode} Mode. You can change this in settings anytime.`
      );
    } else {
      // User dismissed prompt, mark as no longer first-time but keep mode as notset
      await SettingsManager.setFirstTimeUser(false);
    }

    return selectedMode;
  }

  /**
   * Apply mode-specific configurations
   * This can be extended to apply different settings based on the mode
   */
  public async applyModeConfiguration(mode: "APM" | "Developer"): Promise<void> {
    // Currently, both modes use the same configuration
    // This method is a placeholder for future mode-specific customizations
    console.log(`Applying ${mode} mode configuration...`);

    // Future enhancements could include:
    // - Different default repositories based on mode
    // - Different template sets
    // - Mode-specific settings
  }
}
