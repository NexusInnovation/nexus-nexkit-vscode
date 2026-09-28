import { AITemplateFile, OperationMode, RepositoryTemplatesMap } from "../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadata } from "../../ai-template-files/models/templateMetadata";
import { TemplateMetadataEntry, MetadataScanProgress } from "../../ai-template-files/services/templateMetadataScannerService";
import { Profile } from "../../profile-management/models/profile";
import { DevOpsConnection } from "../../apm-devops/models/devOpsConnection";
import { WorkflowInfo } from "../../github-workflow-runner/githubWorkflowRunnerService";
import type {
  RejectedSquadPreset,
  SquadCharter,
  SquadCliSource,
  SquadDetectionResult,
  SquadDoctorReport,
  SquadDocKind,
  SquadError,
  SquadMarkdownDoc,
  SquadPluginRef,
  SquadPreset,
  SquadRosterMember,
  SquadUpdatesResult,
  SquadUpstreamSource,
  UnreachableSquadSource,
} from "../../squad/models";
import type { SquadLogDocument } from "../webview/types/squadState";

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
  // Squad management messages (SQD-007; host routing implemented in #223)
  | { command: "getSquadState" }
  | { command: "refreshSquadDetection" }
  | { command: "checkSquadUpdates" }
  | { command: "saveSquadCharter"; agentId: string; content: string }
  | { command: "saveSquadDoc"; kind: SquadDocKind; content: string }
  | { command: "runSquadDoctor" }
  // Squad preset selection screen (SQD-019 / #234)
  | { command: "listSquadPresets" }
  | { command: "initSquadFromPreset"; presetId: string }
  // Squad CLI setup (SQD-025 / #240): choose npm-global / npx / custom path, or install the CLI
  | { command: "setSquadCliInvocation"; source: SquadCliSource; cliPath?: string }
  | { command: "installSquadCli" };

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
  // Squad management messages (SQD-007; host routing implemented in #223)
  | {
      command: "squadStatusUpdate";
      detection: SquadDetectionResult;
      upstreams: SquadUpstreamSource[];
      plugins: SquadPluginRef[];
    }
  | {
      command: "squadRosterUpdate";
      roster: SquadRosterMember[];
      charters: SquadCharter[];
    }
  | {
      command: "squadDocsUpdate";
      decisions: SquadMarkdownDoc | null;
      routing: SquadMarkdownDoc | null;
    }
  | {
      command: "squadLogsUpdate";
      logs: SquadLogDocument[];
    }
  | {
      command: "squadDoctorUpdate";
      doctor: SquadDoctorReport;
    }
  | {
      command: "squadUpdatesUpdate";
      updates: SquadUpdatesResult;
    }
  | {
      command: "squadLoading";
      isLoading: boolean;
    }
  | {
      command: "squadError";
      error: SquadError;
    }
  // Squad preset selection screen (SQD-019 / #234)
  | {
      command: "squadPresetsDiscovered";
      presets: SquadPreset[];
      rejected: RejectedSquadPreset[];
      unreachable: UnreachableSquadSource[];
    }
  | {
      command: "squadPresetsLoading";
      isLoading: boolean;
    }
  | {
      command: "squadPresetsError";
      error: SquadError;
    }
  | {
      command: "squadInitResult";
      presetId: string;
      ok: boolean;
      error?: SquadError;
    };
