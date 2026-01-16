/**
 * Global application state types for the Nexkit webview
 * Centralized state management to prevent timing issues with component mounting
 */

import { AITemplateFile, InstalledTemplatesMap, RepositoryTemplatesMap } from "../../../ai-template-files/models/aiTemplateFile";
import { Profile } from "../../../profile-management/models/profile";

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
}

/**
 * Initial state for the application
 */
export const initialAppState: AppState = {
  workspace: {
    hasWorkspace: false,
    isInitialized: false,
    isReady: false,
  },
  templates: {
    repositories: [],
    installed: {
      agents: [],
      prompts: [],
      skills: [],
      instructions: [],
      chatmodes: [],
    },
    isReady: false,
  },
  profiles: {
    list: [],
    isReady: false,
  },
};
