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

### 2026-05-08: Migration service — Issue #155 full verification

**By:** Rusty (Extension Dev)

All acceptance criteria for issue #155 verified:

- Activation notification (`checkAndPromptMigration`) fires once, respects `"dismissed"`/`"completed"` state in `context.globalState`; "Don't Ask Again" persists dismissal permanently
- `executeMigration()` uses backup-first + copy-first strategy: `BackupService.backupTemplates()` before any operation, files copied (not moved), workspace `.nexkit/` deleted only after user confirms
- Manual command `nexus-nexkit-vscode.migrateToUserDirectory` registered and appears in command palette as "Nexkit: Migrate Templates to User Directory"

Minor gap noted: no explicit rollback of partial user-directory copy on error — mitigated by copy-first design (workspace `.nexkit/` always intact until Step 5). Non-blocking for MVP; future enhancement suggested.

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

### 2026-05-08: Panel UI — Issue #149 full verification

**By:** Linus (UI Dev)

Full review of `src/features/panel-ui/webview/` confirmed all acceptance criteria satisfied:

- "Set Up NexKit" label correct in `ActionsSection.tsx`, `ToolsSection.tsx`, `ApmActionsSection.tsx`
- User directory descriptions present in all three action sections
- `TemplateSection.tsx` renders `Templates installed to: User directory + Workspace` when `workspaceOverrideActive === true`
- `deployMode` propagated correctly via `nexkitPanelMessageHandler.ts` → `AppStateContext.tsx`
- Install/uninstall routes to user directory via `TemplateFileOperations.ts` `isUserDeployMode()` check
- Profile apply respects user deploy mode through same code path
- No hardcoded `.nexkit/` path strings in webview

Minor items (non-blocking): stale copy in `ProfileSection.tsx` line 16 ("other projects" should be "restore it later"); no location indicator in pure user-mode when `workspaceOverrideActive === false`. Both are UX polish only.

---

### 2026-05-07: Panel UI updated for user-directory architecture

**By:** Linus (UI Dev) — Issue #149

"Initialize Project" → "Set Up NexKit". Button descriptions updated to user-directory language. `deployMode` and `workspaceOverrideActive` added to `AppState`/workspace state. Source indicator badge added in `TemplateSection` when workspace override is active.

---

### 2026-05-07: Documentation reflects user directory as default

**By:** Livingston (QA) — Issue #147

`README.md` now documents user directory mode as the default installation model: platform-specific paths, workspace override mechanism, migration guide for existing users. Old workspace-only documentation replaced.

---

### 2026-05-13: User storage root + layered scoping (`.global` + `<project>`)

**By:** Rusty (Extension Dev)

User storage now uses a platform-native `NexKit` root instead of VS Code `Code/User/.nexkit`:

- Windows: `%APPDATA%/NexKit`
- macOS: `~/Library/Application Support/NexKit`
- Linux: `~/.config/NexKit`

Inside this root, `.global/` is shared across projects and `<project-directory-name>/` is project-scoped. Legacy user path migration is best-effort to `.global`, and user-level chat settings include both global and project paths.

---

### 2026-05-13: Backup scope consistency for `.global` + `<project>` model

**By:** Basher (Platform Dev)

Backup operations must resolve to one consistent scoped root per workspace context (`<storage>/<project>/backups`). `listBackups`, `cleanupBackups`, and retention cleanup now share workspace-aware resolution, and backup commands pass workspace context consistently.

This supersedes earlier assumptions that list/cleanup were always global-only.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Always use the `vscode_askQuestions` tool when asking for his answers — never ask questions inline in text.
- Always propose a concise plan before making any code or file modifications.
- Always ask for his approval before making any code or file modifications.
- Prefer to talk in frenches when possible, but can switch to English if needed for clarity or precision.
- When asking questions, be as specific and concise as possible, and avoid open-ended questions that may lead to vague or lengthy answers.
