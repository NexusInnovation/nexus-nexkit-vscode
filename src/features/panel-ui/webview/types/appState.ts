/**
 * Global application state types for the Nexkit webview
 * Centralized state management to prevent timing issues with component mounting
 */

import {
  AITemplateFile,
  InstalledTemplatesMap,
  OperationMode,
  RepositoryTemplatesMap,
} from "../../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadataEntry } from "../../../ai-template-files/services/templateMetadataScannerService";
import { Profile } from "../../../profile-management/models/profile";
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
    isReady: boolean; // Whether initial workspace state has been received from extension
    mode: OperationMode; // Operation mode
  };

  /**
   * Template state
   */
  templates: {
    repositories: RepositoryTemplatesMap[];
    installed: InstalledTemplatesMap;
    isReady: boolean;
  };

  /**
   * Profile state
   */
  profiles: {
    list: Profile[];
    isReady: boolean;
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

  /**
   * Metadata scan state for fuzzy search
   */
  metadataScan: {
    /** Whether a scan is currently in progress */
    isScanning: boolean;
    /** Number of templates scanned so far */
    scannedCount: number;
    /** Total number of templates to scan */
    totalCount: number;
    /** Whether the scan has completed at least once */
    isComplete: boolean;
    /** The metadata index built by the scan, for fuzzy search */
    index: TemplateMetadataEntry[];
  };
}

/**
 * Initial state for the application
 */
export const initialAppState: AppState = {
  workspace: {
    hasWorkspace: false,
    isInitialized: false,
    isReady: false,
    mode: OperationMode.None,
  },
  templates: {
    repositories: [],
    installed: {
      agents: [],
      prompts: [],
      skills: [],
      instructions: [],
      chatmodes: [],
      hooks: [],
    },
    isReady: false,
  },
  profiles: {
    list: [],
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
  metadataScan: {
    isScanning: false,
    scannedCount: 0,
    totalCount: 0,
    isComplete: false,
    index: [],
  },
};
