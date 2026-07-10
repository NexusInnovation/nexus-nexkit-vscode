# Squad Decisions

## Decision: ConfirmationService UX contract (Issue #162)

**Date:** 2026-06-03
**Agent:** Neo
**Issue:** #162
**Classification:** Project-specific

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

### Context

The requested home button needed to sit immediately to the left of the existing Save Current Profile action in the panel header bar.

### Decision

The home action was implemented as a contributed `view/title` command instead of a new webview DOM button. The existing save button already lives in the VS Code view title area via `package.json`, so matching that placement keeps the header actions consistent and preserves native VS Code styling and ordering.

The button visibility is driven by a VS Code context key (`nexkit.modeSelected`) derived from the current mode. This keeps the action hidden while the panel is already on the mode selection screen.

---

## Decision: NexKit Evolution — 4 new dev-tool panels scoped (JSON Formatter, RTF→Markdown, Cron Builder, RegEx Builder)

**Date:** 2026-07-10
**Agent:** Oracle
**Issues:** #175, #176, #177, #178
**Classification:** Project-specific

### Context

Eric proposed 4 new tool ideas for the Nexkit panel-ui feature. Oracle researched GitHub Project "NexKit Evolution Project" (#5, org NexusInnovation), drafted 10 clarifying questions, and got answers from Eric. Oracle then created 4 GitHub issues in NexusInnovation/nexus-nexkit-vscode, labeled `squad`, and added all 4 to Project #5 (project ID `PVT_kwDOCHE2jM4BGWXr`) for triage.

### Decisions

#### Architecture: 4 separate panels/commands, not a unified tabbed webview
Each tool gets its own panel and command rather than a single tabbed "Dev Tools" webview.

#### No iframes to external hosted tools
All 4 tools bundle npm libraries locally and render in custom Preact panels. No iframe embedding of external hosted tools, due to privacy/telemetry/framing concerns (and because public tools commonly block framing via `X-Frame-Options`).

#### No priority ranking / no hour tracking
The 4 items are unranked among themselves. Project #5 ("NexKit Evolution Project") is independent of the 125-hour Nethris budget — no effort/hour tracking applies to these items.

#### Issue #175 — JSON Formatter
Monaco Editor + `jsonc-parser`. Needs line/column validation errors, JSON5/JSONC support, copy button, save-to-file button. No diff view.

#### Issue #176 — RTF to Markdown
Turndown (HTML paste from Word/Outlook) + Mammoth.js (`.docx`) + possibly `rtf.js` (true `.rtf`). **Risk flagged:** pure RTF parsers are weak. Both paste and file-upload entry points are required.

#### Issue #177 — Cron Job Schedule Builder
`cronstrue` + `cron-parser` + `react-js-cron`. **Risk flagged:** the webview UI is Preact, not React — needs a compatibility check or an alternative library. Needs natural-language description, 5-field and 6-field cron formats, and presets.

#### Issue #178 — RegEx Builder
No iframe-embeddable public regex tool works (`X-Frame-Options` blocks framing), so a custom panel is required. JS/ECMAScript flavor plus .NET regex flavor support requested. **Risk flagged:** flavor differences need a toggle. Needs highlighting, replace preview, and a common-pattern library.
