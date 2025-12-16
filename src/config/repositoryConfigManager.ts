import * as vscode from "vscode";
import { ItemCategory } from "../types/categories";
import { SettingsManager } from "./settingsManager";

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
  /**
   * Get default repository configurations
   */
  static getDefaultRepository(): InternalRepositoryConfig {
    return {
      name: "Nexus Templates",
      url: "https://github.com/NexusInnovation/nexus-nexkit-templates",
      enabled: true,
      removable: false,
      paths: {
        prompts: "prompts",
        instructions: "instructions",
        chatmodes: "chatmodes",
      },
    };
  }

  /**
   * Get Awesome Copilot repository configuration
   */
  static getAwesomeCopilotRepository(): RepositoryConfig {
    return {
      name: "Awesome Copilot",
      url: "https://github.com/github/awesome-copilot",
      enabled: true,
      paths: {
        agents: "agents",
        prompts: "prompts",
        instructions: "instructions",
      },
    };
  }

  /**
   * Get all configured repositories
   */
  static getRepositories(): InternalRepositoryConfig[] {
    const userRepos = SettingsManager.getRepositories<RepositoryConfig>();

    // Merge with defaults, ensuring non-removable defaults are always present
    const defaultRepo = RepositoryConfigManager.getDefaultRepository();
    const merged: InternalRepositoryConfig[] = [defaultRepo];

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
