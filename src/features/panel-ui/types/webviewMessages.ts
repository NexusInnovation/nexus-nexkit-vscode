/**
 * Type definitions for messages exchanged between the webview and extension
 */

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "ready" }
  | { command: "initProject" }
  | { command: "openSettings" }
  | { command: "installUserMCPs" };

/**
 * Messages sent FROM the extension TO the webview
 */
export type ExtensionMessage = {
  command: "workspaceStateUpdate";
  hasWorkspace: boolean;
  isInitialized: boolean;
};
