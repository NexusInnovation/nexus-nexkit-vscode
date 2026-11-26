import * as path from "path";
import * as vscode from "vscode";
import { LoggingService } from "../shared/services/loggingService";
import { TelemetryService } from "../shared/services/telemetryService";
import { ConfirmationService } from "../shared/services/confirmationService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { MarketplaceService } from "../features/marketplace-management/marketplaceService";
import { MarketplacePluginReader } from "../features/marketplace-management/marketplacePluginReader";
import { VsCodePluginEnablementReader } from "../features/marketplace-management/vsCodePluginEnablementReader";
import { UserDirectoryService } from "../shared/services/userDirectoryService";
import { UpdateStatusBarService } from "../features/extension-updates/updateStatusBarService";
import { GitHubTemplateBackupService } from "../features/backup-management/backupService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";
import { GitExcludeConfigDeployer } from "../features/initialization/gitExcludeConfigDeployer";
import { MCPConfigDeployer } from "../features/initialization/mcpConfigDeployer";
import { RecommendedExtensionsConfigDeployer } from "../features/initialization/recommendedExtensionsConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../features/initialization/recommendedSettingsConfigDeployer";
import { WorkspaceInitPromptService } from "../features/initialization/workspaceInitPromptService";
import { WorkspaceInitializationService } from "../features/initialization/workspaceInitializationService";
import { ModeSelectionPromptService } from "../features/initialization/modeSelectionPromptService";
import { ModeSelectionService } from "../features/initialization/modeSelectionService";
import { DevOpsMcpConfigService } from "../features/apm-devops/devOpsMcpConfigService";
import { CommitMessageService } from "../features/commit-management/commitMessageService";
import { GitHubAuthPromptService } from "../features/initialization/githubAuthPromptService";
import { StartupVerificationService } from "../features/initialization/startupVerificationService";
import { GitHubWorkflowRunnerService } from "../features/github-workflow-runner/githubWorkflowRunnerService";
import { HooksConfigDeployer } from "../features/initialization/hooksConfigDeployer";
import { ConvertToMarkdownPanelService } from "../features/convert-to-markdown/convertToMarkdownPanelService";
import { MarkitdownConversionService } from "../features/convert-to-markdown/markitdownConversionService";
import { GitHooksService } from "../features/git-hooks-management";
import { AzureDevOpsAuthService } from "../features/devops-branch-creation/azureDevOpsAuthService";
import { AzureDevOpsRestClient } from "../features/devops-branch-creation/azureDevOpsRestClient";
import { DevOpsBranchCreationService } from "../features/devops-branch-creation/devOpsBranchCreationService";
import { DevOpsAuthProvider } from "../features/devops-pipelines/devOpsAuthProvider";
import { DevOpsBuildsClient } from "../features/devops-pipelines/devOpsBuildsClient";
import { DevOpsPipelinesPanelService } from "../features/devops-pipelines/devOpsPipelinesPanelService";
import { BuildLogViewService } from "../features/devops-pipelines/buildLogViewService";
import { BuildActivityBadgeService } from "../features/devops-pipelines/buildActivityBadgeService";
import { DevOpsProjectBrowserService } from "../features/apm-devops/devOpsProjectBrowserService";
import { DevOpsProjectDiscoveryClient } from "../features/apm-devops/devOpsProjectDiscoveryClient";
import { AiCreditUsageService } from "../features/ai-credit-usage/services/aiCreditUsageService";
import { AiCreditStatusBarService } from "../features/ai-credit-usage/services/aiCreditStatusBarService";

/**
 * Service container for dependency injection
 * Holds all service instances used throughout the extension
 */
export interface ServiceContainer {
  logging: LoggingService;
  telemetry: TelemetryService;
  confirmation: ConfirmationService;
  mcpConfig: MCPConfigService;
  updateStatusBar: UpdateStatusBarService;
  extensionUpdate: ExtensionUpdateService;
  backup: GitHubTemplateBackupService;
  gitExcludeConfigDeployer: GitExcludeConfigDeployer;
  mcpConfigDeployer: MCPConfigDeployer;
  recommendedExtensionsConfigDeployer: RecommendedExtensionsConfigDeployer;
  recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer;
  workspaceInitPrompt: WorkspaceInitPromptService;
  modeSelectionPrompt: ModeSelectionPromptService;
  workspaceInitialization: WorkspaceInitializationService;
  modeSelection: ModeSelectionService;
  devOpsConfig: DevOpsMcpConfigService;
  marketplace: MarketplaceService;
  commitMessage: CommitMessageService;
  githubAuthPrompt: GitHubAuthPromptService;
  hooksConfigDeployer: HooksConfigDeployer;
  startupVerification: StartupVerificationService;
  githubWorkflowRunner: GitHubWorkflowRunnerService;
  convertToMarkdown: ConvertToMarkdownPanelService;
  markitdownConversion: MarkitdownConversionService;
  gitHooks: GitHooksService;
  devOpsBranchCreation: DevOpsBranchCreationService;
  devOpsPipelines: DevOpsPipelinesPanelService;
  devOpsBuildLog: BuildLogViewService;
  devOpsBuildBadge: BuildActivityBadgeService;
  devOpsProjectBrowser: DevOpsProjectBrowserService;
  aiCreditUsage: AiCreditUsageService;
  aiCreditStatusBar: AiCreditStatusBarService;
}

