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

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Bug fix — 2026-07-23 (Convert to Markdown — accented character corruption on Windows)

**Root cause confirmed:** On a French Windows install, `markitdown`'s Python subprocess writes conversion output to stdout, but because that stdout is a redirected pipe (not a real console TTY), CPython does not use UTF-8 by default — it falls back to `locale.getpreferredencoding()` (cp1252 on fr-FR Windows). Each accented character (e.g. "É") gets encoded as a single cp1252 byte (0xC9). Node then force-decodes stdout with `chunk.toString("utf8")`; a lone 0xC9 byte is an invalid UTF-8 lead byte with no valid continuation byte, so it's replaced by exactly one U+FFFD per character — matching the reported corruption pattern exactly (single replacement char per accented letter, not double-mojibake). Confirmed the temp-file _write_ side (`Buffer.from(text/html, "utf8")`) was already correct and not the culprit — the corruption pattern itself (1:1 replacement, not 2-byte mojibake) ruled out a read-side/double-encoding issue.

**Fix:** Added a `FORCE_UTF8_ENV` constant (`PYTHONIOENCODING: "utf-8"`, `PYTHONUTF8: "1"`) spread into `spawn(...)`'s `env` option (alongside `...process.env`) for both `_runMarkitdown` and `_probeInterpreter`, forcing Python into UTF-8 mode regardless of host OS locale/console code page. `PYTHONUTF8` enables PEP 540 UTF-8 Mode; `PYTHONIOENCODING` is a belt-and-suspenders override for the stdio stream encoding specifically. Did not touch temp-file writing (already correct) or add any BOM/decoding logic on the Node side — the fix lives entirely at the subprocess environment layer.

**Pattern worth remembering:** Whenever spawning a Python (or any locale-dependent runtime) child process on Windows with piped stdio and expecting UTF-8 text back, always force UTF-8 explicitly via env vars — never rely on the OS default locale/codepage, since CPython's PEP 528 UTF-8 console-encoding change only applies to a real interactive console, not to redirected pipes.

**Testing:** Added a `"forced UTF-8 subprocess encoding"` suite (2 tests) asserting `options.env.PYTHONIOENCODING`/`PYTHONUTF8` on both the probe-interpreter spawn call and the run-markitdown spawn call, plus that the full `process.env` is still spread in (checked via key-count comparison, not exact `PATH` key match — Windows env var casing, e.g. `Path` vs `PATH`, made an exact-key assertion flaky).

**Verification:** `npm run check:types` clean, `npm run compile` clean, `npm test` → 378 passing (up from 376; 2 new tests added), 2 pre-existing failures (`RtfConverterPanelService`, `commitMessageCommands`) confirmed unrelated via `git stash` — they fail identically on the base branch before this change.

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Implemented the full-scope migration approved by Eric: folder renamed `rtf-converter/` → `convert-to-markdown/`, `RtfConverterPanelService` → `ConvertToMarkdownPanelService`, `Commands.OPEN_RTF_CONVERTER` → `Commands.OPEN_CONVERT_TO_MARKDOWN`, view type and message keywords renamed throughout. New `MarkitdownConversionService` (argv-array spawn, 10MB cap, two-layer SIGTERM/SIGKILL timeout, sandboxed temp cleanup) and new `nexkit.convertToMarkdown.pythonPath` setting. `npm run check:types` clean. Trinity added 19+11 tests covering the new service and panel; all pass.
