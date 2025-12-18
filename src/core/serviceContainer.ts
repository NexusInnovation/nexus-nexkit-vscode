import * as vscode from "vscode";
import { TelemetryService } from "../shared/services/telemetryService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { AITemplateFilesManagerService } from "../features/ai-template-files/aiTemplateFilesManagerService";
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
  aiTemplateFilesManager: AITemplateFilesManagerService;
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
  const aiTemplateFilesManager = new AITemplateFilesManagerService();
  const backup = new BackupService();
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);
  const gitIgnoreConfigDeployer = new GitIgnoreConfigDeployer();
  const mcpConfigDeployer = new MCPConfigDeployer();
  const recommendedExtensionsConfigDeployer = new RecommendedExtensionsConfigDeployer();
  const recommendedSettingsConfigDeployer = new RecommendedSettingsConfigDeployer();
  const aiTemplateFilesDeployer = new AITemplateFilesDeployer(aiTemplateFilesManager);

  return {
    telemetry,
    mcpConfig,
    aiTemplateFilesManager,
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
