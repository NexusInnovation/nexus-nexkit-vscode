import { SettingsManager } from "../../core/settingsManager";
import { AITemplateFileType } from "./aiTemplateFile";

/**
 * Configuration required for a template GitHub repository (users can add custom ones in the extension settings)
 */
export interface RepositoryTemplateConfig {
  name: string; // Display name for the repository
  url: string; // GitHub repository URL
  branch?: string; // Branch to fetch content from (default: "main")
  paths: Partial<Record<AITemplateFileType, string>>; // Paths for each file template type in the repository (e.g., { agents: "agents/", prompts: "prompts/" })
  enabled: boolean; // Whether the repository is enabled
}

/**
 * Manages repository configurations from VS Code settings
 */
export class RepositoryTemplateConfigManager {
  public static readonly NexusTemplateRepoName = "Nexus Templates";

  /**
   * Get the Nexus Templates repository configuration
   */
  public static getNexusTemplateRepositoryConfig(): RepositoryTemplateConfig {
    return {
      name: RepositoryTemplateConfigManager.NexusTemplateRepoName,
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
  public static getRepositories(): RepositoryTemplateConfig[] {
    const userRepos = SettingsManager.getRepositories<RepositoryTemplateConfig>();

    // Merge with defaults, ensuring non-removable defaults are always present
    const defaultRepo = RepositoryTemplateConfigManager.getNexusTemplateRepositoryConfig();
    const merged: RepositoryTemplateConfig[] = [defaultRepo];

    // Track names and URLs to detect duplicates
    const seenNames = new Set<string>([defaultRepo.name]);
    const seenUrls = new Set<string>([defaultRepo.url]);

    // Add user repositories that aren't duplicates (all user repos are removable)
    for (const userRepo of userRepos) {
      const isDuplicateUrl = merged.some((r) => r.url === userRepo.url);
      if (!isDuplicateUrl) {
        // Check for duplicate name
        if (seenNames.has(userRepo.name)) {
          console.warn(
            `⚠️ Duplicate repository name detected: "${userRepo.name}". Repository names must be unique. Skipping repository with URL: ${userRepo.url}`
          );
          continue;
        }

        merged.push(userRepo);
        seenNames.add(userRepo.name);
        seenUrls.add(userRepo.url);
      } else {
        console.warn(`⚠️ Duplicate repository URL detected: "${userRepo.url}". This repository is already configured.`);
      }
    }

    return merged;
  }

  /**
   * Get only enabled repositories
   */
  static getEnabledRepositories(): RepositoryTemplateConfig[] {
    return RepositoryTemplateConfigManager.getRepositories().filter((r) => r.enabled);
  }
}
