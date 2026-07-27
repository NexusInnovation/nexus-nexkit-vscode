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

  // Profile management commands
  SAVE_PROFILE: "nexus-nexkit-vscode.saveProfile",
  APPLY_PROFILE: "nexus-nexkit-vscode.applyProfile",
  DELETE_PROFILE: "nexus-nexkit-vscode.deleteProfile",

  // Mode management commands
  SWITCH_MODE: "nexus-nexkit-vscode.switchMode",
  GO_TO_MODE_SELECTION: "nexus-nexkit-vscode.goToModeSelection",

  // APM DevOps commands
  ADD_DEVOPS_CONNECTION: "nexus-nexkit-vscode.addDevOpsConnection",
  REMOVE_DEVOPS_CONNECTION: "nexus-nexkit-vscode.removeDevOpsConnection",

  // Logging commands
  SHOW_LOGS: "nexus-nexkit-vscode.showLogs",

  // Commit message generation
  GENERATE_COMMIT_MESSAGE: "nexus-nexkit-vscode.generateCommitMessage",

  // Developer tools
  OPEN_CONVERT_TO_MARKDOWN: "nexus-nexkit-vscode.openConvertToMarkdown",

  // Repository sync
  REPOSITORY_SYNC_RUN_ONCE: "nexus-nexkit-vscode.repositorySync.runOnce",
  REPOSITORY_SYNC_TOGGLE: "nexus-nexkit-vscode.repositorySync.toggle",
  REPOSITORY_SYNC_RETRY_FAILED_ONLY: "nexus-nexkit-vscode.repositorySync.retryFailedOnly",
  REPOSITORY_SYNC_RETRY_SPECIFIC: "nexus-nexkit-vscode.repositorySync.retrySpecific",
  REPOSITORY_SYNC_APPLY_BATCH_CONFLICT_ACTION: "nexus-nexkit-vscode.repositorySync.applyBatchConflictAction",
  REPOSITORY_SYNC_SHOW_OUTPUT: "nexus-nexkit-vscode.repositorySync.showOutput",
} as const;

// Type-safe command names
export type CommandName = (typeof Commands)[keyof typeof Commands];