/**
 * Initialize all services
 */
export async function initializeServices(context: vscode.ExtensionContext): Promise<ServiceContainer> {
  // Initialize logging service first
  const logging = LoggingService.getInstance();
  logging.info("Initializing Nexkit extension services...");

  // Initialize telemetry service
  const telemetry = new TelemetryService();
  await telemetry.initialize();
  telemetry.trackActivation();

  // Initialize other services
  const extensionUpdate = new ExtensionUpdateService();
  const confirmation = new ConfirmationService();
  const mcpConfig = new MCPConfigService(confirmation);
  const userDirectory = new UserDirectoryService();
  const backup = new GitHubTemplateBackupService(userDirectory);
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);
  const gitExcludeConfigDeployer = new GitExcludeConfigDeployer();
  const mcpConfigDeployer = new MCPConfigDeployer(confirmation);
  const recommendedExtensionsConfigDeployer = new RecommendedExtensionsConfigDeployer();
  const recommendedSettingsConfigDeployer = new RecommendedSettingsConfigDeployer();
  const workspaceInitPrompt = new WorkspaceInitPromptService();
  const modeSelectionPrompt = new ModeSelectionPromptService(telemetry);
  const workspaceInitialization = new WorkspaceInitializationService();
  const modeSelection = new ModeSelectionService();
  const devOpsConfig = new DevOpsMcpConfigService();
  const marketplace = new MarketplaceService(
    new MarketplacePluginReader(),
    // VS Code's state.vscdb sits next to the per-extension global storage folders.
    new VsCodePluginEnablementReader(
      context.globalStorageUri ? path.join(path.dirname(context.globalStorageUri.fsPath), "state.vscdb") : undefined
    )
  );
  const commitMessage = new CommitMessageService();
  const githubAuthPrompt = new GitHubAuthPromptService(context.globalState);
  const hooksConfigDeployer = new HooksConfigDeployer();
  const startupVerification = new StartupVerificationService(gitExcludeConfigDeployer, hooksConfigDeployer, githubAuthPrompt);
  const githubWorkflowRunner = new GitHubWorkflowRunnerService(context.extensionUri);
  const aiCreditUsage = new AiCreditUsageService(context);
  const aiCreditStatusBar = new AiCreditStatusBarService(context, aiCreditUsage);
  const markitdownConversion = new MarkitdownConversionService(logging);
  const convertToMarkdown = new ConvertToMarkdownPanelService(context.extensionUri, markitdownConversion);
  const gitHooks = new GitHooksService();
  const azureDevOpsAuthService = new AzureDevOpsAuthService();
  const azureDevOpsRestClient = new AzureDevOpsRestClient(azureDevOpsAuthService);
  const devOpsBranchCreation = new DevOpsBranchCreationService(devOpsConfig, azureDevOpsRestClient, telemetry);
  const devOpsAuth = new DevOpsAuthProvider();
  const devOpsBuildsClient = new DevOpsBuildsClient(
    devOpsAuth,
    `nexus-nexkit-vscode/${context.extension?.packageJSON?.version ?? "unknown"}`
  );
  const devOpsBuildLog = new BuildLogViewService(context.extensionUri, devOpsBuildsClient, logging);
  const devOpsPipelines = new DevOpsPipelinesPanelService(
    context.extensionUri,
    devOpsConfig,
    devOpsBuildsClient,
    devOpsAuth,
    logging,
    telemetry,
    devOpsBuildLog
  );
  const devOpsBuildBadge = new BuildActivityBadgeService(devOpsConfig, devOpsBuildsClient, logging);
  const devOpsProjectBrowser = new DevOpsProjectBrowserService(
    new DevOpsProjectDiscoveryClient(devOpsAuth, `nexus-nexkit-vscode/${context.extension?.packageJSON?.version ?? "unknown"}`)
  );

  // Register for disposal
  context.subscriptions.push(logging);
  context.subscriptions.push(telemetry);
  context.subscriptions.push(devOpsConfig);
  context.subscriptions.push(marketplace);
  context.subscriptions.push(convertToMarkdown);
  context.subscriptions.push(devOpsPipelines);
  context.subscriptions.push(devOpsBuildLog);
  context.subscriptions.push(devOpsBuildBadge);
  context.subscriptions.push(aiCreditUsage);
  context.subscriptions.push(aiCreditStatusBar);

  logging.info("All services initialized successfully");

  return {
    logging,
    telemetry,
    confirmation,
    mcpConfig,
    updateStatusBar,
    extensionUpdate,
    backup,
    gitExcludeConfigDeployer,
    mcpConfigDeployer,
    recommendedExtensionsConfigDeployer,
    recommendedSettingsConfigDeployer,
    workspaceInitPrompt,
    modeSelectionPrompt,
    workspaceInitialization,
    modeSelection,
    devOpsConfig,
    marketplace,
    commitMessage,
    githubAuthPrompt,
    hooksConfigDeployer,
    startupVerification,
    githubWorkflowRunner,
    convertToMarkdown,
    markitdownConversion,
    gitHooks,
    devOpsBranchCreation,
    devOpsPipelines,
    devOpsBuildLog,
    devOpsBuildBadge,
    devOpsProjectBrowser,
    aiCreditUsage,
    aiCreditStatusBar,
  };
}
