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
  RESTORE_BACKUP: "nexus-nexkit-vscode.restoreBackup",
  CLEANUP_BACKUP: "nexus-nexkit-vscode.cleanupBackup",
} as const;

// Type-safe command names
export type CommandName = (typeof Commands)[keyof typeof Commands];
