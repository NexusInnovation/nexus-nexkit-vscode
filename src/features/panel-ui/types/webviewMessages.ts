import { AITemplateFile, OperationMode, RepositoryTemplatesMap } from "../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadata } from "../../ai-template-files/models/templateMetadata";
import { TemplateMetadataEntry, MetadataScanProgress } from "../../ai-template-files/services/templateMetadataScannerService";
import { Profile } from "../../profile-management/models/profile";
import { DevOpsConnection } from "../../apm-devops/models/devOpsConnection";
import { WorkflowInfo } from "../../github-workflow-runner/githubWorkflowRunnerService";
import { RepositorySyncActionType, RepositorySyncConflictActionGroup } from "../../repository-sync/models/repositorySyncModels";

export type RepositorySyncFeedbackLevel = "info" | "warning" | "error";

export type RepositorySyncPanelActionType =
  | "run-once"
  | "retry-failed-only"
  | "retry-specific"
  | "apply-batch-conflict-action"
  | "show-output"
  | "get-configuration"
  | "browse-add-watched-repository"
  | "remove-watched-repository"
  | "browse-add-scan-root"
  | "remove-scan-root"
  | "hide-repository"
  | "unhide-repository";

export interface RepositorySyncWorkspaceRepository {
  name: string;
  path: string;
}

export interface RepositorySyncConfigurationSnapshot {
  workspaceRepositories: RepositorySyncWorkspaceRepository[];
  watchedRepositories: string[];
  scanRootPaths: string[];
  hiddenRepositories: string[];
}
export interface RepositorySyncActionFeedback {
  message: string;
  level: RepositorySyncFeedbackLevel;
  timestamp: string;
  actionType: RepositorySyncPanelActionType;
}

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "webviewReady" }
  | { command: "initWorkspace" }
  | { command: "dismissInitWorkspace" }
  | { command: "getTemplateData" }
  | { command: "installTemplate"; template: AITemplateFile }
  | { command: "uninstallTemplate"; template: AITemplateFile }
  | { command: "updateInstalledTemplates"; mode?: OperationMode }
  | { command: "getTemplateMetadata"; template: AITemplateFile }
  | { command: "applyProfile"; profile: Profile }
  | { command: "deleteProfile"; profile: Profile }
  | { command: "openFeedback" }
  | { command: "openConvertToMarkdown" }
  | { command: "setMode"; mode: OperationMode }
  // APM DevOps connection messages
  | { command: "getDevOpsConnections" }
  | { command: "addDevOpsConnection"; url: string }
  | { command: "removeDevOpsConnection"; connectionId: string }
  | { command: "setActiveDevOpsConnection"; connectionId: string }
  // GitHub workflow runner messages
  | { command: "listWorkflows" }
  | { command: "runWorkflow"; workflowFile: string; job?: string; event: string; dryRun: boolean; list: boolean }
  // Repository sync messages
  | { command: "repositorySyncRunOnce" }
  | { command: "repositorySyncRetryFailedOnly" }
  | { command: "repositorySyncRetrySpecific"; repositoryPath?: string; repositoryName?: string }
  | {
      command: "repositorySyncApplyBatchConflictAction";
      conflictGroup?: RepositorySyncConflictActionGroup;
      action?: RepositorySyncActionType;
    }
  | { command: "repositorySyncShowOutput" }
  | { command: "repositorySyncGetConfiguration" }
  | { command: "repositorySyncBrowseAddWatchedRepository" }
  | { command: "repositorySyncRemoveWatchedRepository"; path: string }
  | { command: "repositorySyncBrowseAddScanRoot" }
  | { command: "repositorySyncRemoveScanRoot"; path: string }
  | { command: "repositorySyncHideRepository"; path: string }
  | { command: "repositorySyncUnhideRepository"; path: string };

/**
 * Messages sent FROM the extension TO the webview
 */
export type ExtensionMessage =
  | {
      command: "workspaceStateUpdate";
      hasWorkspace: boolean;
      isInitialized: boolean;
      isInitRefused: boolean;
      mode: OperationMode;
      deployMode: "user" | "workspace";
      workspaceOverrideActive: boolean;
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
        hooks: string[];
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
    }
  | {
      command: "metadataScanProgress";
      progress: MetadataScanProgress;
    }
  | {
      command: "metadataScanComplete";
      index: TemplateMetadataEntry[];
    }
  // Template updates available
  | {
      command: "templateUpdatesAvailable";
      updatesAvailable: boolean;
    }
  // GitHub workflow runner messages
  | {
      command: "workflowListUpdate";
      workflows: WorkflowInfo[];
    }
  | {
      command: "repositorySyncConfigurationUpdate";
      configuration: RepositorySyncConfigurationSnapshot;
    }
  | {
      command: "repositorySyncActionFeedback";
      feedback: RepositorySyncActionFeedback;
    };
