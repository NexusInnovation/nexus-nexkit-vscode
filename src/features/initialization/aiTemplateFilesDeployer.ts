import { AITemplateFileType } from "../ai-template-files/aiTemplateFile";
import { AITemplateFilesManagerService } from "../ai-template-files/aiTemplateFilesManagerService";
import { RepositoryTemplateConfigManager } from "../ai-template-files/repositoryTemplateConfigManagerService";

export type DeploymentSummary = {
  installed: number;
  failed: number;
  types: Record<AITemplateFileType, number>;
};

/**
 * Service to deploy ai template files (agents, prompts, instructions, chatmodes) in the workspace
 */
export class AITemplateFilesDeployer {
  constructor(private readonly _aiTemplateFilesManager: AITemplateFilesManagerService) {}

  /**
   * Deploy ai template files from the Nexus Templates repository. Installs all agents, chatmodes and prompts (excludes instructions)
   */
  async deployTemplateFiles(): Promise<DeploymentSummary> {
    const summary = {
      installed: 0,
      failed: 0,
      types: {} as Record<AITemplateFileType, number>,
    };

    try {
      // Fetch all templates from the repository
      const allTemplates = await this._aiTemplateFilesManager.fetchTemplates(
        RepositoryTemplateConfigManager.NexusTemplateRepoName
      );

      // Filter out instructions
      const templatesToDeploy = allTemplates.filter((template) => template.type !== "instructions");

      // Install each template in parallel
      const installPromises = templatesToDeploy.map(async (template) => {
        try {
          // Install the template (silent mode)
          await this._aiTemplateFilesManager.installTemplate(template, true);

          return { success: true, template };
        } catch (error) {
          console.error(`Failed to deploy ${template.name} from ${template.type}:`, error);
          return { success: false, template, error };
        }
      });

      // Wait for all installations to complete
      const results = await Promise.allSettled(installPromises);

      // Process results and update summary
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { success, template } = result.value;
          if (success) {
            summary.installed++;
            summary.types[template.type] = (summary.types[template.type] || 0) + 1;
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
