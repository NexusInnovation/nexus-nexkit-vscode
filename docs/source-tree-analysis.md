# Source Tree Analysis — Nexkit VS Code Extension

## Repository Root

```
nexus-nexkit-vscode/
├── src/                          # ★ Extension source code (TypeScript)
│   ├── extension.ts              # ★ ENTRY POINT — activation/deactivation
│   ├── AGENTS.md                 # Source-level coding conventions
│   ├── core/                     # Core infrastructure
│   │   ├── serviceContainer.ts   # ★ Dependency injection — 27 services instantiated here
│   │   └── settingsManager.ts    # Centralized VS Code settings facade (static class)
│   ├── features/                 # Feature modules (one folder per feature)
│   │   ├── ai-template-files/    # Template fetching, caching, installation
│   │   │   ├── commands.ts       # registerUpdateInstalledTemplatesCommand
│   │   │   ├── models/           # AITemplateFile, InstalledTemplateRecord, RepositoryConfig, TemplateMetadata
│   │   │   ├── providers/        # LocalFolderTemplateProvider, RepositoryTemplateProvider
│   │   │   └── services/         # AITemplateDataService (facade), RepositoryManager,
│   │   │                         #   TemplateFetcherService, TemplateDataStore,
│   │   │                         #   TemplateFileOperations, InstalledTemplatesStateManager,
│   │   │                         #   TemplateMetadataService, TemplateMetadataScannerService
│   │   ├── apm-devops/           # Azure DevOps integration (APM mode)
│   │   │   ├── commands.ts       # addDevOpsConnection, removeDevOpsConnection
│   │   │   ├── devOpsMcpConfigService.ts   # DevOps MCP server configuration
│   │   │   ├── devOpsUrlParser.ts          # Parse Azure DevOps URLs
│   │   │   └── models/           # DevOpsConnection model
│   │   ├── backup-management/    # Backup/restore before destructive operations
│   │   │   ├── commands.ts       # restoreBackup, cleanupBackup
│   │   │   └── backupService.ts  # GitHubTemplateBackupService
│   │   ├── commit-management/    # AI-generated commit messages
│   │   │   ├── commands.ts       # generateCommitMessage
│   │   │   └── commitMessageService.ts  # Uses VS Code Language Model API
│   │   ├── extension-updates/    # Self-update from GitHub Releases
│   │   │   ├── commands.ts       # checkExtensionUpdate
│   │   │   ├── extensionUpdateService.ts       # Update check + VSIX install
│   │   │   ├── extensionGitHubReleaseService.ts # GitHub Release API client
│   │   │   └── updateStatusBarService.ts        # Status bar indicator
│   │   ├── github-workflow-runner/  # Trigger GitHub Actions from sidebar
│   │   │   └── githubWorkflowRunnerService.ts
│   │   ├── initialization/       # Workspace first-run setup
│   │   │   ├── commands.ts       # initWorkspace, switchMode
│   │   │   ├── resetCommand.ts   # resetWorkspace
│   │   │   ├── workspaceInitializationService.ts  # Orchestrates initialization
│   │   │   ├── workspaceInitPromptService.ts      # Prompt to initialize
│   │   │   ├── modeSelectionService.ts            # Developer/APM mode
│   │   │   ├── modeSelectionPromptService.ts      # First-time mode picker
│   │   │   ├── startupVerificationService.ts      # Verify settings/gitignore/migration/auth on startup
│   │   │   ├── githubAuthPromptService.ts         # GitHub authentication prompt
│   │   │   ├── nexkitFileMigrationService.ts      # Migrate legacy .nexkit files
│   │   │   ├── aiTemplateFilesDeployer.ts         # Deploy templates to workspace
│   │   │   ├── gitIgnoreConfigDeployer.ts         # .gitignore config
│   │   │   ├── mcpConfigDeployer.ts               # MCP config deployment
│   │   │   ├── recommendedExtensionsConfigDeployer.ts  # extensions.json
│   │   │   ├── recommendedSettingsConfigDeployer.ts    # settings.json
│   │   │   └── profileSelectionPromptService.ts   # Profile picker on init
│   │   ├── mcp-management/       # MCP server configuration
│   │   │   ├── commands.ts       # installUserMCPs
│   │   │   └── mcpConfigService.ts  # User + workspace level MCP config
│   │   ├── nexkit-file-watcher/  # Watch .nexkit/ for external changes
│   │   │   └── nexkitFileWatcherService.ts
│   │   ├── panel-ui/             # ★ Webview sidebar (Preact SPA)
│   │   │   ├── nexkitPanelViewProvider.ts    # WebviewViewProvider lifecycle
│   │   │   ├── nexkitPanelMessageHandler.ts  # ★ Extension↔Webview message bridge
│   │   │   ├── types/            # WebviewMessage, ExtensionMessage types
│   │   │   ├── utils/            # templateDiagnostics
│   │   │   └── webview/          # Preact application
│   │   │       ├── main.tsx      # ★ WEBVIEW ENTRY — Preact render
│   │   │       ├── index.html    # HTML template
│   │   │       ├── styles.css    # Global styles
│   │   │       ├── components/   # Atomic Design components
│   │   │       │   ├── App.tsx   # Root component
│   │   │       │   ├── atoms/    # FilterMenu, GroupMenu, IconTooltip, ProfileInfoTooltip,
│   │   │       │   │             #   SearchBar, TemplateInfoTooltip, TemplateItem
│   │   │       │   ├── molecules/ # CollapsibleSection, TabBar, TypeSection, WorkflowRunnerTool
│   │   │       │   └── organisms/ # ActionsSection, ApmActionsSection, ApmConnectionSection,
│   │   │       │                  #   ApmTemplateSection, FooterSection, ModeSelectionSection,
│   │   │       │                  #   ProfileSection, RepositorySection, TemplateSection, ToolsSection
│   │   │       ├── contexts/     # AppStateContext, TemplateMetadataContext
│   │   │       ├── hooks/        # useAppState, useTemplateData, useProfileData,
│   │   │       │                 #   useDevOpsConnections, useActiveTab, useDebounce,
│   │   │       │                 #   useExpansionState, useFilterMode, useMode,
│   │   │       │                 #   useVSCodeAPI, useWebviewPersistentState
│   │   │       ├── services/     # Webview-side services
│   │   │       ├── types/        # AppState, index (type exports)
│   │   │       ├── utils/        # Webview utilities
│   │   │       └── static/       # codicon.css and fonts
│   │   └── profile-management/   # Template profile save/apply/delete
│   │       ├── commands.ts       # saveProfile, applyProfile, deleteProfile
│   │       ├── models/           # Profile model
│   │       └── services/         # ProfileService
│   └── shared/                   # Cross-feature shared code
│       ├── commands/             # commandRegistry, settingsCommand, feedbackCommand, loggingCommand
│       │   └── commands.ts       # Command constants
│       ├── constants/            # Command IDs, settings keys
│       │   └── commands.ts
│       ├── services/             # LoggingService, TelemetryService
│       │   ├── loggingService.ts
│       │   └── telemetryService.ts
│       └── utils/                # extensionHelper, fileHelper, githubAuthHelper, vscodeProfileHelper
├── test/                         # Test suite
│   ├── runTest.ts                # Test runner configuration
│   ├── README.md                 # Testing documentation
│   └── suite/                    # 31 test files (Mocha + Sinon)
│       ├── index.ts              # Suite entry point
│       ├── mockAuthentication.ts # Shared mock for GitHub auth
│       ├── *.test.ts             # Unit tests (mirror src/ structure)
│       └── *.integration.test.ts # Integration tests
├── infrastructure/               # Deployment-only (not in extension bundle)
│   ├── telemetry.bicep           # Azure Application Insights IaC
│   ├── telemetry.parameters.json
│   └── badge-service/            # Azure Function — VS Marketplace download badge
│       ├── src/                  # Function source
│       ├── scripts/              # Deployment scripts
│       └── *.md                  # Deployment docs
├── scripts/                      # Installation & deployment scripts
│   ├── install-vscode-with-nexkit.ps1   # PowerShell installer
│   ├── install-vscode-with-nexkit.bat   # Batch wrapper
│   ├── detect-installation.ps1          # Installation detector
│   ├── uninstall-vscode-with-nexkit.ps1 # Uninstaller
│   ├── run-github-workflow.sh           # GitHub workflow trigger (bash)
│   ├── Run-GitHubWorkflow.ps1           # GitHub workflow trigger (PS)
│   └── *.md                             # Script documentation
├── media/                        # Extension icons (SVG, woff)
├── presentation/                 # Slide decks
├── .github/                      # GitHub configuration
│   ├── workflows/
│   │   ├── ci-cd.yml             # ★ Main CI/CD pipeline (multi-OS, semantic-release)
│   │   └── commitlint.yml        # Commit message validation
│   ├── agents/                   # BMAD agent definitions (.agent.md)
│   ├── prompts/                  # BMAD prompt definitions (.prompt.md)
│   └── copilot-instructions.md   # Copilot/BMAD instructions
├── _bmad/                        # BMAD framework (AI workflow orchestration)
├── _bmad-output/                 # BMAD generated artifacts
├── package.json                  # Extension manifest + VS Code contributions
├── tsconfig.json                 # TypeScript configuration
├── esbuild.config.js             # Build configuration (extension + webview bundles)
├── eslint.config.mjs             # ESLint flat config
├── lefthook.yml                  # Git hooks (commitlint + pretest)
├── commitlint.config.js          # Conventional Commits enforcement
├── AGENTS.md                     # Developer guide & conventions
├── README.md                     # User-facing documentation
├── CHANGELOG.md                  # Auto-generated changelog
└── CUSTOM-LAYOUT-CONFIGURATION.md  # Sidebar layout customization guide
```

