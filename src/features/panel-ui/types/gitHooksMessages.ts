/**
 * Git Hooks message types for webview communication
 */

/**
 * Status information for git hooks
 */
export interface GitHooksStatusData {
  isInstalled: boolean;
  isEnabled: boolean;
  rulesLoaded: number;
  pythonAvailable: boolean;
  message?: string;
}

/**
 * Messages sent FROM the webview TO the extension related to git hooks
 */
export type GitHooksWebviewMessage =
  | { command: "getGitHooksStatus" }
  | { command: "setupGitHooks" }
  | { command: "syncGitHooksFromGithub" }
  | { command: "enableGitHooks" }
  | { command: "disableGitHooks" };

/**
 * Messages sent FROM the extension TO the webview related to git hooks
 */
export type GitHooksExtensionMessage =
  | {
      command: "gitHooksStatusUpdate";
      status: GitHooksStatusData;
    }
  | {
      command: "gitHooksOperationComplete";
      operation: "setup" | "sync" | "enable" | "disable";
      success: boolean;
      message?: string;
    }
  | {
      command: "gitHooksError";
      error: string;
    };
