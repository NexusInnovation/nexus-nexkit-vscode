/**
 * Command names used throughout the extension.
 * Centralized to prevent typos and ensure consistency.
 */
export const Commands = {
  // Main commands
  INIT_WORKSPACE: "nexus-nexkit-vscode.initWorkspace",
  CHECK_EXTENSION_UPDATE: "nexus-nexkit-vscode.checkExtensionUpdate",
  INSTALL_USER_MCPS: "nexus-nexkit-vscode.installUserMCPs",
  OPEN_SETTINGS: "nexus-nexkit-vscode.openSettings",
  OPEN_FEEDBACK: "nexus-nexkit-vscode.openFeedback",
  RESTORE_BACKUP: "nexus-nexkit-vscode.restoreBackup",
  CLEANUP_BACKUP: "nexus-nexkit-vscode.cleanupBackup",
  UPDATE_INSTALLED_TEMPLATES: "nexus-nexkit-vscode.updateInstalledTemplates",
  RESET_WORKSPACE: "nexus-nexkit-vscode.resetWorkspace",
  RESET_NEXKIT: "nexus-nexkit-vscode.resetNexkit",

  // Profile management commands
  SAVE_PROFILE: "nexus-nexkit-vscode.saveProfile",
  APPLY_PROFILE: "nexus-nexkit-vscode.applyProfile",
  DELETE_PROFILE: "nexus-nexkit-vscode.deleteProfile",

  // Mode management commands
  SWITCH_MODE: "nexus-nexkit-vscode.switchMode",

  // APM DevOps commands
  ADD_DEVOPS_CONNECTION: "nexus-nexkit-vscode.addDevOpsConnection",
  REMOVE_DEVOPS_CONNECTION: "nexus-nexkit-vscode.removeDevOpsConnection",
} as const;

// Type-safe command names
export type CommandName = (typeof Commands)[keyof typeof Commands];
