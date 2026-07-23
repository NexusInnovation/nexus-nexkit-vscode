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

- 2026-07-21: The Git title-menu command receives a `vscode.SourceControl` context whose `rootUri` identifies the invoked repository. Forwarding that URI to `CommitMessageService` and comparing canonical `Uri.toString(true)` values against Git API repository roots preserves Command Palette fallback behavior while making multi-root SCM actions deterministic.
- 2026-07-21: Implemented the SCM repository-context fix for Generate Commit Message and added command and integration coverage. Its focused extension-host suite passed (379 passing, 8 pending); broader type/test compilation remains blocked by pre-existing RTF-converter unresolved modules and implicit-any diagnostics.

### Archived sections (see `history-archive.md` for full detail)

- GitHub Ruleset Validation Feature (Lots 1–6, completed 2026-07-08) — API client, policy compiler, consent service, hook deployer, bootstrap orchestration.
- RTF Converter Markdown/Preview Validation (2026-07-10).
- Convert to Markdown → markitdown migration team updates (2026-07-20).
- Bug fix (2026-07-23): accented-character (mojibake) corruption on Windows — forced `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` into the markitdown subprocess env (piped stdout doesn't inherit console UTF-8 mode). Pattern: always force UTF-8 env vars explicitly for locale-dependent child processes on Windows.
- Bug fix (2026-07-23): bumped `@types/sinon` to `^22.0.0` to fix `TS2694` type-only drift vs `sinon@21`/`@sinonjs/fake-timers@15`. Pattern: keep `@types/sinon`'s major in step whenever `sinon` gets a major bump.
- Bug fix (2026-07-23): fixed a pre-existing Sinon stub failure on `vscode.workspace.fs.writeFile` (non-configurable property) by stubbing the parent `fs` getter with a spread override instead. Reusable pattern for any frozen VS Code namespace object.
