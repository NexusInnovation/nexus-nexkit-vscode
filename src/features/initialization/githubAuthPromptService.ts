import * as vscode from "vscode";
import { GitHubAuthHelper } from "../../shared/utils/githubAuthHelper";
import { LoggingService } from "../../shared/services/loggingService";

const PROMPT_DEFERRED_STATE_KEY = "nexkit.githubAuth.promptDeferredAt";
const PROMPT_DEFER_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Service for verifying GitHub authentication at extension startup.
 * Reuses the GitHub session VS Code already holds; only asks the user to sign in when there is none,
 * and not again for a week once the prompt was dismissed.
 */
export class GitHubAuthPromptService {
  private readonly _logging = LoggingService.getInstance();

  public constructor(private readonly _state?: vscode.Memento) {}

  /**
   * Verify that the user is authenticated with GitHub.
   * If not, prompts the user to sign in.
   */
  public async ensureAuthenticated(): Promise<boolean> {
    // Skip authentication check in CI environments
    if (GitHubAuthHelper.isCI()) {
      return true;
    }

    // First try silently — check if a session already exists without prompting
    const silentSession = await GitHubAuthHelper.getGitHubSession(["repo"], false, true);
    if (silentSession) {
      this._logging.info("GitHub authentication verified (existing session)");
      return true;
    }

    // Check for environment token
    if (GitHubAuthHelper.getGitHubTokenFromEnv()) {
      this._logging.info("GitHub authentication verified (environment token)");
      return true;
    }

    if (this._isPromptDeferred()) {
      this._logging.info("GitHub authentication prompt skipped (dismissed recently)");
      return false;
    }

    // No existing session — prompt the user
    const result = await vscode.window.showWarningMessage(
      "Nexkit requires GitHub authentication to access plugin marketplaces. Please sign in to continue.",
      "Sign in with GitHub",
      "Later"
    );

    if (result === "Sign in with GitHub") {
      const session = await GitHubAuthHelper.getGitHubSession(["repo"], true, false);
      if (session) {
        this._logging.info("GitHub authentication successful");
        await this._state?.update(PROMPT_DEFERRED_STATE_KEY, undefined);
        return true;
      }
      this._logging.warn("GitHub authentication was not completed");
      return false;
    }

    await this._state?.update(PROMPT_DEFERRED_STATE_KEY, Date.now());
    this._logging.warn("User deferred GitHub authentication");
    return false;
  }

  private _isPromptDeferred(): boolean {
    const deferredAt = this._state?.get<number>(PROMPT_DEFERRED_STATE_KEY);
    return deferredAt !== undefined && Date.now() - deferredAt < PROMPT_DEFER_DURATION_MS;
  }
}
