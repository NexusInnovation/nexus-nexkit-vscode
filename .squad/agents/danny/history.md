# Danny — History

## Core Context

- **Project:** A TypeScript VS Code extension with a Preact sidebar that manages AI templates, workspace setup, MCP configuration, and self-updates.
- **Role:** Lead
- **Joined:** 2026-05-07T15:47:16.730Z

## Learnings

<!-- Append learnings below -->

### 2026-05-08 — PR #158 Review (Feature/invisible-nexkit)

- `UserDirectoryService` lives at `src/features/ai-template-files/services/userDirectoryService.ts`, not under `initialization/`. It returns platform-specific absolute paths under `os.homedir()`.
- `_toTildePath()` correctly handles win32/macOS/Linux since `UserDirectoryService` always returns paths under `os.homedir()`. The silent fallback for non-homedir paths should emit a warning.
- `_isNexkitManagedPath()` is scoped to workspace cleanup only — `~/` paths are never written to workspace settings, so it doesn't need to detect them.
- Writing workspace-relative `.nexkit/${subdir}` to `ConfigurationTarget.Global` (workspace override path) is unverified behaviour — VS Code may not resolve relative paths in global scope from workspace root.
- Tests are thorough but missing: fallback-path coverage, cross-platform homedir shapes, backslash absolute path cleanup.
- `vscode.workspace.getConfiguration()` used directly for `chat.*` settings — acceptable since these are VS Code core settings not owned by nexkit; `SettingsManager` is for nexkit-owned settings only.

### 2026-05-08 — PR #158 Approved

- PR #158 (Feature/invisible-nexkit) formally approved with 3 minor notes logged.
- Session log at `.squad/log/2026-05-08-pr158-review.md`.
- Decisions merged to `.squad/decisions.md`.
