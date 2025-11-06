/**
 * State Manager for internal extension state
 *
 * This module manages internal state that should not be visible in user settings.
 * It uses VS Code's workspace state (for workspace-specific data) and global state
 * (for user-level data) instead of configuration settings.
 */

import * as vscode from "vscode";

export class StateManager {
  private static workspaceState: vscode.Memento;
  private static globalState: vscode.Memento;

  /**
   * Initialize the state manager with the extension context
   */
  public static initialize(context: vscode.ExtensionContext): void {
    this.workspaceState = context.workspaceState;
    this.globalState = context.globalState;
  }

  // Workspace-specific state keys
  private static readonly WORKSPACE_INITIALIZED =
    "nexkit.workspace.initialized";
  private static readonly WORKSPACE_LANGUAGES = "nexkit.workspace.languages";
  private static readonly WORKSPACE_MCP_SERVERS = "nexkit.workspace.mcpServers";

  // Global (user-level) state keys
  private static readonly LAST_UPDATE_CHECK =
    "nexkit.extension.lastUpdateCheck";
  private static readonly LAST_KNOWN_VERSION =
    "nexkit.extension.lastKnownVersion";
  private static readonly MCP_SETUP_DISMISSED = "nexkit.mcpSetup.dismissed";

  // Workspace state getters/setters
  public static getWorkspaceInitialized(): boolean {
    return this.workspaceState.get<boolean>(this.WORKSPACE_INITIALIZED, false);
  }

  public static async setWorkspaceInitialized(value: boolean): Promise<void> {
    await this.workspaceState.update(this.WORKSPACE_INITIALIZED, value);
  }

  public static getWorkspaceLanguages(): string[] {
    return this.workspaceState.get<string[]>(this.WORKSPACE_LANGUAGES, []);
  }

  public static async setWorkspaceLanguages(
    languages: string[]
  ): Promise<void> {
    await this.workspaceState.update(this.WORKSPACE_LANGUAGES, languages);
  }

  public static getWorkspaceMcpServers(): string[] {
    return this.workspaceState.get<string[]>(this.WORKSPACE_MCP_SERVERS, []);
  }

  public static async setWorkspaceMcpServers(servers: string[]): Promise<void> {
    await this.workspaceState.update(this.WORKSPACE_MCP_SERVERS, servers);
  }

  // Global state getters/setters
  public static getLastUpdateCheck(): number {
    return this.globalState.get<number>(this.LAST_UPDATE_CHECK, 0);
  }

  public static async setLastUpdateCheck(timestamp: number): Promise<void> {
    await this.globalState.update(this.LAST_UPDATE_CHECK, timestamp);
  }

  public static getLastKnownVersion(): string {
    return this.globalState.get<string>(this.LAST_KNOWN_VERSION, "");
  }

  public static async setLastKnownVersion(version: string): Promise<void> {
    await this.globalState.update(this.LAST_KNOWN_VERSION, version);
  }

  public static getMcpSetupDismissed(): boolean {
    return this.globalState.get<boolean>(this.MCP_SETUP_DISMISSED, false);
  }

  public static async setMcpSetupDismissed(dismissed: boolean): Promise<void> {
    await this.globalState.update(this.MCP_SETUP_DISMISSED, dismissed);
  }

  /**
   * Migrate existing configuration values to state storage
   * This ensures existing users don't lose their data when we remove these from configuration
   */
  public static async migrateFromConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration("nexkit");

    // Check if any values are actually set (not just defaults from package.json)
    const hasWorkspaceConfig =
      config.inspect("workspace.initialized")?.workspaceValue !== undefined ||
      config.inspect("workspace.languages")?.workspaceValue !== undefined ||
      config.inspect("workspace.mcpServers")?.workspaceValue !== undefined;

    const hasGlobalConfig =
      config.inspect("extension.lastUpdateCheck")?.globalValue !== undefined ||
      config.inspect("extension.lastKnownVersion")?.globalValue !== undefined ||
      config.inspect("mcpSetup.dismissed")?.globalValue !== undefined;

    if (!hasWorkspaceConfig && !hasGlobalConfig) {
      return; // Nothing to migrate
    }

    console.log(
      "Migrating internal settings from configuration to state storage..."
    );

    // Migrate workspace-specific settings
    const workspaceInitInspect = config.inspect<boolean>(
      "workspace.initialized"
    );
    if (
      workspaceInitInspect?.workspaceValue !== undefined ||
      workspaceInitInspect?.workspaceFolderValue !== undefined
    ) {
      const initialized = config.get<boolean>("workspace.initialized", false);
      await this.setWorkspaceInitialized(initialized);
      await config.update(
        "workspace.initialized",
        undefined,
        vscode.ConfigurationTarget.Workspace
      );
      await config.update(
        "workspace.initialized",
        undefined,
        vscode.ConfigurationTarget.WorkspaceFolder
      );
    }

    const workspaceLanguagesInspect = config.inspect<string[]>(
      "workspace.languages"
    );
    if (
      workspaceLanguagesInspect?.workspaceValue !== undefined ||
      workspaceLanguagesInspect?.workspaceFolderValue !== undefined
    ) {
      const languages = config.get<string[]>("workspace.languages", []);
      await this.setWorkspaceLanguages(languages);
      await config.update(
        "workspace.languages",
        undefined,
        vscode.ConfigurationTarget.Workspace
      );
      await config.update(
        "workspace.languages",
        undefined,
        vscode.ConfigurationTarget.WorkspaceFolder
      );
    }

    const workspaceMcpInspect = config.inspect<string[]>(
      "workspace.mcpServers"
    );
    if (
      workspaceMcpInspect?.workspaceValue !== undefined ||
      workspaceMcpInspect?.workspaceFolderValue !== undefined
    ) {
      const mcpServers = config.get<string[]>("workspace.mcpServers", []);
      await this.setWorkspaceMcpServers(mcpServers);
      await config.update(
        "workspace.mcpServers",
        undefined,
        vscode.ConfigurationTarget.Workspace
      );
      await config.update(
        "workspace.mcpServers",
        undefined,
        vscode.ConfigurationTarget.WorkspaceFolder
      );
    }

    // Migrate global settings
    const lastCheckInspect = config.inspect<number>(
      "extension.lastUpdateCheck"
    );
    if (lastCheckInspect?.globalValue !== undefined) {
      const lastCheck = config.get<number>("extension.lastUpdateCheck", 0);
      await this.setLastUpdateCheck(lastCheck);
      await config.update(
        "extension.lastUpdateCheck",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }

    const lastVersionInspect = config.inspect<string>(
      "extension.lastKnownVersion"
    );
    if (lastVersionInspect?.globalValue !== undefined) {
      const lastVersion = config.get<string>("extension.lastKnownVersion", "");
      await this.setLastKnownVersion(lastVersion);
      await config.update(
        "extension.lastKnownVersion",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }

    const mcpDismissedInspect = config.inspect<boolean>("mcpSetup.dismissed");
    if (mcpDismissedInspect?.globalValue !== undefined) {
      const dismissed = config.get<boolean>("mcpSetup.dismissed", false);
      await this.setMcpSetupDismissed(dismissed);
      await config.update(
        "mcpSetup.dismissed",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }

    console.log("Migration complete!");
  }
}
