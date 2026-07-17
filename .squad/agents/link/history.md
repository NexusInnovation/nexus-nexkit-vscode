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

### GitHub Ruleset Validation Feature (Lots 2–6 Implementation, 2026-07-08)

**Completion Summary:**
The full ruleset-validation feature (V1) is complete across all 6 implementation lots with production-quality test coverage and clean lint/build/type-check.

**Key Architectural Decisions:**

1. **Fail-Closed Regex Validation** — `RulesetPolicyCompilerService` rejects regex patterns with backreferences (`\1`–`\9`) or lookarounds (`(?=)`, `(?! )`, `(?<=)`, `(?<!)`), even if JavaScript's `new RegExp()` accepts them. This ensures parity with GitHub's RE2 engine and prevents false positives/negatives.

2. **Centralized Policy Hash** — `RulesetCacheService` exports a single canonical hash function (`computeRulesetPolicyHash`) reused by both compiler and cache store to prevent divergence and enable reliable cache invalidation on rule changes.

3. **Session-Scoped Consent** — `RulesetConsentService` caches in-memory dismissals as `already-declined-this-session` per repository fingerprint, respecting the product rule that dismissal ≠ approval without persisting consent across extension reloads.

4. **Non-Destructive Hook Chaining** — `GitRulesetHooksDeployer` backs up and transparently wraps existing custom hooks before deploying Nexkit-managed commit-msg and pre-push hook wrappers, ensuring no user data loss during upgrade/uninstall.

5. **Hook Runtime Path Resolution** — Generated hook scripts resolve the repository root via `__dirname` instead of `process.cwd()` to remain correct in git worktrees or when Git runs the hook from a different working directory.

6. **Pre-Push Commit Range** — For new branches (remote SHA1 all zeros), the validated commit range is calculated with `git log <localSha> --not --remotes=<remoteName>` to target commits unknown to the remote without revalidating entire history.

7. **Bootstrap Interactivity Control** — Ruleset validation bootstrap is proxied through the existing `deployUserLevelSettings` flag: silent during startup (`false`), interactive during explicit setup (`true`). Per-hook deploy flags in `deployHooks()` allow granular enforcement control.

**Code Organization:**

- `src/features/ruleset-validation/gitHubRulesetApiClient.ts` — Paginated GitHub API client
- `src/features/ruleset-validation/rulesetCacheService.ts` — Policy caching with canonical hashing
- `src/features/ruleset-validation/rulesetPolicyCompilerService.ts` — Rule translation with strict regex checks
- `src/features/ruleset-validation/rulesetConsentService.ts` — Session-scoped consent state
- `src/features/ruleset-validation/gitRulesetHooksDeployer.ts` — Hook generation and deployment
- `src/features/ruleset-validation/rulesetValidationBootstrapService.ts` — Orchestration and startup integration
- Full test coverage in `test/suite/features/ruleset-validation/`

**Verification:**

- `npm run compile` ✓
- `npm test` ✓ (all unit tests green, >70% coverage on core services)
- `npm run lint` ✓ (no errors in feature)
- `npm run check:types` ✓
- `npm run package` ✓ (production bundle validates)

**Impact & Reusability:**

- RE2-strict regex heuristic is reusable for any regex-based local validation (branch protections, commit policies beyond GitHub)
- Policy hash pattern can be applied to other versioned cache schemas
- Session-scoped consent pattern suitable for other first-time setup dialogs
- Non-destructive hook chaining can be generalized for other VS Code extension hooks

### RTF Converter Markdown/Preview Validation (2026-07-10)

- Inspected `package.json`: `lint` runs `eslint src --ext ts`; `compile` runs the extension esbuild pipeline.
- `npm run lint` passed with exit code 0.
- `npm run compile` passed with exit code 0; esbuild completed and copied the RTF converter webview assets.
- No production files required repair. Scope stayed limited to validation.
