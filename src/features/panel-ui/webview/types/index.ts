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

export type GroupMode = "type" | "repository" | "none";

export interface TemplateFilters {
  status: FilterMode;
  types: string[];
  repositories: string[];
}

export interface WebviewPersistentState {
  expandedState: Record<string, boolean>;
  filterMode: FilterMode;
  groupMode: GroupMode;
  selectedFirst: boolean;
  typeFilters: string[];
  repositoryFilters: string[];
}
