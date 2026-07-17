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
