/**
 * Type definitions for the Nexkit webview panel
 * Re-exported from the main types file for convenience
 */

export type { WebviewMessage, ExtensionMessage } from "../../types/webviewMessages";

export interface WorkspaceState {
  hasWorkspace: boolean;
  isInitialized: boolean;
}

export type FilterMode = "all" | "selected" | "unselected";

export interface WebviewPersistentState {
  expandedSections: Record<string, boolean>;
  filterMode?: FilterMode;
}
