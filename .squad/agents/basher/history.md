# Basher — History

## Core Context

- **Project:** A TypeScript VS Code extension with a Preact sidebar that manages AI templates, workspace setup, MCP configuration, and self-updates.
- **Role:** Platform Dev
- **Joined:** 2026-05-07T15:47:16.738Z

## Learnings

<!-- Append learnings below -->

### 2026-05-07: Backup Service refactored to user directory (Issue #152)

- `GitHubTemplateBackupService` now takes `UserDirectoryService` as constructor arg — registered in `serviceContainer.ts`
- `UserDirectoryService` must be instantiated BEFORE `GitHubTemplateBackupService` in the container
- `listBackups()` and `cleanupBackups()` no longer need workspace root — they always read from user dir
- Retention policy: max 5 backups, count-based (not date-based)
- Tests use sinon stub on `getUserBackupDir()` to redirect to temp dir
- The `profileChangeDetection.test.ts` also instantiates `GitHubTemplateBackupService` — needed updating
- 2 pre-existing failures in `StartupVerificationService` tests (settings deployment) — not caused by this change

### 2026-05-07: Workspace template override layering (Issue #148)

- `SettingsManager.isWorkspaceOverrideActive()` detects workspace mode via setting OR `.nexkit/` directory presence
- `RecommendedSettingsConfigDeployer._deployUserLevelChatSettings()` now takes `workspaceRoot` param and adds workspace paths when override active
- `chat.*Locations` is an object where multiple paths coexist with `true` — both user and workspace paths can be `true` at same time
- Auto-detection uses `fs.existsSync` + `statSync` (sync is fine here — runs at startup only)
- The setting `nexkit.templates.deployMode` was already defined with scope "resource" in package.json from #151
- All 302 tests pass including 4 new layering tests

### 2026-05-13: Backup scope consistency fix (QA blocker)
- Fixed mixed-scope behavior so backup/list/cleanup/retention all resolve to the same workspace-scoped backup root when context exists.
- Updated backup commands to pass workspace context consistently; cleanup now requires open workspace like restore.
- Added regression coverage to prevent `.global` / `<project>` path mixing.

