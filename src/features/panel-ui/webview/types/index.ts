/**
 * Type definitions for the Nexkit webview panel
 * Re-exported from the main types file for convenience
 */

export type { TemplateFileData, RepositoryTemplateData, WebviewMessage, ExtensionMessage } from "../../types/webviewMessages";

export interface InstalledTemplatesMap {
  agents: string[];
  prompts: string[];
  instructions: string[];
  chatmodes: string[];
}

export interface WorkspaceState {
  hasWorkspace: boolean;
  isInitialized: boolean;
}

export interface WebviewPersistentState {
  expandedSections: Record<string, boolean>;
}
