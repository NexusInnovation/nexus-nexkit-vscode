/**
 * Service for deploying .gitignore file to workspace
 */
export class GitIgnoreConfigDeployer {
  /**
   * No-op: Nexkit no longer writes to project .gitignore
   */
  public async deployGitignore(_targetRoot: string): Promise<void> {
    return;
  }
}
