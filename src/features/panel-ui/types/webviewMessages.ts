/**
 * Type definitions for messages exchanged between the webview and extension
 */

/**
 * Template file data for webview display
 */
export interface TemplateFileData {
  name: string;
  type: string;
  rawUrl: string;
  repository: string;
  repositoryUrl: string;
}

/**
 * Repository with organized templates by type
 */
export interface RepositoryTemplateData {
  name: string;
  url: string;
  types: {
    agents: TemplateFileData[];
    prompts: TemplateFileData[];
    instructions: TemplateFileData[];
    chatmodes: TemplateFileData[];
  };
}

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "ready" }
  | { command: "initProject" }
  | { command: "getTemplateData" }
  | { command: "getInstalledTemplates" }
  | { command: "installTemplate"; template: TemplateFileData }
  | { command: "uninstallTemplate"; template: TemplateFileData };

/**
 * Messages sent FROM the extension TO the webview
 */
export type ExtensionMessage =
  | {
      command: "workspaceStateUpdate";
      hasWorkspace: boolean;
      isInitialized: boolean;
    }
  | {
      command: "templateDataUpdate";
      repositories: RepositoryTemplateData[];
    }
  | {
      command: "installedTemplatesUpdate";
      installed: {
        agents: string[];
        prompts: string[];
        instructions: string[];
        chatmodes: string[];
      };
    };
