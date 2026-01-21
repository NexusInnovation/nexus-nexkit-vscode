import { SettingsManager } from "../../../core/settingsManager";
import { AITemplateFileType } from "./aiTemplateFile";

/**
 * Configuration required for a template GitHub repository (users can add custom ones in the extension settings)
 */
export interface RepositoryConfig {
  name: string; // Display name for the repository
  url: string; // GitHub repository URL
  branch?: string; // Branch to fetch content from (default: "main")
  paths: Partial<Record<AITemplateFileType, string>>; // Paths for each file template type in the repository (e.g., { agents: "agents/", prompts: "prompts/" })
  enabled: boolean; // Whether the repository is enabled
}

/**
 * Manages repository configurations from VS Code settings
 */
export class RepositoryConfigManager {
  public static readonly NEXUS_TEMPLATE_REPO_NAME = "Nexus Templates";

  /**
   * Get the Nexus Templates repository configuration (default repository)
   */
  public static getNexusTemplateRepositoryConfig(): RepositoryConfig {
    return {
      name: RepositoryConfigManager.NEXUS_TEMPLATE_REPO_NAME,
      url: "https://github.com/NexusInnovation/nexus-nexkit-templates",
      enabled: true,
      paths: {
        prompts: "prompts",
        skills: "skills",
        instructions: "instructions",
        agents: "agents",
      },
    };
  }

  /**
   * Get all configured repositories (default + user-defined)
   */
  public static getRepositories(): RepositoryConfig[] {
    const userRepos = SettingsManager.getRepositories<RepositoryConfig>();

    // Merge with defaults, ensuring non-removable defaults are always present
    const defaultRepo = RepositoryConfigManager.getNexusTemplateRepositoryConfig();
    const merged: RepositoryConfig[] = [defaultRepo];

    // Track names and URLs to detect duplicates
    const seenNames = new Set<string>([defaultRepo.name]);
    const seenUrls = new Set<string>([defaultRepo.url]);

    // Add user repositories that aren't duplicates
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
  public static getEnabledRepositories(): RepositoryConfig[] {
    return RepositoryConfigManager.getRepositories().filter((r) => r.enabled);
  }
}
