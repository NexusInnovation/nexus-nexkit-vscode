# Ghost — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension with a Preact-powered sidebar webview. Manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Stack:** TypeScript 5.x (strict), Preact (webview sidebar), esbuild bundling, Mocha + Sinon (testing).

**Owner:** Eric Decarufel

**My domain — webview architecture:**

- Components live in `src/features/panel-ui/webview/components/` (atoms / molecules / organisms)
- Hooks in `src/features/panel-ui/webview/hooks/`
- Central state: `AppState` in `src/features/panel-ui/webview/types/appState.ts`
- Message handling: `src/features/panel-ui/webview/contexts/AppStateContext.tsx`
- Root app: `src/features/panel-ui/webview/components/App.tsx`

**Critical:** This uses Preact, not React. `class` not `className`. Import from `'preact'` and `'preact/hooks'`.

**Build:** `npm run compile` | Tests: `npm test` | Lint: `npm run lint`

## Learnings

- 2026-07-10: The standalone RTF converter is fully client-side in `src/features/rtf-converter/webview/main.tsx`; its host-side panel test suite only verifies HTML injection and panel lifecycle. A rendered Markdown mode can remain local Preact state while `handleCopy` continues to copy the shared raw `markdownValue`. `markdown-it` requires `@types/markdown-it` for strict TypeScript compilation and is imported as `import MarkdownIt = require("markdown-it")` under this project's compiler settings.

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Rebuilt `src/features/convert-to-markdown/webview/` (index.html + main.tsx) as a thin message-passing Preact UI driven entirely by Link's `messages.ts` contract — no client-side conversion logic remains. Paste handler calls `event.preventDefault()` before reading clipboard data so pasted HTML is never inserted into the DOM. Availability gating disables (not hides) inputs with a banner + Recheck button. `ToolsSection.tsx` renamed `openRtfConverter` → `openConvertToMarkdown`. `npm run check:types` clean; merged into decisions.md.
