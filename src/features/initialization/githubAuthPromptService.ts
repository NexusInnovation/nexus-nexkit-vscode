import * as vscode from "vscode";
import { GitHubAuthHelper } from "../../shared/utils/githubAuthHelper";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Service for verifying GitHub authentication at extension startup.
 * Prompts the user to authenticate if no session is found.
 */
export class GitHubAuthPromptService {
  private readonly _logging = LoggingService.getInstance();

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

    // No existing session — prompt the user
    const result = await vscode.window.showWarningMessage(
      "Nexkit requires GitHub authentication to access template repositories. Please sign in to continue.",
      "Sign in with GitHub",
      "Later"
    );

    if (result === "Sign in with GitHub") {
      const session = await GitHubAuthHelper.getGitHubSession(["repo"], true, false);
      if (session) {
        this._logging.info("GitHub authentication successful");
        return true;
      }
      this._logging.warn("GitHub authentication was not completed");
      return false;
    }

    this._logging.warn("User deferred GitHub authentication");
    return false;
  }
}
