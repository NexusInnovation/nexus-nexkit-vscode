import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";

export type ConfirmationResult = "accepted" | "refused" | "refused-forever";

/**
 * Service that presents a three-choice confirmation dialog before any configuration write.
 * Choices: Accept / Refuse / Refuse Forever (this workspace).
 * "Refuse Forever" is persisted in workspaceState via SettingsManager and respected on all
 * subsequent activations.
 */
export class ConfirmationService {
  /**
   * Show a modal confirmation dialog before a potentially disruptive configuration change.
   *
   * @param message Short title shown in the dialog header.
   * @param detail  Longer description of what Nexkit is about to do.
   * @param workspaceStateKey  Key used to persist the "refused forever" flag in workspaceState.
   *                           Use one of {@link SettingsManager.CONFIRMATION_KEYS}.
   * @returns The user's choice.
   */
  public async confirm(message: string, detail: string, workspaceStateKey: string): Promise<ConfirmationResult> {
    if (SettingsManager.isConfirmationRefusedForever(workspaceStateKey)) {
      return "refused-forever";
    }

    const result = await vscode.window.showInformationMessage(message, { detail, modal: true }, "Accept", "Refuse", "Refuse Forever (this workspace)");

    if (result === "Refuse Forever (this workspace)") {
      await SettingsManager.setConfirmationRefusedForever(workspaceStateKey, true);
      return "refused-forever";
    }

    if (result === "Refuse") {
      return "refused";
    }

    return "accepted";
  }

  /**
   * Show a modal confirmation that is deliberately never remembered.
   *
   * Use for consequential, one-off actions — installing software, for example —
   * where a persisted "refuse forever" would silently suppress a decision the
   * user must make each time.
   *
   * @param message Short title shown in the dialog header.
   * @param detail  Longer description of what Nexkit is about to do.
   * @returns True when the user explicitly accepted.
   */
  public async confirmOnce(message: string, detail: string): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(message, { detail, modal: true }, "Continue");
    return result === "Continue";
  }
}