## Critical Folders Summary

| Folder                             | Purpose                                                      | Criticality                            |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `src/core/`                        | DI container + settings facade                               | **Core** — all services depend on this |
| `src/features/ai-template-files/`  | Template management (8 service files, 4 models, 2 providers) | **Core** — primary feature             |
| `src/features/panel-ui/webview/`   | Preact sidebar UI (21+ components, 11 hooks, 2 contexts)     | **Core** — user interface              |
| `src/features/initialization/`     | Workspace setup (15 files — deployers, services, commands)   | **High** — first-use experience        |
| `src/features/mcp-management/`     | MCP server config                                            | **High** — required for AI tools       |
| `src/features/extension-updates/`  | Self-update mechanism                                        | **Medium** — distribution              |
| `src/features/commit-management/`  | AI commit messages                                           | **Medium** — developer productivity    |
| `src/features/profile-management/` | Template profiles                                            | **Medium** — workspace management      |
| `src/shared/`                      | Logging, telemetry, utilities                                | **Core** — cross-cutting concerns      |
| `test/suite/`                      | 31 test files                                                | **High** — quality gate                |
| `.github/workflows/`               | CI/CD pipeline                                               | **High** — delivery                    |

## Entry Points

| Entry Point          | File                                     | Description                                                            |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Extension activation | `src/extension.ts`                       | `activate()` initializes services, registers commands, sets up webview |
| Webview render       | `src/features/panel-ui/webview/main.tsx` | Preact `render()` with AppStateContext                                 |
| Test runner          | `test/runTest.ts`                        | Mocha test orchestration                                               |
| CI/CD                | `.github/workflows/ci-cd.yml`            | Quality gate → Security → Build → Release                              |
