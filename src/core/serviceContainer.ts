import * as vscode from "vscode";
import { TelemetryService } from "../shared/services/telemetryService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { MultiRepositoryAggregatorService } from "../features/ai-resources/multiRepositoryAggregatorService";
import { WorkspaceAIResourceService } from "../features/ai-resources/workspaceAIResourceService";
import { UpdateStatusBarService } from "../features/extension-updates/updateStatusBarService";
import { BackupService } from "../features/backup-management/backupService";
import { GitIgnoreService } from "../features/initialization/gitIgnoreService";
import { VscodeWorkspaceService } from "../features/initialization/vscodeWorkspaceService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";

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
  const extensionUpdate = new ExtensionUpdateService();
  const mcpConfig = new MCPConfigService();
  const repositoryAggregator = new MultiRepositoryAggregatorService();
  const workspaceAIResource = new WorkspaceAIResourceService();
  const backup = new BackupService();
  const gitIgnore = new GitIgnoreService();
  const vscodeWorkspace = new VscodeWorkspaceService(context);
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);

  return {
    telemetry,
    mcpConfig,
    repositoryAggregator,
    workspaceAIResource,
    updateStatusBar,
    extensionUpdate,
    backup,
    gitIgnore,
    vscodeWorkspace,
  };
}
