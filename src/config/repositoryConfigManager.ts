import * as vscode from "vscode";
import { ItemCategory } from "../types/categories";

/**
 * Repository configuration structure
 */
export interface RepositoryConfig {
  name: string;
  url: string;
  branch?: string;
  enabled: boolean;
  paths: Partial<Record<ItemCategory, string>>;
}

/**
 * Internal repository configuration with additional metadata
 */
export interface InternalRepositoryConfig extends RepositoryConfig {
  removable: boolean;
}

/**
 * Manages repository configurations from VS Code settings
 */
export class RepositoryConfigManager {
  private static readonly CONFIG_KEY = "nexkit.repositories";

  /**
   * Get default repository configurations
   */
  static getDefaultRepositories(): InternalRepositoryConfig[] {
    return [
      {
        name: "Nexus Templates",
        url: "https://github.com/NexusInnovation/nexus-nexkit-templates",
        enabled: true,
        removable: false,
        paths: {
          prompts: "prompts",
          instructions: "instructions",
          chatmodes: "chatmodes",
        },
      },
      {
        name: "Awesome Copilot",
        url: "https://github.com/github/awesome-copilot",
        enabled: true,
        removable: true,
        paths: {
          agents: "agents",
          prompts: "prompts",
          instructions: "instructions",
        },
      },
    ];
  }

  /**
   * Get all configured repositories
   */
  static getRepositories(): InternalRepositoryConfig[] {
    const config = vscode.workspace.getConfiguration();
    const userRepos = config.get<RepositoryConfig[]>(RepositoryConfigManager.CONFIG_KEY, []);

    // Merge with defaults, ensuring non-removable defaults are always present
    const defaults = RepositoryConfigManager.getDefaultRepositories();
    const merged: InternalRepositoryConfig[] = [...defaults];

    // Add user repositories that aren't duplicates (all user repos are removable)
    for (const userRepo of userRepos) {
      const isDuplicate = merged.some((r) => r.url === userRepo.url);
      if (!isDuplicate) {
        merged.push({ ...userRepo, removable: true });
      }
    }

    return merged;
  }

  /**
   * Get only enabled repositories
   */
  static getEnabledRepositories(): InternalRepositoryConfig[] {
    return RepositoryConfigManager.getRepositories().filter((r) => r.enabled);
  }

  // todo: is this useful ?

  // /**
  //  * Save repository configurations
  //  */
  // static async saveRepositories(
  //   repositories: InternalRepositoryConfig[]
  // ): Promise<void> {
  //   const config = vscode.workspace.getConfiguration();

  //   // Only save user-added repositories (exclude defaults)
  //   const defaults = RepositoryConfigManager.getDefaultRepositories();
  //   const userRepos = repositories.filter(
  //     (repo) => !defaults.some((d) => d.url === repo.url) && repo.removable
  //   );

  //   // Convert to public format (without removable flag)
  //   const publicRepos: RepositoryConfig[] = userRepos.map(repo => ({
  //     name: repo.name,
  //     url: repo.url,
  //     branch: repo.branch,
  //     enabled: repo.enabled,
  //     paths: repo.paths,
  //   }));

  //   await config.update(
  //     RepositoryConfigManager.CONFIG_KEY,
  //     publicRepos,
  //     vscode.ConfigurationTarget.Global
  //   );
  // }

  // /**
  //  * Add a new repository
  //  */
  // static async addRepository(repository: RepositoryConfig): Promise<void> {
  //   const repositories = RepositoryConfigManager.getRepositories();
  //   // Add as removable since it's user-added
  //   const internalRepo: InternalRepositoryConfig = { ...repository, removable: true };
  //   repositories.push(internalRepo);
  //   await RepositoryConfigManager.saveRepositories(repositories);
  // }

  // /**
  //  * Remove a repository (only if removable)
  //  */
  // static async removeRepository(url: string): Promise<boolean> {
  //   const repositories = RepositoryConfigManager.getRepositories();
  //   const index = repositories.findIndex((r) => r.url === url && r.removable);

  //   if (index === -1) {
  //     return false; // Not found or not removable
  //   }

  //   repositories.splice(index, 1);
  //   await RepositoryConfigManager.saveRepositories(repositories);
  //   return true;
  // }

  // /**
  //  * Update repository enabled state
  //  */
  // static async setRepositoryEnabled(
  //   url: string,
  //   enabled: boolean
  // ): Promise<void> {
  //   const repositories = RepositoryConfigManager.getRepositories();
  //   const repo = repositories.find((r) => r.url === url);

  //   if (repo) {
  //     repo.enabled = enabled;
  //     await RepositoryConfigManager.saveRepositories(repositories);
  //   }
  // }
}
