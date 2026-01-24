/**
 * GitHub Authentication Helper
 * Provides unified interface for GitHub authentication across different environments
 * - Local development: Uses VS Code authentication (copied to test instance)
 * - CI/CD: Uses GITHUB_TOKEN environment variable
 */

import * as vscode from "vscode";

export type ExecutionEnvironment = "ci" | "local" | "test";

export class GitHubAuthHelper {
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly ENV_VAR_NAMES = ["GITHUB_TOKEN", "GH_TOKEN"];

  /**
   * Detect the current execution environment
   */
  public static detectEnvironment(): ExecutionEnvironment {
    // Check for CI environment indicators
    if (
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.TF_BUILD ||
      process.env.JENKINS_HOME ||
      process.env.TRAVIS
    ) {
      return "ci";
    }

    // Check if running in VS Code test mode
    if (process.env.VSCODE_TEST_MODE) {
      return "test";
    }

    return "local";
  }

  /**
   * Check if running in CI/CD environment
   */
  public static isCI(): boolean {
    return this.detectEnvironment() === "ci";
  }

  /**
   * Get GitHub token from environment variables
   */
  public static getGitHubTokenFromEnv(): string | undefined {
    for (const varName of this.ENV_VAR_NAMES) {
      const token = process.env[varName];
      if (token) {
        return token;
      }
    }
    return undefined;
  }

  /**
   * Get GitHub authentication session from VS Code
   * @param scopes Required OAuth scopes
   * @param createIfNone Whether to prompt user if no session exists
   * @param silent Whether to suppress UI prompts
   */
  public static async getGitHubSession(
    scopes: string[],
    createIfNone: boolean = false,
    silent: boolean = true
  ): Promise<vscode.AuthenticationSession | undefined> {
    try {
      const session = await vscode.authentication.getSession(this.GITHUB_AUTH_PROVIDER_ID, scopes, {
        createIfNone,
        silent,
      });
      return session;
    } catch (error) {
      console.warn("Failed to get GitHub authentication session:", error);
      return undefined;
    }
  }

  /**
   * Get authentication headers for GitHub API requests
   * Priority: 1. Environment token, 2. VS Code session, 3. No auth
   * @param scopes Required OAuth scopes (for VS Code auth)
   * @param userAgent User agent string for API requests
   * @param requireAuth Whether authentication is required (affects logging)
   */
  public static async getAuthHeaders(
    scopes: string[] = ["repo"],
    userAgent: string = "Nexkit-VSCode-Extension",
    requireAuth: boolean = false
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": userAgent,
      Accept: "application/vnd.github.v3+json",
    };

    // Priority 1: Check for environment token (CI/CD)
    const envToken = this.getGitHubTokenFromEnv();
    if (envToken) {
      headers["Authorization"] = `token ${envToken}`;
      return headers;
    }

    // Priority 2: Try VS Code authentication (silent, no prompts)
    try {
      const session = await this.getGitHubSession(scopes, false, true);
      if (session) {
        headers["Authorization"] = `token ${session.accessToken}`;
        return headers;
      }
    } catch (error) {
      if (requireAuth) {
        console.warn("GitHub authentication failed:", error);
      }
    }

    // Priority 3: No authentication available
    if (requireAuth) {
      const env = this.detectEnvironment();
      if (env === "ci") {
        console.warn(
          "⚠️ GitHub authentication not available in CI. Set GITHUB_TOKEN environment variable for authenticated requests."
        );
      } else {
        console.warn("⚠️ GitHub authentication not available. Some features may not work with private repositories.");
      }
    }

    return headers;
  }

  /**
   * Check if GitHub authentication is available
   */
  public static async isAuthenticationAvailable(): Promise<boolean> {
    // Check environment token first
    if (this.getGitHubTokenFromEnv()) {
      return true;
    }

    // Check VS Code session
    try {
      const session = await this.getGitHubSession(["repo"], false, true);
      return session !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication info for logging/debugging
   */
  public static async getAuthInfo(): Promise<{ source: string; available: boolean }> {
    const envToken = this.getGitHubTokenFromEnv();
    if (envToken) {
      return { source: "environment", available: true };
    }

    try {
      const session = await this.getGitHubSession(["repo"], false, true);
      if (session) {
        return { source: "vscode-session", available: true };
      }
    } catch {
      // Fall through
    }

    return { source: "none", available: false };
  }
}
