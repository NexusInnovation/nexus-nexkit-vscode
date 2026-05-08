# Rusty — History

## Core Context

- **Project:** A TypeScript VS Code extension with a Preact sidebar that manages AI templates, workspace setup, MCP configuration, and self-updates.
- **Role:** Extension Dev
- **Joined:** 2026-05-07T15:47:16.733Z

## Learnings

<!-- Append learnings below -->

### 2026-05-07: UserDirectoryService (Issue #154)
- Created `src/features/ai-template-files/services/userDirectoryService.ts` — platform-aware user directory resolution following the same pattern as `MCPConfigService.getUserMCPConfigPath()`.
- Registered in `ServiceContainer` interface and `initializeServices()`.
- Template subdirs: agents, prompts, skills, instructions, chatmodes, hooks.
- Path convention: `{VS Code User dir}/.nexkit/` (mirrors the workspace `.nexkit/` folder structure).
- Uses `os.platform()` + `os.homedir()` + `path.join()` — consistent with the MCP config pattern (no `vscode.Uri.joinPath` needed here since paths are filesystem-only, not URI-based).
- Caches the root path after first call for perf.
- Tests use sinon stubs on `os.platform()` and `os.homedir()` plus a temp directory for filesystem integration tests.

### 2026-05-07: Settings to User-Level (Issue #146)
- Refactored `RecommendedSettingsConfigDeployer` to write `chat.*Locations` settings to `ConfigurationTarget.Global` (user-level) instead of `.vscode/settings.json`.
- Uses absolute paths from `UserDirectoryService.getAbsoluteTemplateLocations()` — paths are normalized to forward slashes via `_toForwardSlashPath()`.
- Merges with existing user-level entries using `vscode.workspace.getConfiguration('chat').inspect(key).globalValue` — never overwrites the user's custom paths.
- Cleanup logic removes old `.nexkit/` relative-path entries from workspace `.vscode/settings.json` if present. Deletes the file entirely when empty.
- Constructor now takes `UserDirectoryService` as a dependency (injected via `ServiceContainer`).
- Updated `startupVerificationService.test.ts` and `recommendedSettingsConfigDeployer.test.ts` — both now mock `vscode.workspace.getConfiguration` with sinon stubs.
- Key pattern: use `chatConfig.inspect(shortKey)?.globalValue` to read user-level, then spread-merge the nexkit path in.

### 2026-05-07: Workspace-to-User Migration (Issue #155)
- Created `src/features/initialization/workspaceToUserMigrationService.ts` — full migration flow from workspace `.nexkit/` to user directory.
- Migration state tracked in `context.globalState` per workspace root (key: `nexkit.workspaceToUserMigration`). States: pending / completed / dismissed.
- Flow: detect → prompt → backup (via BackupService) → copy files (skip existing) → clean .gitignore → clean .vscode/settings.json → optionally delete workspace .nexkit/.
- Detects project-specific instruction files (those NOT prefixed with `nexkit.`) and asks user whether to migrate them.
- Created `src/features/initialization/migrationCommand.ts` for `nexkit.migrateToUserDirectory` manual command.
- Registered in ServiceContainer, extension.ts (command + deferred activation check), package.json, commands.ts.
- Non-blocking activation check — errors are caught and logged, not re-thrown.
- Key pattern: `.gitignore` section removal uses regex `# BEGIN NexKit...# END NexKit`. Settings cleanup filters `.nexkit` paths from `chat.*Locations` entries.

### 2026-05-07: Template Deploy to User Directory (Issue #151)
- Refactored `TemplateFileOperations` to accept `UserDirectoryService` and route install/uninstall paths via `SettingsManager.isUserDeployMode()`.
- Added `getTemplateInstallPath()` public method that returns the correct root based on deploy mode.
- `InstalledTemplatesStateManager.syncWithFileSystem()` now checks user directory when in user deploy mode.
- New setting: `nexkit.templates.deployMode` ("user" | "workspace"), default "user", resource-scoped.
- `AITemplateDataService` passes `UserDirectoryService` through to `TemplateFileOperations` (optional param with fallback).
- Constructor params made optional to avoid breaking existing test suites.
- All 290 existing tests pass without modification — backward-compatible design.

### 2026-05-07: Remove Workspace File Modifications (Issue #150)

- Made workspace deployers conditional on `SettingsManager.isUserDeployMode()` — in user mode (default), no workspace files are created or modified during initialization.
- `StartupVerificationService.verifyWorkspaceConfiguration()` now skips `.gitignore` deploy and workspace-level hooks in user mode.
- `WorkspaceInitializationService.initializeWorkspace()` skips `.vscode/extensions.json` and `.vscode/mcp.json` creation in user mode.
- `HooksConfigDeployer` now accepts optional `UserDirectoryService` in constructor and has a new `deployRunTestsHookToUserDir()` method for user-level hook deployment. Extracted `_writeHookFile()` private method to avoid duplication.
- Updated `serviceContainer.ts` to pass `userDirectory` to `HooksConfigDeployer`.
- Updated `startupVerificationService.test.ts` — added `SettingsManager.isUserDeployMode` stub (defaults to `false` for existing tests), added new test for user-mode behavior.
- All 302 tests pass after changes.
