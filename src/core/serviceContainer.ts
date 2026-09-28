import * as vscode from "vscode";
import { LoggingService } from "../shared/services/loggingService";
import { TelemetryService } from "../shared/services/telemetryService";
import { ConfirmationService } from "../shared/services/confirmationService";
import { MCPConfigService } from "../features/mcp-management/mcpConfigService";
import { AITemplateDataService } from "../features/ai-template-files/services/aiTemplateDataService";
import { TemplateMetadataService } from "../features/ai-template-files/services/templateMetadataService";
import { UpdateStatusBarService } from "../features/extension-updates/updateStatusBarService";
import { GitHubTemplateBackupService } from "../features/backup-management/backupService";
import { ExtensionUpdateService } from "../features/extension-updates/extensionUpdateService";
import { GitExcludeConfigDeployer } from "../features/initialization/gitExcludeConfigDeployer";
import { MCPConfigDeployer } from "../features/initialization/mcpConfigDeployer";
import { RecommendedExtensionsConfigDeployer } from "../features/initialization/recommendedExtensionsConfigDeployer";
import { RecommendedSettingsConfigDeployer } from "../features/initialization/recommendedSettingsConfigDeployer";
import { AITemplateFilesDeployer } from "../features/initialization/aiTemplateFilesDeployer";
import { WorkspaceInitPromptService } from "../features/initialization/workspaceInitPromptService";
import { WorkspaceInitializationService } from "../features/initialization/workspaceInitializationService";
import { ModeSelectionPromptService } from "../features/initialization/modeSelectionPromptService";
import { InstalledTemplatesStateManager } from "../features/ai-template-files/services/installedTemplatesStateManager";
import { ProfileService } from "../features/profile-management/services/profileService";
import { ModeSelectionService } from "../features/initialization/modeSelectionService";
import { DevOpsMcpConfigService } from "../features/apm-devops/devOpsMcpConfigService";
import { NexkitFileMigrationService } from "../features/initialization/nexkitFileMigrationService";
import { CommitMessageService } from "../features/commit-management/commitMessageService";
import { TemplateMetadataScannerService } from "../features/ai-template-files/services/templateMetadataScannerService";
import { GitHubAuthPromptService } from "../features/initialization/githubAuthPromptService";
import { StartupVerificationService } from "../features/initialization/startupVerificationService";
import { NexkitFileWatcherService } from "../features/nexkit-file-watcher/nexkitFileWatcherService";
import { GitHubWorkflowRunnerService } from "../features/github-workflow-runner/githubWorkflowRunnerService";
import { HooksConfigDeployer } from "../features/initialization/hooksConfigDeployer";
import { UserDirectoryService } from "../features/ai-template-files/services/userDirectoryService";
import { ConvertToMarkdownPanelService } from "../features/convert-to-markdown/convertToMarkdownPanelService";
import { MarkitdownConversionService } from "../features/convert-to-markdown/markitdownConversionService";
import { SquadDetectionService } from "../features/squad/services/squadDetectionService";
import { SquadCliService } from "../features/squad/services/squadCliService";
import { SquadFileService } from "../features/squad/services/squadFileService";
import { SquadPresetProvider } from "../features/squad/models";
import { CompositeSquadPresetProvider } from "../features/squad/services/compositeSquadPresetProvider";
import { NexusMarketplacePresetProvider } from "../features/squad/services/nexusMarketplacePresetProvider";
import { ExternalRepoPresetProvider } from "../features/squad/services/externalRepoPresetProvider";
import { SquadPresetDownloadService } from "../features/squad/services/squadPresetDownloadService";
import { SquadInitService } from "../features/squad/services/squadInitService";
import { SquadUpstreamService } from "../features/squad/services/squadUpstreamService";
import { SquadUpdateService } from "../features/squad/services/squadUpdateService";
import { SquadExportService } from "../features/squad/services/squadExportService";
import { SquadFileWriteService } from "../features/squad/services/squadFileWriteService";
import { SquadPluginService } from "../features/squad/services/squadPluginService";

/**
 * Service container for dependency injection
 * Holds all service instances used throughout the extension
 */
