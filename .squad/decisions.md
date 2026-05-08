# Squad Decisions

## Active Decisions

---

### 2026-05-08: PR #158 Code Review
**By:** Danny (Lead)
**PR:** #158 — Feature/invisible-nexkit
**Verdict:** APPROVED WITH NOTES

PR #158 moves NexKit's VS Code `chat.*Locations` settings from workspace-level (`.vscode/settings.json`) to user-level (`ConfigurationTarget.Global`) using `~/`-relative paths, removing `.nexkit/` entries from the workspace and any direct workspace-to-user coupling. `UserDirectoryService` is confirmed to exist at `src/features/ai-template-files/services/userDirectoryService.ts` and is wired correctly via `ServiceContainer`.

Minor issues noted:
1. `_toTildePath()` silent fallback for non-homedir paths should emit a `this._logging.warn(...)` call.
2. `_isNexkitManagedPath()` does not match backslash absolute paths (`C:\Users\...\\.nexkit\`) — low risk since VS Code serializes JSON with forward slashes, but a gap.
3. Writing workspace-relative `.nexkit/${subdir}` to `ConfigurationTarget.Global` (workspace override) is unverified VS Code behaviour — may need to be written to `ConfigurationTarget.Workspace` instead.

---

### 2026-05-08: Issue Status Analysis post-PR #158
**By:** Livingston (QA)

Issues #146, #147, #148, and #150 all have their acceptance criteria fully satisfied by the implementation in PR #158. All four are safe to close and were closed on GitHub with analysis comments.

---

### 2026-05-07: Architectural Decision — copilot-instructions.md Strategy
**By:** Danny (Lead / Architect) — requested by Eric
**References:** #153, #150, PR #156

**Decision:** NexKit does NOT deploy, manage, or migrate `copilot-instructions.md`. This file is project-owned. NexKit's template system (`.nexkit/instructions/*.instructions.md`) operates independently via `chat.instructionsFilesLocations` pointing to the user directory.

Rationale: separation of concerns; VS Code hard constraint (file must be in `.github/` workspace root); PR #156 independently reached the same conclusion. Full details in original inbox file.

---

### 2026-05-07: User Directory Architecture — Backlog Triage & Execution Plan
**By:** Danny (Lead / Architect)

Dependency analysis and execution order for the 10-issue user directory epic (#145). Foundation is `#154 (UserDirectoryService)` — nothing else can start until it is merged. Full dependency graph and phase breakdown in original inbox file.

---

### 2026-05-07: UserDirectoryService — placement and pattern
**By:** Rusty (Extension Dev)

Placed `UserDirectoryService` in `src/features/ai-template-files/services/` (not `src/core/`). Uses the same platform-detection pattern as `MCPConfigService.getUserMCPConfigPath()`. Path root: `{VS Code User data}/User/.nexkit/`. Subdirectories: agents, prompts, skills, instructions, chatmodes, hooks, backups.

---

### 2026-05-07: Chat location settings moved to user-level scope
**By:** Rusty (Extension Dev) — Issue #146

`RecommendedSettingsConfigDeployer` now writes all `chat.*Locations` settings to `ConfigurationTarget.Global` using absolute paths from `UserDirectoryService`. `.vscode/settings.json` is no longer created or modified for template locations. Old `.nexkit/*` entries are auto-cleaned from workspace settings on startup.

---

### 2026-05-07: Template deployment mode — user directory by default
**By:** Rusty (Extension Dev) — Issue #151

`nexkit.templates.deployMode` setting ("user" | "workspace") added. Default is "user" mode — no `.nexkit/` created in workspace. `UserDirectoryService` injected into `TemplateFileOperations` and `InstalledTemplatesStateManager`. `userDirectoryService` parameter made optional in both for backward-compat with existing tests.

---

### 2026-05-07: Workspace deployers made conditional on deploy mode
**By:** Rusty (Extension Dev) — Issue #150

Workspace file modifications during initialization are now conditional on `nexkit.templates.deployMode`. In user mode (default): `.gitignore`, `.vscode/extensions.json`, `.vscode/mcp.json` modifications are all skipped. Hooks are deployed to user-level directory. `StartupVerificationService` and `WorkspaceInitializationService` both gated accordingly.

---

### 2026-05-07: Workspace-to-User Migration Architecture
**By:** Rusty (Extension Dev)

Migration service uses backup-first safety pattern: always calls `BackupService.backupTemplates()` before any destructive operation. Files are copied (not moved) to user directory; workspace copy deleted only after user confirmation. State tracked per-workspace in globalState. Partial migrations are safe.

---

### 2026-05-07: Workspace template override layering approach
**By:** Basher (Platform Dev) — Issue #148

`SettingsManager.isWorkspaceOverrideActive()` returns true when `nexkit.templates.deployMode === "workspace"` OR a `.nexkit/` directory exists (auto-detection). When active, `RecommendedSettingsConfigDeployer` writes both user-level and workspace-level `.nexkit/<type>` paths into `chat.*Locations`. Additive — user templates remain the base layer.

---

### 2026-05-07: Backup storage moved to user directory
**By:** Basher (Platform Dev) — requested by Eric — Issue #152

`GitHubTemplateBackupService` now stores backups in `UserDirectoryService.getUserBackupDir()` instead of workspace root. Path: `<user-nexkit-root>/backups/<timestamp>/` (format: `YYYY-MM-DD_HH-MM-SS`). Retention: max 5 backups, count-based (was date-based). `listBackups()` and `cleanupBackups()` no longer require `workspaceRoot`. Constructor now requires `UserDirectoryService` injection.

---

### 2026-05-07: Panel UI updated for user-directory architecture
**By:** Linus (UI Dev) — Issue #149

"Initialize Project" → "Set Up NexKit". Button descriptions updated to user-directory language. `deployMode` and `workspaceOverrideActive` added to `AppState`/workspace state. Source indicator badge added in `TemplateSection` when workspace override is active.

---

### 2026-05-07: Documentation reflects user directory as default
**By:** Livingston (QA) — Issue #147

`README.md` now documents user directory mode as the default installation model: platform-specific paths, workspace override mechanism, migration guide for existing users. Old workspace-only documentation replaced.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
