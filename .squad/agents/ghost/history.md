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
