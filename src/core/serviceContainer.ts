import * as vscode from "vscode";
import { TelemetryService } from "../shared/services/telemetryService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { MultiRepositoryAggregatorService } from "../features/ai-resources/multiRepositoryAggregatorService";
import { WorkspaceAIResourceService } from "../features/ai-resources/workspaceAIResourceService";
import { UpdateStatusBarService } from "../features/extension-updates/updateStatusBarService";
import { BackupService } from "../features/backup-management/backupService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";
import { GitIgnoreConfigDeployer } from "../features/initialization/gitIgnoreConfigDeployer";
import { MCPConfigDeployer } from "../features/initialization/mcpConfigDeployer";
import { RecommendedExtensionsConfigDeployer } from "../features/initialization/recommendedExtensionsConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../features/initialization/recommendedSettingsConfigDeployer";
import { AITemplateFilesDeployer } from "../features/initialization/aiTemplateFilesDeployer";

/**
 * Service container for dependency injection
 * Holds all service instances used throughout the extension
 */
export interface ServiceContainer {
  telemetry: TelemetryService;
  mcpConfig: MCPConfigService;
  repositoryAggregator: MultiRepositoryAggregatorService;
  workspaceAIResource: WorkspaceAIResourceService;
  updateStatusBar: UpdateStatusBarService;
  extensionUpdate: ExtensionUpdateService;
  backup: BackupService;
  gitIgnoreConfigDeployer: GitIgnoreConfigDeployer;
  mcpConfigDeployer: MCPConfigDeployer;
  recommendedExtensionsConfigDeployer: RecommendedExtensionsConfigDeployer;
  recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer;
  aiTemplateFilesDeployer: AITemplateFilesDeployer;
}

/**
 * Initialize all services
 */
export async function initializeServices(context: vscode.ExtensionContext): Promise<ServiceContainer> {
  // Initialize telemetry service first
  const telemetry = new TelemetryService(context);
  await telemetry.initialize();
  telemetry.trackActivation();
  context.subscriptions.push(telemetry);

  // Initialize other services
  const extensionUpdate = new ExtensionUpdateService();
  const mcpConfig = new MCPConfigService();
  const repositoryAggregator = new MultiRepositoryAggregatorService();
  const workspaceAIResource = new WorkspaceAIResourceService();
  const backup = new BackupService();
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);
  const gitIgnoreConfigDeployer = new GitIgnoreConfigDeployer();
  const mcpConfigDeployer = new MCPConfigDeployer();
  const recommendedExtensionsConfigDeployer = new RecommendedExtensionsConfigDeployer();
  const recommendedSettingsConfigDeployer = new RecommendedSettingsConfigDeployer();
  const aiTemplateFilesDeployer = new AITemplateFilesDeployer();

  return {
    telemetry,
    mcpConfig,
    repositoryAggregator,
    workspaceAIResource,
    updateStatusBar,
    extensionUpdate,
    backup,
    gitIgnoreConfigDeployer,
    mcpConfigDeployer,
    recommendedExtensionsConfigDeployer,
    recommendedSettingsConfigDeployer,
    aiTemplateFilesDeployer,
  };
}
