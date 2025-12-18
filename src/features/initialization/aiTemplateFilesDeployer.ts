import { AITemplateDataService } from "../ai-template-files/services/aiTemplateDataService";
import { RepositoryConfigManager } from "../ai-template-files/models/repositoryConfig";
import { BatchInstallSummary } from "../ai-template-files/services/templateFileOperations";

/**
 * Service to deploy AI template files during initialization
 * Separates deployment logic from the main data service
 */
export class AITemplateFilesDeployer {
  constructor(private readonly templateDataService: AITemplateDataService) {}

  /**
   * Deploy AI template files from the Nexus Templates repository
   * Installs all agents, chatmodes and prompts (excludes instructions)
   */
  public async deployTemplateFiles(): Promise<BatchInstallSummary | null> {
    try {
      // Wait for data service to be ready
      await this.templateDataService.waitForReady();

      // Get templates from the Nexus repository
      const templates = this.templateDataService.getTemplatesByRepository(RepositoryConfigManager.NEXUS_TEMPLATE_REPO_NAME);

      // Filter out instructions (we don't want to install them by default)
      const templatesToDeploy = templates.filter((template) => template.type !== "instructions");

      if (templatesToDeploy.length === 0) {
        console.warn("No templates found to deploy from Nexus Templates repository");
        return null;
      }

      return await this.templateDataService.installBatch(templatesToDeploy, { silent: true, overwrite: true });
    } catch (error) {
      console.error("Failed to deploy default resources:", error);
      return null;
    }
  }
}
