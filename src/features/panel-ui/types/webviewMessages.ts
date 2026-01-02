import { AITemplateFile, RepositoryTemplatesMap } from "../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadata } from "../../ai-template-files/models/templateMetadata";

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "webviewReady" }
  | { command: "initWorkspace" }
  | { command: "getTemplateData" }
  | { command: "installTemplate"; template: AITemplateFile }
  | { command: "uninstallTemplate"; template: AITemplateFile }
  | { command: "updateInstalledTemplates" }
  | { command: "getTemplateMetadata"; template: AITemplateFile };

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
      repositories: RepositoryTemplatesMap[];
    }
  | {
      command: "installedTemplatesUpdate";
      installed: {
        agents: string[];
        prompts: string[];
        instructions: string[];
        chatmodes: string[];
      };
    }
  | {
      command: "templateMetadataResponse";
      template: AITemplateFile;
      metadata: TemplateMetadata | null;
      error?: string;
    };
