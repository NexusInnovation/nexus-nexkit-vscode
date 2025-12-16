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
}
