import * as vscode from "vscode";
import { TelemetryService } from "../../shared/services/telemetryService";
import { SettingsManager } from "../../core/settingsManager";
import { Commands } from "../../shared/constants/commands";
import { WebviewMessage } from "./types/webviewMessages";

/**
 * Handles all message processing and business logic for the Nexkit panel
 */
export class NexkitPanelMessageHandler {
  private readonly _messageHandlers: Map<string, (message: WebviewMessage) => Promise<void>>;

  constructor(
    private readonly getWebview: () => vscode.WebviewView | undefined,
    private readonly _telemetryService: TelemetryService
  ) {
    // Initialize message handler map
    this._messageHandlers = new Map([
      ["ready", this.handleReady.bind(this)],
      ["initProject", this.handleInitProject.bind(this)],
      ["openSettings", this.handleOpenSettings.bind(this)],
      ["installUserMCPs", this.handleInstallUserMCPs.bind(this)],
    ]);
  }

  /**
   * Main entry point for handling messages from the webview
   */
  public async handleMessage(message: WebviewMessage): Promise<void> {
    const handler = this._messageHandlers.get(message.command);
    if (handler) {
      await handler(message);
    } else {
      console.warn(`[Nexkit] Unknown command: ${message.command}`);
    }
  }

  /**
   * Message Handlers
   */

  private async handleReady(message: WebviewMessage): Promise<void> {
    // Webview is ready - send workspace state
    this.sendWorkspaceState();
  }

  private async handleInitProject(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("initProject");
    await vscode.commands.executeCommand(Commands.INIT_WORKSPACE);
    this.sendWorkspaceState();
  }

  private async handleOpenSettings(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("openSettings");
    await vscode.commands.executeCommand(Commands.OPEN_SETTINGS);
  }

  private async handleInstallUserMCPs(message: WebviewMessage): Promise<void> {
    this.trackWebviewAction("installUserMCPs");
    await vscode.commands.executeCommand(Commands.INSTALL_USER_MCPS);
  }

  /**
   * Helper Methods
   */

  /**
   * Track telemetry for webview actions
   */
  private trackWebviewAction(actionName: string): void {
    this._telemetryService.trackEvent("ui.button.clicked", {
      buttonName: actionName,
      source: "webview",
    });
  }

  /**
   * Send workspace state update to webview
   */
  public sendWorkspaceState(): void {
    const view = this.getWebview();
    if (!view) return;

    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const isInitialized = SettingsManager.isWorkspaceInitialized();

    view.webview.postMessage({
      command: "workspaceStateUpdate",
      hasWorkspace,
      isInitialized,
    });
  }
}
