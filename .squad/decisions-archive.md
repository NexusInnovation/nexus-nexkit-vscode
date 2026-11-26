# Squad Decisions — Archive

Entries older than 30 days, moved out of `decisions.md` by the Scribe to keep the active ledger lean. Append-only.

---

## Decision: ConfirmationService UX contract (Issue #162)

**Date:** 2026-06-03
**Agent:** Neo
**Issue:** #162
**Classification:** Project-specific
**Archived:** 2026-07-20

### Context

A new ConfirmationService was added to gate destructive config-write operations (chat settings, MCP servers) behind a three-choice modal dialog.

### Decisions

#### ESC / dismiss = Accept

When the user closes the modal without clicking a button (showInformationMessage returns undefined), we treat it as Accept. Rationale: dismissal is ambiguous; defaulting to the non-destructive proceed is safer than silently skipping the operation.

#### Refuse Forever is workspace-scoped

The refused-forever flag is stored in workspaceState (not globalState). Rationale: users may want different confirmation behaviour per workspace.

#### workspaceToUserMigrationService not gated

The migration flow was explicitly excluded. It already has multi-step user consent built in.

#### Key structure: static strings + factory functions

CONFIRMATION_KEYS.CHAT_SETTINGS is a static string. CONFIRMATION_KEYS.mcpUserServer(name) and mcpWorkspaceServer(name) are factory functions allowing per-server key isolation, so refusing forever for one MCP server does not affect others.

---

## Decision: Nexkit panel home action placement

**Date:** 2026-06-05
**Agent:** Ghost
**Classification:** Project-specific
**Archived:** 2026-07-20

### Context

The requested home button needed to sit immediately to the left of the existing Save Current Profile action in the panel header bar.

### Decision

The home action was implemented as a contributed `view/title` command instead of a new webview DOM button. The existing save button already lives in the VS Code view title area via `package.json`, so matching that placement keeps the header actions consistent and preserves native VS Code styling and ordering.

The button visibility is driven by a VS Code context key (`nexkit.modeSelected`) derived from the current mode. This keeps the action hidden while the panel is already on the mode selection screen.

---
