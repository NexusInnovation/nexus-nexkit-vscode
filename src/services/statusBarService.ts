import * as vscode from 'vscode';
import { ExtensionUpdateManager } from '../extensionUpdateManager';

/**
 * Service for managing the Nexkit status bar item
 */
export class StatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private extensionUpdateManager: ExtensionUpdateManager;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'nexus-nexkit-vscode.checkExtensionUpdate';
    this.extensionUpdateManager = new ExtensionUpdateManager();
    
    // Register for disposal
    context.subscriptions.push(this.statusBarItem);
  }

  /**
   * Update the status bar with extension version and update status
   */
  async updateStatusBar(): Promise<void> {
    try {
      const extensionVersion =
        vscode.extensions.getExtension('nexusinno.nexus-nexkit-vscode')
          ?.packageJSON.version || '0.0.0';
      const extensionUpdateInfo =
        await this.extensionUpdateManager.checkForExtensionUpdate();

      if (extensionUpdateInfo) {
        this.statusBarItem.text = `$(cloud-download) Nexkit v${extensionVersion}`;
        this.statusBarItem.tooltip = `Extension update available: ${extensionUpdateInfo.latestVersion}. Click to update.`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        this.statusBarItem.command = 'nexus-nexkit-vscode.checkExtensionUpdate';
      } else {
        this.statusBarItem.text = `$(check) Nexkit v${extensionVersion}`;
        this.statusBarItem.tooltip = `Nexkit v${extensionVersion} is up to date. Click to check for updates.`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = 'nexus-nexkit-vscode.checkExtensionUpdate';
      }

      this.statusBarItem.show();
    } catch (error) {
      console.error('Error updating status bar:', error);
      this.statusBarItem.text = `$(warning) Nexkit`;
      this.statusBarItem.tooltip = 'Error checking update status';
      this.statusBarItem.command = 'nexus-nexkit-vscode.checkExtensionUpdate';
      this.statusBarItem.show();
    }
  }

  /**
   * Get the status bar item (if needed for external updates)
   */
  getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }
}