export interface ServiceContainer {
  logging: LoggingService;
  telemetry: TelemetryService;
  confirmation: ConfirmationService;
  mcpConfig: MCPConfigService;
  aiTemplateData: AITemplateDataService;
  templateMetadata: TemplateMetadataService;
  installedTemplatesState: InstalledTemplatesStateManager;
  updateStatusBar: UpdateStatusBarService;
  extensionUpdate: ExtensionUpdateService;
  backup: GitHubTemplateBackupService;
  gitExcludeConfigDeployer: GitExcludeConfigDeployer;
  mcpConfigDeployer: MCPConfigDeployer;
  recommendedExtensionsConfigDeployer: RecommendedExtensionsConfigDeployer;
  recommendedSettingsConfigDeployer: RecommendedSettingsConfigDeployer;
  aiTemplateFilesDeployer: AITemplateFilesDeployer;
  workspaceInitPrompt: WorkspaceInitPromptService;
  modeSelectionPrompt: ModeSelectionPromptService;
  workspaceInitialization: WorkspaceInitializationService;
  profileService: ProfileService;
  modeSelection: ModeSelectionService;
  devOpsConfig: DevOpsMcpConfigService;
  nexkitFileMigration: NexkitFileMigrationService;
  commitMessage: CommitMessageService;
  templateMetadataScanner: TemplateMetadataScannerService;
  githubAuthPrompt: GitHubAuthPromptService;
  hooksConfigDeployer: HooksConfigDeployer;
  startupVerification: StartupVerificationService;
  nexkitFileWatcher: NexkitFileWatcherService;
  githubWorkflowRunner: GitHubWorkflowRunnerService;
  userDirectory: UserDirectoryService;
  convertToMarkdown: ConvertToMarkdownPanelService;
  markitdownConversion: MarkitdownConversionService;
  squadDetection: SquadDetectionService;
  /**
   * Safe, allowlisted wrapper over the Squad CLI (SQD-005). Constructed lazily
   * with no activation work; each invocation resolves the configured CLI source
   * and spawns on demand.
   */
  squadCli: SquadCliService;
  /**
   * Read-only accessor for the workspace `.squad/` directory. Undefined when no
   * workspace folder is open, since the service is bound to a folder root.
   */
  squadFile?: SquadFileService;

  /**
   * Controlled writer for allowlisted Squad markdown files. Undefined when no
   * workspace folder is open; every write invokes BackupService first (SQD-026).
   */
  squadWrite?: SquadFileWriteService;

  /**
   * Read-only Squad plugin inventory (SQD-038): marketplaces from
   * `.squad/plugins/marketplaces.json` and installed plugins from the Squad
   * CLI when available.
   */
  squadPlugins?: SquadPluginService;

  /**
   * Aggregated Squad preset source (SQD-019). Lazily constructed on first
   * access so activation performs no preset discovery or network work; the
   * discovery itself only runs when the panel requests the preset list.
   */
  readonly squadPresets: SquadPresetProvider;

  /**
   * Initialise Squad from a selected preset with a prior backup (SQD-020,
   * FR-014/FR-006). Lazily constructed on first access — no activation work.
   */
  readonly squadInit: SquadInitService;

  /**
   * Squad upstream add/list/sync/remove via the Squad CLI (SQD-036,
   * FR-031/FR-032). Lazily constructed on first access — no activation work.
   */
  readonly squadUpstream: SquadUpstreamService;

  /**
   * Detects available Squad CLI/project updates (SQD-030, FR-005). Lazily
   * performs npm/detection work only when requested by the panel/command.
   */
  squadUpdates: SquadUpdateService;

  /**
   * Export the current Squad through the allowlisted CLI (SQD-033). Lazily
   * prompts for a destination only when invoked.
   */
  squadExport: SquadExportService;
}

/**
 * Initialize all services
 */
