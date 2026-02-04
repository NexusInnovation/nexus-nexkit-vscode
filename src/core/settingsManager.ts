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
  private static readonly REPOSITORIES = "repositories";

  // Telemetry settings
  private static readonly TELEMETRY_ENABLED = "telemetry.enabled";
  private static readonly TELEMETRY_CONNECTION_STRING = "telemetry.connectionString";
  private static readonly TELEMETRY_LEVEL = "telemetryLevel";

  // Extension update settings
  private static readonly EXTENSION_AUTO_CHECK_UPDATES = "extension.autoCheckUpdates";
  private static readonly EXTENSION_UPDATE_CHECK_INTERVAL = "extension.updateCheckInterval";

  // Extension update state keys (GlobalState)
  private static readonly EXTENSION_LAST_UPDATE_CHECK_STATE_KEY = "nexkit.extension.lastUpdateCheck";

  // Mode settings
  private static readonly MODE = "mode";

  // Profile management settings
  private static readonly PROFILES = "profiles";
  private static readonly PROFILES_CONFIRM_BEFORE_SWITCH = "profiles.confirmBeforeSwitch";

  // Profile management state keys (WorkspaceState)
  private static readonly LAST_APPLIED_PROFILE_KEY = "lastAppliedProfile";

  // APM DevOps state keys (WorkspaceState)
  private static readonly ACTIVE_DEVOPS_CONNECTION_KEY = "activeDevOpsConnection";

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
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.globalState.get<number>(this.EXTENSION_LAST_UPDATE_CHECK_STATE_KEY, 0);
  }

  static async setLastUpdateCheck(timestamp: number): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.globalState.update(this.EXTENSION_LAST_UPDATE_CHECK_STATE_KEY, timestamp);
  }

  // Profiles
  static getProfiles<T = any>(): T[] {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<T[]>(this.PROFILES, []);
  }

  static async setProfiles<T = any>(profiles: T[]): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .update(this.PROFILES, profiles, vscode.ConfigurationTarget.Global);
  }

  static isProfileConfirmBeforeSwitchEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.PROFILES_CONFIRM_BEFORE_SWITCH, true);
  }

  // Last Applied Profile (using workspace state)
  static getLastAppliedProfile(): string | null {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.workspaceState.get<string | null>(this.LAST_APPLIED_PROFILE_KEY, null);
  }

  static async setLastAppliedProfile(profileName: string | null): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(this.LAST_APPLIED_PROFILE_KEY, profileName);
  }

  // Mode
  static getMode(): string {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string>(this.MODE, "Developers");
  }

  static async setMode(mode: string): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.MODE, mode, vscode.ConfigurationTarget.Global);
  }

  // Active DevOps Connection (using workspace state)
  static getActiveDevOpsConnection(): string | null {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.workspaceState.get<string | null>(this.ACTIVE_DEVOPS_CONNECTION_KEY, null);
  }

  static async setActiveDevOpsConnection(connectionId: string | null): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(this.ACTIVE_DEVOPS_CONNECTION_KEY, connectionId);
  }
}
