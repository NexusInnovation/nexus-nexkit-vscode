import * as vscode from "vscode";
import { ExtensionUpdateService } from "./extensionUpdateService";
import { getExtensionVersion } from "../../shared/utils/extensionHelper";
import { Commands } from "../../shared/constants/commands";

/**
 * Service for managing the Nexkit update status bar item (status bar to show update status)
 */
export class UpdateStatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private extensionUpdateService: ExtensionUpdateService;

  constructor(context: vscode.ExtensionContext, extensionUpdateService: ExtensionUpdateService) {
    this.extensionUpdateService = extensionUpdateService;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    // Register for disposal
    context.subscriptions.push(this.statusBarItem);
  }

  /**
   * Initialize the status bar with extension version and update status
   */
  async initializeUpdateStatusBar(): Promise<void> {
    try {
      const extensionVersion = getExtensionVersion() || "unknown";
      const extensionUpdateInfo = await this.extensionUpdateService.checkForExtensionUpdate();

      if (extensionUpdateInfo) {
        this.statusBarItem.text = `$(cloud-download) Nexkit v${extensionVersion}`;
        this.statusBarItem.tooltip = `Extension update available: ${extensionUpdateInfo.latestVersion}. Click to update.`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      } else {
        this.statusBarItem.text = `$(check) Nexkit v${extensionVersion}`;
        this.statusBarItem.tooltip = `Nexkit v${extensionVersion} is up to date. Click to check for updates.`;
        this.statusBarItem.backgroundColor = undefined;
      }
    } catch (error) {
      console.error("Error updating status bar:", error);
      this.statusBarItem.text = `$(warning) Nexkit`;
      this.statusBarItem.tooltip = "Error checking update status";
    } finally {
      this.statusBarItem.command = Commands.CHECK_EXTENSION_UPDATE;
      this.statusBarItem.show();
    }
  }
}
