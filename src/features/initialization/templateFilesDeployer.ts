import { GitHubRepositoryService } from "../ai-resources/gitHubRepositoryService";
import { RepositoryConfigManager } from "../ai-resources/repositoryConfigManager";
import { ItemCategory } from "../ai-resources/resourceCategories";
import { WorkspaceAIResourceService } from "../ai-resources/workspaceAIResourceService";

/**
 * Service to deploy template files (agents, prompts, instructions, chatmodes) in the workspace
 */
export class TemplateFilesDeployer {
  /**
   * Deploy template files from the Nexus Templates repository. Installs all agents, chatmodes and prompts (excludes instructions)
   */
  async deployTemplateFiles(): Promise<{ installed: number; failed: number; categories: Record<ItemCategory, number> }> {
    const summary = {
      installed: 0,
      failed: 0,
      categories: {} as Record<ItemCategory, number>,
    };

    try {
      // Get the default Nexus Templates repository configuration
      const defaultRepo = RepositoryConfigManager.getDefaultRepository();

      if (!defaultRepo) {
        console.error("No default repository found for deploying resources.");
        return summary;
      }

      const githubService = new GitHubRepositoryService(defaultRepo);
      const workspaceAIResourceService = new WorkspaceAIResourceService();

      // Fetch all items from the repository
      const allItems = await githubService.fetchAllItems();

      // Filter out instructions
      const itemsToDeploy = allItems.filter((item) => item.category !== "instructions");

      // Install each item in parallel
      const installPromises = itemsToDeploy.map(async (item) => {
        try {
          // Download file content
          const content = await githubService.downloadFile(item);

          // Install the item (silent mode)
          await workspaceAIResourceService.installItem(item, content, true);

          return { success: true, item };
        } catch (error) {
          console.error(`Failed to deploy ${item.name} from ${item.category}:`, error);
          return { success: false, item, error };
        }
      });

      // Wait for all installations to complete
      const results = await Promise.allSettled(installPromises);

      // Process results and update summary
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { success, item } = result.value;
          if (success) {
            summary.installed++;
            summary.categories[item.category] = (summary.categories[item.category] || 0) + 1;
          } else {
            summary.failed++;
          }
        } else {
          summary.failed++;
        }
      }
    } catch (error) {
      console.error("Failed to deploy default resources:", error);
      // Don't throw, return summary as-is
    }

    return summary;
  }
}
