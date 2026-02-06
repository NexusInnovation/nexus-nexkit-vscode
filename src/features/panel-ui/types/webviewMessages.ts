import { AITemplateFile, OperationMode, RepositoryTemplatesMap } from "../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadata } from "../../ai-template-files/models/templateMetadata";
import { Profile } from "../../profile-management/models/profile";
import { DevOpsConnection } from "../../apm-devops/models/devOpsConnection";

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "webviewReady" }
  | { command: "initWorkspace" }
  | { command: "getTemplateData" }
  | { command: "installTemplate"; template: AITemplateFile }
  | { command: "uninstallTemplate"; template: AITemplateFile }
  | { command: "updateInstalledTemplates"; mode?: OperationMode }
  | { command: "getTemplateMetadata"; template: AITemplateFile }
  | { command: "applyProfile"; profile: Profile }
  | { command: "deleteProfile"; profile: Profile }
  | { command: "openFeedback" }
  | { command: "setMode"; mode: OperationMode }
  // APM DevOps connection messages
  | { command: "getDevOpsConnections" }
  | { command: "addDevOpsConnection"; url: string }
  | { command: "removeDevOpsConnection"; connectionId: string }
  | { command: "setActiveDevOpsConnection"; connectionId: string };

/**
 * Messages sent FROM the extension TO the webview
 */
export type ExtensionMessage =
  | {
      command: "workspaceStateUpdate";
      hasWorkspace: boolean;
      isInitialized: boolean;
      mode: OperationMode;
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
        skills: string[];
        instructions: string[];
        chatmodes: string[];
      };
    }
  | {
      command: "templateMetadataResponse";
      template: AITemplateFile;
      metadata: TemplateMetadata | null;
      error?: string;
    }
  | {
      command: "profilesUpdate";
      profiles: Profile[];
    }
  // APM DevOps connection messages
  | {
      command: "devOpsConnectionsUpdate";
      connections: DevOpsConnection[];
    }
  | {
      command: "devOpsConnectionError";
      error: string;
    };
