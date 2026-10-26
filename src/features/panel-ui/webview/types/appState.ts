import { OperationMode } from "../../../../shared/constants/operationMode";
import { MarketplaceNode, MarketplaceSuggestion } from "../../../marketplace-management/models/marketplace";
/**
 * Global application state types for the Nexkit webview
 * Centralized state management to prevent timing issues with component mounting
 */

import { DevOpsConnection } from "../../../apm-devops/models/devOpsConnection";
import { WorkflowInfo } from "../../../github-workflow-runner/githubWorkflowRunnerService";

/**
 * Complete application state
 */
export interface AppState {
  /**
   * Workspace state
   */
  workspace: {
    hasWorkspace: boolean;
    isInitialized: boolean;
    isInitRefused: boolean; // User explicitly dismissed the initialization prompt
    isReady: boolean; // Whether initial workspace state has been received from extension
    mode: OperationMode; // Operation mode
  };

  /**
   * Plugin marketplaces state (chat.plugins.marketplaces)
   */
  marketplaces: {
    configured: string[];
    suggested: MarketplaceSuggestion[];
    tree: MarketplaceNode[];
    isReady: boolean;
    error?: string;
  };

  /**
   * APM DevOps connection state
   */
  devOpsConnections: {
    list: DevOpsConnection[];
    isReady: boolean;
    error?: string;
  };

  /**
   * GitHub workflow runner state
   */
  workflows: {
    list: WorkflowInfo[];
    isReady: boolean;
  };
}

/**
 * Initial state for the application
 */
export const initialAppState: AppState = {
  workspace: {
    hasWorkspace: false,
    isInitialized: false,
    isInitRefused: false,
    isReady: false,
    mode: OperationMode.None,
  },
  marketplaces: {
    configured: [],
    suggested: [],
    tree: [],
    isReady: false,
  },
  devOpsConnections: {
    list: [],
    isReady: false,
  },
  workflows: {
    list: [],
    isReady: false,
  },
};
