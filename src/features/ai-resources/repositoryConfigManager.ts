import { ItemCategory } from "./resourceCategories";
import { SettingsManager } from "../../core/settingsManager";

export interface TemplateRepositoryConfig {
  name: string;
  url: string;
  branch?: string;
  enabled: boolean;
  paths: Partial<Record<ItemCategory, string>>;
}

/**
 * Manages repository configurations from VS Code settings
 */
export class RepositoryConfigManager {
  /**
   * Get the Nexus Templates repository configuration
   */
  static getNexusTemplateRepositoryConfig(): TemplateRepositoryConfig {
    return {
      name: "Nexus Templates",
      url: "https://github.com/NexusInnovation/nexus-nexkit-templates",
      enabled: true,
      paths: {
        prompts: "prompts",
        instructions: "instructions",
        chatmodes: "chatmodes",
      },
    };
  }

  /**
   * Get all configured repositories
   */
  public static getRepositories(): TemplateRepositoryConfig[] {
    const userRepos = SettingsManager.getRepositories<TemplateRepositoryConfig>();

    // Merge with defaults, ensuring non-removable defaults are always present
    const defaultRepo = RepositoryConfigManager.getNexusTemplateRepositoryConfig();
    const merged: TemplateRepositoryConfig[] = [defaultRepo];

    // Add user repositories that aren't duplicates (all user repos are removable)
    for (const userRepo of userRepos) {
      const isDuplicate = merged.some((r) => r.url === userRepo.url);
      if (!isDuplicate) {
        merged.push(userRepo);
      }
    }

    return merged;
  }

  /**
   * Get only enabled repositories
   */
  static getEnabledRepositories(): TemplateRepositoryConfig[] {
    return RepositoryConfigManager.getRepositories().filter((r) => r.enabled);
  }
}
