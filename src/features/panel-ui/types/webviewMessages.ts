import { OperationMode } from "../../../shared/constants/operationMode";
import { MarketplaceSuggestion } from "../../marketplace-management/models/marketplace";
import { DevOpsConnection } from "../../apm-devops/models/devOpsConnection";
import { WorkflowInfo } from "../../github-workflow-runner/githubWorkflowRunnerService";

/**
 * Messages sent FROM the webview TO the extension
 */
export type WebviewMessage =
  | { command: "webviewReady" }
  | { command: "initWorkspace" }
  | { command: "dismissInitWorkspace" }
  | { command: "getMarketplaces" }
  | { command: "addMarketplace"; source: string }
  | { command: "removeMarketplace"; source: string }
  | { command: "openPluginBrowser" }
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
  | { command: "runWorkflow"; workflowFile: string; job?: string; event: string; dryRun: boolean; list: boolean };

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
    }
  | {
      command: "marketplacesUpdate";
      /** Entries of `chat.plugins.marketplaces` (user scope). */
      configured: string[];
      suggested: MarketplaceSuggestion[];
    }
  | {
      command: "marketplaceError";
      error: string;
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
  // GitHub workflow runner messages
  | {
      command: "workflowListUpdate";
      workflows: WorkflowInfo[];
    };
