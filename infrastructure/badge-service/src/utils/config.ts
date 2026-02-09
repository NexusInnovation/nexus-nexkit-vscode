/**
 * Configuration helper to load environment variables
 */

export class Config {
  /**
   * GitHub Personal Access Token (from Key Vault in production)
   */
  static get githubPat(): string {
    const pat = process.env.GITHUB_PAT;
    if (!pat) {
      throw new Error("GITHUB_PAT environment variable is not set");
    }
    return pat;
  }

  /**
   * GitHub repository owner
   */
  static get githubOwner(): string {
    return process.env.GITHUB_OWNER || "NexusInnovation";
  }

  /**
   * GitHub repository name
   */
  static get githubRepo(): string {
    return process.env.GITHUB_REPO || "nexus-nexkit-vscode";
  }

  /**
   * Cache TTL in seconds (default: 5 minutes)
   */
  static get cacheTtlSeconds(): number {
    return parseInt(process.env.CACHE_TTL_SECONDS || "300", 10);
  }

  /**
   * GitHub API base URL
   */
  static get githubApiBaseUrl(): string {
    return "https://api.github.com";
  }
}
