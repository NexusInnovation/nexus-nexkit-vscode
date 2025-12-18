import * as vscode from "vscode";

/**
 * Centralized manager for all Nexkit extension settings and workspace state
 */
export class SettingsManager {
  private static context: vscode.ExtensionContext;

  private static readonly NEXKIT_SECTION = "nexkit";
  private static readonly TELEMETRY_SECTION = "telemetry";

  // Workspace state keys
  private static readonly WORKSPACE_INITIALIZED_KEY = "workspaceInitialized";
  private static readonly WORKSPACE_INIT_PROMPT_DISMISSED_KEY = "workspaceInitPromptDismissed";

  // Workspace settings
  private static readonly WORKSPACE_MCP_SERVERS = "workspace.mcpServers";

  // MCP Setup settings
  private static readonly MCP_SETUP_DISMISSED = "mcpSetup.dismissed";

  // Repository settings
  private static readonly REPOSITORIES = "workspace.repositories";

  // Telemetry settings
  private static readonly TELEMETRY_ENABLED = "telemetry.enabled";
  private static readonly TELEMETRY_CONNECTION_STRING = "telemetry.connectionString";
  private static readonly TELEMETRY_LEVEL = "telemetryLevel";

  // Extension update settings
  private static readonly EXTENSION_AUTO_CHECK_UPDATES = "extension.autoCheckUpdates";
  private static readonly EXTENSION_UPDATE_CHECK_INTERVAL = "extension.updateCheckInterval";
  private static readonly EXTENSION_LAST_UPDATE_CHECK = "extension.lastUpdateCheck";

  /**
   * Initialize the SettingsManager with the extension context
   * Must be called during extension activation
   */
  static initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  // Workspace Initialization (using workspace state)
  static isWorkspaceInitialized(): boolean {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.workspaceState.get<boolean>(this.WORKSPACE_INITIALIZED_KEY, false);
  }

  static async setWorkspaceInitialized(value: boolean): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(this.WORKSPACE_INITIALIZED_KEY, value);
  }

  // Workspace Initialization Prompt (using workspace state)
  static isWorkspaceInitPromptDismissed(): boolean {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.workspaceState.get<boolean>(this.WORKSPACE_INIT_PROMPT_DISMISSED_KEY, false);
  }

  static async setWorkspaceInitPromptDismissed(value: boolean): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(this.WORKSPACE_INIT_PROMPT_DISMISSED_KEY, value);
  }

  // MCP Setup
  static isMcpSetupDismissed(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.MCP_SETUP_DISMISSED, false);
  }

  static async setMcpSetupDismissed(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .update(this.MCP_SETUP_DISMISSED, value, vscode.ConfigurationTarget.Global);
  }

  // Repositories
  static getRepositories<T = any>(): T[] {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<T[]>(this.REPOSITORIES, []);
  }

  static async setRepositories<T = any>(
    repositories: T[],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.REPOSITORIES, repositories, target);
  }

  // Telemetry
  static isNexkitTelemetryEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.TELEMETRY_ENABLED, true);
  }

  static getVSCodeTelemetryLevel(): string {
    return vscode.workspace.getConfiguration(this.TELEMETRY_SECTION).get<string>(this.TELEMETRY_LEVEL, "all");
  }

  static getTelemetryConnectionString(): string | undefined {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string>(this.TELEMETRY_CONNECTION_STRING);
  }

  // Extension Updates
  static isAutoCheckUpdatesEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.EXTENSION_AUTO_CHECK_UPDATES, true);
  }

  static getUpdateCheckIntervalHours(): number {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<number>(this.EXTENSION_UPDATE_CHECK_INTERVAL, 24);
  }

  static getLastUpdateCheck(): number {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<number>(this.EXTENSION_LAST_UPDATE_CHECK, 0);
  }

  static async setLastUpdateCheck(timestamp: number): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .update(this.EXTENSION_LAST_UPDATE_CHECK, timestamp, vscode.ConfigurationTarget.Global);
  }
}
