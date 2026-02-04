import * as vscode from "vscode";
import { TelemetryService } from "../shared/services/telemetryService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { AITemplateDataService } from "../features/ai-template-files/services/aiTemplateDataService";
import { TemplateMetadataService } from "../features/ai-template-files/services/templateMetadataService";
import { UpdateStatusBarService } from "../features/extension-updates/updateStatusBarService";
import { GitHubTemplateBackupService } from "../features/backup-management/backupService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";
import { GitIgnoreConfigDeployer } from "../features/initialization/gitIgnoreConfigDeployer";
import { MCPConfigDeployer } from "../features/initialization/mcpConfigDeployer";
import { RecommendedExtensionsConfigDeployer } from "../features/initialization/recommendedExtensionsConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../features/initialization/recommendedSettingsConfigDeployer";
import { AITemplateFilesDeployer } from "../features/initialization/aiTemplateFilesDeployer";
import { WorkspaceInitPromptService } from "../features/initialization/workspaceInitPromptService";
import { WorkspaceInitializationService } from "../features/initialization/workspaceInitializationService";
import { ModeSelectionPromptService } from "../features/initialization/modeSelectionPromptService";
import { InstalledTemplatesStateManager } from "../features/ai-template-files/services/installedTemplatesStateManager";
import { RepositoryManager } from "../features/ai-template-files/services/repositoryManager";
import { ProfileService } from "../features/profile-management/services/profileService";
import { DevOpsMcpConfigService } from "../features/apm-devops/devOpsMcpConfigService";

/**
 * Service container for dependency injection
 * Holds all service instances used throughout the extension
 */
export interface ServiceContainer {
  telemetry: TelemetryService;
  mcpConfig: MCPConfigService;
  aiTemplateData: AITemplateDataService;
  templateMetadata: TemplateMetadataService;
  installedTemplatesState: InstalledTemplatesStateManager;
  updateStatusBar: UpdateStatusBarService;
  extensionUpdate: ExtensionUpdateService;
  backup: GitHubTemplateBackupService;
  gitIgnoreConfigDeployer: GitIgnoreConfigDeployer;
  mcpConfigDeployer: MCPConfigDeployer;
  recommendedExtensionsConfigDeployer: RecommendedExtensionsConfigDeployer;
  recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer;
  aiTemplateFilesDeployer: AITemplateFilesDeployer;
  workspaceInitPrompt: WorkspaceInitPromptService;
  modeSelectionPrompt: ModeSelectionPromptService;
  workspaceInitialization: WorkspaceInitializationService;
  profileService: ProfileService;
  devOpsConfig: DevOpsMcpConfigService;
}

/**
 * Initialize all services
 */
export async function initializeServices(context: vscode.ExtensionContext): Promise<ServiceContainer> {
  // Initialize telemetry service first
  const telemetry = new TelemetryService();
  await telemetry.initialize();
  telemetry.trackActivation();

  // Initialize other services
  const extensionUpdate = new ExtensionUpdateService();
  const mcpConfig = new MCPConfigService();
  const installedTemplatesState = new InstalledTemplatesStateManager(context);
  const aiTemplateData = new AITemplateDataService(installedTemplatesState);
  const repositoryManager = new RepositoryManager();
  repositoryManager.initialize();
  const templateMetadata = new TemplateMetadataService(repositoryManager);
  const backup = new GitHubTemplateBackupService();
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);
  const gitIgnoreConfigDeployer = new GitIgnoreConfigDeployer();
  const mcpConfigDeployer = new MCPConfigDeployer();
  const recommendedExtensionsConfigDeployer = new RecommendedExtensionsConfigDeployer();
  const recommendedSettingsConfigDeployer = new RecommendedSettingsConfigDeployer();
  const aiTemplateFilesDeployer = new AITemplateFilesDeployer(aiTemplateData);
  const workspaceInitPrompt = new WorkspaceInitPromptService();
  const modeSelectionPrompt = new ModeSelectionPromptService(telemetry);
  const workspaceInitialization = new WorkspaceInitializationService();
  const profileService = new ProfileService(installedTemplatesState, aiTemplateData, backup);
  const devOpsConfig = new DevOpsMcpConfigService();

  // Register for disposal
  context.subscriptions.push(aiTemplateData);
  context.subscriptions.push(telemetry);

  return {
    telemetry,
    mcpConfig,
    aiTemplateData,
    templateMetadata,
    installedTemplatesState,
    updateStatusBar,
    extensionUpdate,
    backup,
    gitIgnoreConfigDeployer,
    mcpConfigDeployer,
    recommendedExtensionsConfigDeployer,
    recommendedSettingsConfigDeployer,
    aiTemplateFilesDeployer,
    workspaceInitPrompt,
    modeSelectionPrompt,
    workspaceInitialization,
    profileService,
    devOpsConfig,
  };
}
