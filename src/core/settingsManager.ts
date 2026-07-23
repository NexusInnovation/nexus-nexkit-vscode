import * as vscode from "vscode";
import { OperationMode } from "../features/ai-template-files/models/aiTemplateFile";

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

  // Repository commit SHA state key (WorkspaceState)
  private static readonly REPOSITORY_COMMIT_SHAS_KEY = "nexkit.repositories.commitShas";

  // Telemetry settings
  private static readonly TELEMETRY_ENABLED = "telemetry.enabled";
  private static readonly TELEMETRY_CONNECTION_STRING = "telemetry.connectionString";
  private static readonly TELEMETRY_LEVEL = "telemetryLevel";

  // Extension update settings
  private static readonly EXTENSION_AUTO_CHECK_UPDATES = "extension.autoCheckUpdates";
  private static readonly EXTENSION_UPDATE_CHECK_INTERVAL = "extension.updateCheckInterval";

  // Convert to Markdown settings
  private static readonly CONVERT_TO_MARKDOWN_PYTHON_PATH = "convertToMarkdown.pythonPath";

  // Template auto-refresh settings
  private static readonly TEMPLATES_AUTO_REFRESH_INTERVAL = "templates.autoRefreshIntervalMinutes";
  /**
   * @deprecated Use TEMPLATES_AUTO_UPDATE_ENABLED instead.
   */
  private static readonly TEMPLATES_AUTO_UPDATE_ON_REFRESH = "templates.autoUpdateOnRefresh";
  private static readonly TEMPLATES_AUTO_UPDATE_ENABLED = "templates.autoUpdateOnRefresh";

  // Template deploy mode
  private static readonly TEMPLATES_DEPLOY_MODE = "templates.deployMode";

  // Extension update state keys (GlobalState)
  private static readonly EXTENSION_LAST_UPDATE_CHECK_STATE_KEY = "nexkit.extension.lastUpdateCheck";

  // Mode settings
  private static readonly MODE = "mode";

  // Profile management settings
  private static readonly PROFILES = "profiles";
  private static readonly PROFILES_CONFIRM_BEFORE_SWITCH = "profiles.confirmBeforeSwitch";

  // Profile management state keys (WorkspaceState)
  private static readonly LAST_APPLIED_PROFILE_KEY = "lastAppliedProfile";

  // User mode settings
  private static readonly USER_MODE = "userMode";

  // First time user state key (GlobalState)
  private static readonly FIRST_TIME_USER_KEY = "nexkit.firstTimeUser";

  // Profile management state keys (WorkspaceState)

  // APM DevOps state keys (WorkspaceState)
  private static readonly ACTIVE_DEVOPS_CONNECTION_KEY = "activeDevOpsConnection";
  private static readonly DEVOPS_CONNECTIONS_KEY = "devOpsConnections";

  /**
   * Workspace-state keys for "Refuse Forever" confirmation dialogs.
   */
  public static readonly CONFIRMATION_KEYS = {
    CHAT_SETTINGS: "nexkit.confirm.chatSettings.refused",
    mcpUserServer: (serverName: string) => `nexkit.confirm.mcpUser.${serverName}.refused`,
    mcpWorkspaceServer: (serverName: string) => `nexkit.confirm.mcpWorkspace.${serverName}.refused`,
  } as const;

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

  static getRepositoryCommitSha(repoName: string): string | undefined {
    if (!this.context) {
      return undefined;
    }
    const shas = this.context.workspaceState.get<Record<string, string>>(this.REPOSITORY_COMMIT_SHAS_KEY, {});
    return shas[repoName];
  }

  static async setRepositoryCommitSha(repoName: string, sha: string): Promise<void> {
    if (!this.context) {
      return;
    }
    const shas = this.context.workspaceState.get<Record<string, string>>(this.REPOSITORY_COMMIT_SHAS_KEY, {});
    shas[repoName] = sha;
    await this.context.workspaceState.update(this.REPOSITORY_COMMIT_SHAS_KEY, shas);
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

  // Convert to Markdown
  static getConvertToMarkdownPythonPath(): string {
    return vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .get<string>(this.CONVERT_TO_MARKDOWN_PYTHON_PATH, "");
  }

  // Extension Updates
  static isAutoCheckUpdatesEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.EXTENSION_AUTO_CHECK_UPDATES, true);
  }

  static getUpdateCheckIntervalHours(): number {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<number>(this.EXTENSION_UPDATE_CHECK_INTERVAL, 24);
  }

  static getTemplatesAutoRefreshIntervalMinutes(): number {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<number>(this.TEMPLATES_AUTO_REFRESH_INTERVAL, 30);
  }

  static isTemplatesAutoUpdateEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>(this.TEMPLATES_AUTO_UPDATE_ON_REFRESH, true);
  }

  static getTemplateDeployMode(): "user" | "workspace" {
    return vscode.workspace
      .getConfiguration(this.NEXKIT_SECTION)
      .get<"user" | "workspace">(this.TEMPLATES_DEPLOY_MODE, "workspace");
  }

  static isUserDeployMode(): boolean {
    return this.getTemplateDeployMode() === "user";
  }

  /**
   * Determines whether the workspace has per-project template overrides active.
   * True when deployMode is "workspace" OR a .nexkit/ directory exists in the workspace root.
   * When active, both user-level and workspace-level template paths should coexist.
   */
  static isWorkspaceOverrideActive(): boolean {
    if (this.getTemplateDeployMode() === "workspace") {
      return true;
    }
    // Auto-detect: check if a .nexkit/ directory exists at the workspace root
    try {
      const fs = require("fs");
      const path = require("path");
      const workspaceFile = vscode.workspace.workspaceFile;
      let root: string | undefined;
      if (workspaceFile && workspaceFile.scheme === "file") {
        root = path.dirname(workspaceFile.fsPath);
      } else {
        root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      }
      if (!root) {
        return false;
      }
      const nexkitPath = path.join(root, ".nexkit");
      return fs.existsSync(nexkitPath) && fs.statSync(nexkitPath).isDirectory();
    } catch {
      return false;
    }
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

  // User Mode
  static getUserMode(): string {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string>(this.USER_MODE, "notset");
  }

  static async setUserMode(mode: "APM" | "Developer" | "notset"): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.USER_MODE, mode, vscode.ConfigurationTarget.Global);
  }

  // First Time User (using global state)
  static isFirstTimeUser(): boolean {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.globalState.get<boolean>(this.FIRST_TIME_USER_KEY, true);
  }

  static async setFirstTimeUser(value: boolean): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.globalState.update(this.FIRST_TIME_USER_KEY, value);
  }

  // Mode
  static getMode(): OperationMode {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<OperationMode>(this.MODE, OperationMode.None);
  }

  static async setMode(mode: OperationMode): Promise<void> {
    await vscode.workspace.getConfiguration(this.NEXKIT_SECTION).update(this.MODE, mode, vscode.ConfigurationTarget.Global);
  }

  // Commit Message
  static isCommitMessageEnabled(): boolean {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<boolean>("commitMessage.enabled", true);
  }

  static getCommitMessageModel(): string {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string>("commitMessage.model", "");
  }

  static getCommitMessageSystemPrompt(): string {
    return vscode.workspace.getConfiguration(this.NEXKIT_SECTION).get<string>("commitMessage.systemPrompt", "");
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

  // DevOps Connections List (using workspace state)
  static getDevOpsConnectionsList<T>(): T[] {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    return this.context.workspaceState.get<T[]>(this.DEVOPS_CONNECTIONS_KEY, []);
  }

  static async setDevOpsConnectionsList<T>(connections: T[]): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(this.DEVOPS_CONNECTIONS_KEY, connections);
  }

  // Confirmation "Refused Forever" state (WorkspaceState)

  static isConfirmationRefusedForever(key: string): boolean {
    if (!this.context) {
      return false;
    }
    return this.context.workspaceState.get<boolean>(key, false);
  }

  static async setConfirmationRefusedForever(key: string, value: boolean): Promise<void> {
    if (!this.context) {
      throw new Error("SettingsManager not initialized. Call SettingsManager.initialize() first.");
    }
    await this.context.workspaceState.update(key, value);
  }

  static isConfirmChatSettingsRefused(): boolean {
    return this.isConfirmationRefusedForever(this.CONFIRMATION_KEYS.CHAT_SETTINGS);
  }

  static async setConfirmChatSettingsRefused(value: boolean): Promise<void> {
    await this.setConfirmationRefusedForever(this.CONFIRMATION_KEYS.CHAT_SETTINGS, value);
  }

  static isConfirmMcpUserServerRefused(serverName: string): boolean {
    return this.isConfirmationRefusedForever(this.CONFIRMATION_KEYS.mcpUserServer(serverName));
  }

  static async setConfirmMcpUserServerRefused(serverName: string, value: boolean): Promise<void> {
    await this.setConfirmationRefusedForever(this.CONFIRMATION_KEYS.mcpUserServer(serverName), value);
  }

  static isConfirmMcpWorkspaceServerRefused(serverName: string): boolean {
    return this.isConfirmationRefusedForever(this.CONFIRMATION_KEYS.mcpWorkspaceServer(serverName));
  }

  static async setConfirmMcpWorkspaceServerRefused(serverName: string, value: boolean): Promise<void> {
    await this.setConfirmationRefusedForever(this.CONFIRMATION_KEYS.mcpWorkspaceServer(serverName), value);
  }
}
