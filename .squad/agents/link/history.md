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

### GitHub Ruleset Validation Feature (Lot 1)

**Implementation Insights (2026-07-08):**

1. **Repository Identity Pattern** — For caching and fingerprinting, use immutable repo identity (owner, repo, baseUrl) rather than relying on Git remotes alone. This survives remote renames and allows per-repo cache scoping.

2. **Two-Layer Service Design** — Separate GitHub API read concerns (IGitRemoteProvider, ruleset client) from local enforcement logic (hook deployment, rule translation). This keeps models reusable and services independently testable.

3. **Git Remote Detection** — Use `git config --get remote.origin.url` to detect hosting provider (GitHub vs GHE vs other VCS). Build a lightweight provider interface for mocking in tests, not a full Git SDK dependency.

4. **Cache Under .nexkit/** — Store ruleset cache in `.nexkit/rulesets/` (workspace-local, not repository root). This keeps cache portable with the repo clone and inspectable by users, while remaining outside the VCS and CI systems.

5. **Feature Flags in SettingsManager** — Centralize feature toggles (on/off, cache paths, API retry limits) through SettingsManager, not scattered config files. Makes feature rollout/experiment control straightforward.

**Testing Pattern:**
- Unit test service layers in isolation (mock GitHub API, mock file I/O)
- Use repository identity in test fixtures for scenario reusability
- 100% coverage target for core services (models, providers, detection)
