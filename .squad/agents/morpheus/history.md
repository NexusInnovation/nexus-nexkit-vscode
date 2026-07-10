# Morpheus — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension with a Preact-powered sidebar webview. Manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Owner:** Eric De Carufel

## Learnings

### 2026-07-10 — 4 New Triage-Pending Issues in Project #5

Oracle created 4 new issues in `NexusInnovation/nexus-nexkit-vscode`, labeled `squad`, and added them to GitHub Project #5 ("NexKit Evolution Project", ID `PVT_kwDOCHE2jM4BGWXr`). They are waiting for role assignment:

- **#175 — JSON Formatter:** Monaco Editor + jsonc-parser panel with line/column validation, JSON5/JSONC support, copy + save-to-file buttons, no diff view.
- **#176 — RTF to Markdown:** Turndown (HTML paste) + Mammoth.js (.docx) + possibly rtf.js (.rtf); risk: pure RTF parsers are weak; both paste and file-upload entry points required.
- **#177 — Cron Job Schedule Builder:** cronstrue + cron-parser + react-js-cron; risk: webview UI is Preact, not React — needs a compatibility check or alternative; needs NL description, 5/6-field formats, presets.
- **#178 — RegEx Builder:** custom panel (no iframe-embeddable tool works due to X-Frame-Options); JS + .NET regex flavor support; risk: flavor differences need a toggle; needs highlighting, replace preview, common pattern library.

**Architectural decision:** 4 separate panels/commands (not a unified tabbed "Dev Tools" webview), npm libraries bundled locally, no iframes to external hosted tools (privacy/telemetry/framing concerns). No priority ranking among the 4; Project #5 is independent of the 125-hour Nethris budget.
