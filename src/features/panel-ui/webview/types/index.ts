/**
 * Type definitions for the Nexkit webview panel
 * Re-exported from the main types file for convenience
 */

export type { WebviewMessage, ExtensionMessage } from "../../types/webviewMessages";

export interface WorkspaceState {
  hasWorkspace: boolean;
  isInitialized: boolean;
}

export interface WebviewPersistentState {
  expandedSections: Record<string, boolean>;
}
