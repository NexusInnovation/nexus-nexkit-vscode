import * as vscode from "vscode";

/**
 * Centralized manager for all Nexkit extension settings
 */
export class SettingsManager {
  private static readonly NEXKIT_SECTION = "nexkit";
  private static readonly TELEMETRY_SECTION = "telemetry";

  // Workspace settings
  private static readonly WORKSPACE_INITIALIZED = "workspace.initialized";
  private static readonly WORKSPACE_MCP_SERVERS = "workspace.mcpServers";
  private static readonly INIT_CREATE_VSCODE_SETTINGS = "init.createVscodeSettings";
  private static readonly INIT_CREATE_VSCODE_EXTENSIONS = "init.createVscodeExtensions";

  // MCP Setup settings
  private static readonly MCP_SETUP_DISMISSED = "mcpSetup.dismissed";

  // Telemetry settings
  private static readonly TELEMETRY_ENABLED = "telemetry.enabled";
  private static readonly TELEMETRY_CONNECTION_STRING = "telemetry.connectionString";
  private static readonly TELEMETRY_LEVEL = "telemetryLevel";

  // Extension update settings
  private static readonly EXTENSION_AUTO_CHECK_UPDATES = "extension.autoCheckUpdates";
  private static readonly EXTENSION_UPDATE_CHECK_INTERVAL = "extension.updateCheckInterval";
  private static readonly EXTENSION_LAST_UPDATE_CHECK = "extension.lastUpdateCheck";

  // Repository settings
  private static readonly REPOSITORIES = "repositories";

  // Workspace Initialization
  static isWorkspaceInitialized(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.WORKSPACE_INITIALIZED, false);
  }

  static async setWorkspaceInitialized(
    value: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.WORKSPACE_INITIALIZED, value, target);
  }

  static getWorkspaceMcpServers(): string[] {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string[]>(this.WORKSPACE_MCP_SERVERS, []);
  }

  static async setWorkspaceMcpServers(
    servers: string[],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.WORKSPACE_MCP_SERVERS, servers, target);
  }

  static async setInitCreateVscodeSettings(
    value: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.INIT_CREATE_VSCODE_SETTINGS, value, target);
  }

  static getInitCreateVscodeExtensions(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.INIT_CREATE_VSCODE_EXTENSIONS, true);
  }

  static async setInitCreateVscodeExtensions(
    value: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.INIT_CREATE_VSCODE_EXTENSIONS, value, target);
  }

  // MCP Setup
  static isMcpSetupDismissed(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.MCP_SETUP_DISMISSED, false);
  }

  static async setMcpSetupDismissed(
    value: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.MCP_SETUP_DISMISSED, value, target);
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

  static async setLastUpdateCheck(
    timestamp: number,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.EXTENSION_LAST_UPDATE_CHECK, timestamp, target);
  }

  // Repositories
  static getRepositories<T = any>(): T[] {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<T[]>(this.REPOSITORIES, []);
  }

  static async setRepositories<T = any>(
    repositories: T[],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.REPOSITORIES, repositories, target);
  }
}
