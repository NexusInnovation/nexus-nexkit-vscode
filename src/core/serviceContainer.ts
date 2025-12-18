import * as vscode from "vscode";
import { TelemetryService } from "../shared/services/telemetryService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { MultiRepositoryAggregatorService } from "../features/ai-resources/multiRepositoryAggregatorService";
import { WorkspaceAIResourceService } from "../features/ai-resources/workspaceAIResourceService";
import { StatusBarService } from "../features/extension-updates/updateStatusBarService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";
import { BackupService } from "../features/backup-management/backupService";
import { GitIgnoreService } from "../features/initialization/gitIgnoreService";
import { VscodeWorkspaceService } from "../features/initialization/vscodeWorkspaceService";

/**
 * Service container for dependency injection
 * Holds all service instances used throughout the extension
 */
export interface ServiceContainer {
  telemetry: TelemetryService;
  mcpConfig: MCPConfigService;
  repositoryAggregator: MultiRepositoryAggregatorService;
  workspaceAIResource: WorkspaceAIResourceService;
  statusBar: StatusBarService;
  extensionUpdate: ExtensionUpdateService;
  backup: BackupService;
  gitIgnore: GitIgnoreService;
  vscodeWorkspace: VscodeWorkspaceService;
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
  const services: ServiceContainer = {
    telemetry,
    mcpConfig: new MCPConfigService(),
    repositoryAggregator: new MultiRepositoryAggregatorService(),
    workspaceAIResource: new WorkspaceAIResourceService(),
    statusBar: new StatusBarService(context),
    extensionUpdate: new ExtensionUpdateService(),
    backup: new BackupService(),
    gitIgnore: new GitIgnoreService(),
    vscodeWorkspace: new VscodeWorkspaceService(context),
  };

  return services;
}
