# Decisions

## Issue #162: ConfirmationService UX Contract (2026-06-03)

**Agent:** Neo  
**Issue:** #162

### ESC / dismiss = Accept
When the user closes the modal without clicking a button (showInformationMessage returns undefined), we treat it as Accept. Rationale: dismissal is ambiguous; defaulting to the non-destructive proceed is safer than silently skipping the operation.

### Refuse Forever is workspace-scoped
The refused-forever flag is stored in workspaceState (not globalState). Rationale: users may want different confirmation behaviour per workspace.

### workspaceToUserMigrationService not gated
The migration flow was explicitly excluded. It already has multi-step user consent built in.

### Key structure: static strings + factory functions
CONFIRMATION_KEYS.CHAT_SETTINGS is a static string. CONFIRMATION_KEYS.mcpUserServer(name) and mcpWorkspaceServer(name) are factory functions allowing per-server key isolation, so refusing forever for one MCP server does not affect others.