export async function initializeServices(context: vscode.ExtensionContext): Promise<ServiceContainer> {
  // Initialize logging service first
  const logging = LoggingService.getInstance();
  logging.info("Initializing Nexkit extension services...");

  // Telemetry setup performs a network lookup (public IP, up to 5s). Run it in
  // the background so activation — and the Nexkit panel — never wait on it.
  const telemetry = new TelemetryService();
  void telemetry.initialize().then(() => telemetry.trackActivation());

  // Initialize other services
  const extensionUpdate = new ExtensionUpdateService();
  const confirmation = new ConfirmationService();
  const mcpConfig = new MCPConfigService(confirmation);
  const userDirectory = new UserDirectoryService();
  const installedTemplatesState = new InstalledTemplatesStateManager(context, userDirectory);
  const aiTemplateData = new AITemplateDataService(installedTemplatesState, userDirectory);
  const templateMetadata = new TemplateMetadataService(aiTemplateData.getRepositoryManager());
  const backup = new GitHubTemplateBackupService(userDirectory);
  const updateStatusBar = new UpdateStatusBarService(context, extensionUpdate);
  const gitExcludeConfigDeployer = new GitExcludeConfigDeployer();
  const mcpConfigDeployer = new MCPConfigDeployer(confirmation);
  const recommendedExtensionsConfigDeployer = new RecommendedExtensionsConfigDeployer();
  const recommendedSettingsConfigDeployer = new RecommendedSettingsConfigDeployer();
  const aiTemplateFilesDeployer = new AITemplateFilesDeployer(aiTemplateData);
  const workspaceInitPrompt = new WorkspaceInitPromptService();
  const modeSelectionPrompt = new ModeSelectionPromptService(telemetry);
  const workspaceInitialization = new WorkspaceInitializationService();
  const profileService = new ProfileService(installedTemplatesState, aiTemplateData, backup);
  const modeSelection = new ModeSelectionService();
  const devOpsConfig = new DevOpsMcpConfigService();
  const nexkitFileMigration = new NexkitFileMigrationService();
  const commitMessage = new CommitMessageService();
  const templateMetadataScanner = new TemplateMetadataScannerService(templateMetadata, aiTemplateData);
  const githubAuthPrompt = new GitHubAuthPromptService();
  const hooksConfigDeployer = new HooksConfigDeployer();
  const startupVerification = new StartupVerificationService(
    gitExcludeConfigDeployer,
    hooksConfigDeployer,
    nexkitFileMigration,
    githubAuthPrompt
  );
  const nexkitFileWatcher = NexkitFileWatcherService.getInstance();
  const githubWorkflowRunner = new GitHubWorkflowRunnerService(context.extensionUri);
  const markitdownConversion = new MarkitdownConversionService(logging);
  const convertToMarkdown = new ConvertToMarkdownPanelService(context.extensionUri, markitdownConversion);

  // Squad services (SQD-003) — lazy, non-blocking construction, no activation work.
  // Detection resolves the workspace root on demand; the file service is bound to
  // the first open workspace folder when one exists.
  const squadWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  const squadFile = squadWorkspaceRoot ? new SquadFileService(squadWorkspaceRoot) : undefined;
  const squadWrite = squadWorkspaceRoot ? new SquadFileWriteService(squadWorkspaceRoot, backup, logging) : undefined;
  // SquadCliService (SQD-005, #220) — no work runs until a command is invoked.
  const squadCli = new SquadCliService();
  const squadExport = new SquadExportService({ cli: squadCli });
  // Detection delegates CLI probing to SquadCliService so a globally-installed
  // CLI is found across platforms (npm `squad.cmd`/`squad.ps1` shims on Windows).
  const squadDetection = new SquadDetectionService({ cliService: squadCli });
  const squadUpdates = new SquadUpdateService({ detectionService: squadDetection });
  const squadPlugins = squadFile ? new SquadPluginService({ fileService: squadFile, cli: squadCli }) : undefined;

  // Preset discovery (SQD-017/018) aggregated behind one provider (SQD-019).
  // Built lazily so no preset listing or network work happens during activation.
  let squadPresetsProvider: SquadPresetProvider | undefined;
  const getSquadPresets = (): SquadPresetProvider => {
    if (!squadPresetsProvider) {
      squadPresetsProvider = new CompositeSquadPresetProvider([
        new NexusMarketplacePresetProvider(),
        new ExternalRepoPresetProvider(),
      ]);
    }
    return squadPresetsProvider;
  };

  // Squad init from preset (SQD-020) — lazily constructed so activation stays
  // free of any preset/network/CLI work; it only runs when the panel requests
  // an initialisation. Reuses BackupService for the FR-006 prior backup.
  let squadInitService: SquadInitService | undefined;
  const getSquadInit = (): SquadInitService => {
    if (!squadInitService) {
      squadInitService = new SquadInitService({
        presetProvider: getSquadPresets(),
        downloadService: new SquadPresetDownloadService(),
        cli: squadCli,
        backup,
        detection: squadDetection,
      });
    }
    return squadInitService;
  };

  // Squad upstream add/sync/remove (SQD-036) — lazily constructed; nothing runs
  // until the panel requests an upstream operation. Backs up upstream.json first.
  let squadUpstreamService: SquadUpstreamService | undefined;
  const getSquadUpstream = (): SquadUpstreamService => {
    if (!squadUpstreamService) {
      squadUpstreamService = new SquadUpstreamService({ cli: squadCli, backup, logger: logging });
    }
    return squadUpstreamService;
  };

  // Register for disposal
  context.subscriptions.push(logging);
  context.subscriptions.push(aiTemplateData);
  context.subscriptions.push(telemetry);
  context.subscriptions.push(devOpsConfig);
  context.subscriptions.push(templateMetadataScanner);
  context.subscriptions.push(nexkitFileWatcher);
  context.subscriptions.push(convertToMarkdown);

  logging.info("All services initialized successfully");

  return {
    logging,
    telemetry,
    confirmation,
    mcpConfig,
    aiTemplateData,
    templateMetadata,
    installedTemplatesState,
    updateStatusBar,
    extensionUpdate,
    backup,
    gitExcludeConfigDeployer,
    mcpConfigDeployer,
    recommendedExtensionsConfigDeployer,
    recommendedSettingsConfigDeployer,
    aiTemplateFilesDeployer,
    workspaceInitPrompt,
    modeSelectionPrompt,
    workspaceInitialization,
    profileService,
    modeSelection,
    devOpsConfig,
    nexkitFileMigration,
    commitMessage,
    templateMetadataScanner,
    githubAuthPrompt,
    hooksConfigDeployer,
    startupVerification,
    nexkitFileWatcher,
    githubWorkflowRunner,
    userDirectory,
    convertToMarkdown,
    markitdownConversion,
    squadDetection,
    squadCli,
    squadExport,
    squadFile,
    squadUpdates,
    squadWrite,
    squadPlugins,
    get squadPresets(): SquadPresetProvider {
      return getSquadPresets();
    },
    get squadInit(): SquadInitService {
      return getSquadInit();
    },
    get squadUpstream(): SquadUpstreamService {
      return getSquadUpstream();
    },
  };
}
