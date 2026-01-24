import { SettingsManager } from "../../../core/settingsManager";
import { AITemplateFileType } from "./aiTemplateFile";

/**
 * Repository type - either GitHub-based or local folder
 */
export type RepositoryType = "github" | "local";

/**
 * Configuration required for a template repository (GitHub or local folder)
 * Users can add custom repositories in the extension settings
 */
export interface RepositoryConfig {
  name: string; // Display name for the repository
  type?: RepositoryType; // Repository type (default: "github")
  url: string; // GitHub repository URL or local folder path
  branch?: string; // Branch to fetch content from (default: "main") - only applies to GitHub repositories
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
      type: "github",
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
      // Normalize type field (default to 'github' if not specified)
      const normalizedRepo: RepositoryConfig = {
        ...userRepo,
        type: userRepo.type || "github",
      };

      // Validate repository configuration
      const validation = RepositoryConfigManager.validateRepository(normalizedRepo);
      if (!validation.valid) {
        console.warn(`⚠️ Invalid repository configuration: "${normalizedRepo.name}". ${validation.error}. Skipping repository.`);
        continue;
      }

      const isDuplicateUrl = merged.some((r) => r.url === normalizedRepo.url);
      if (!isDuplicateUrl) {
        // Check for duplicate name
        if (seenNames.has(normalizedRepo.name)) {
          console.warn(
            `⚠️ Duplicate repository name detected: "${normalizedRepo.name}". Repository names must be unique. Skipping repository with URL: ${normalizedRepo.url}`
          );
          continue;
        }

        merged.push(normalizedRepo);
        seenNames.add(normalizedRepo.name);
        seenUrls.add(normalizedRepo.url);
      } else {
        console.warn(`⚠️ Duplicate repository URL detected: "${normalizedRepo.url}". This repository is already configured.`);
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

  /**
   * Validate a repository configuration
   */
  public static validateRepository(config: RepositoryConfig): { valid: boolean; error?: string } {
    const type = config.type || "github";

    // Validate GitHub repositories
    if (type === "github") {
      if (!config.url.includes("github.com")) {
        return {
          valid: false,
          error: `GitHub repository URL must contain "github.com". Got: ${config.url}`,
        };
      }
    }

    // Validate local repositories
    if (type === "local") {
      if (config.url.includes("github.com") || config.url.startsWith("http://") || config.url.startsWith("https://")) {
        return {
          valid: false,
          error: `Local repository must use a file path, not a URL. Got: ${config.url}`,
        };
      }
    }

    return { valid: true };
  }
}
