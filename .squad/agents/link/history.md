# Link — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories. Handles workspace initialization, MCP server configuration, and automated extension self-updates.

**Stack:** TypeScript 5.x (strict), VS Code Extension API 1.105.0+, Preact (webview sidebar), esbuild (bundling), Mocha + Sinon (testing), semantic-release + Conventional Commits.

**Owner:** Eric Decarufel

**Architecture:** Service-oriented with dependency injection via `ServiceContainer`. All services instantiated in `src/core/serviceContainer.ts`.

**Key files I own:**
- `src/extension.ts` — activation entry point
- `src/core/serviceContainer.ts` — DI container
- `src/core/settingsManager.ts` — settings facade
- `src/shared/commands/commandRegistry.ts` — command registration
- `src/features/*/` — feature service implementations

**Build:** `npm run compile` | Tests: `npm test` | Lint: `npm run lint`

## Learnings
