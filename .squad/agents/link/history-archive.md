# Link — History Archive

Older, verbose learnings moved out of `history.md` by the Scribe to keep the active file lean. Append-only — full detail preserved for reference.

---

## Bug fix — 2026-07-23 (Convert to Markdown — accented character corruption on Windows)

**Root cause confirmed:** On a French Windows install, `markitdown`'s Python subprocess writes conversion output to stdout, but because that stdout is a redirected pipe (not a real console TTY), CPython does not use UTF-8 by default — it falls back to `locale.getpreferredencoding()` (cp1252 on fr-FR Windows). Each accented character (e.g. "É") gets encoded as a single cp1252 byte (0xC9). Node then force-decodes stdout with `chunk.toString("utf8")`; a lone 0xC9 byte is an invalid UTF-8 lead byte with no valid continuation byte, so it's replaced by exactly one U+FFFD per character — matching the reported corruption pattern exactly (single replacement char per accented letter, not double-mojibake). Confirmed the temp-file _write_ side (`Buffer.from(text/html, "utf8")`) was already correct and not the culprit — the corruption pattern itself (1:1 replacement, not 2-byte mojibake) ruled out a read-side/double-encoding issue.

**Fix:** Added a `FORCE_UTF8_ENV` constant (`PYTHONIOENCODING: "utf-8"`, `PYTHONUTF8: "1"`) spread into `spawn(...)`'s `env` option (alongside `...process.env`) for both `_runMarkitdown` and `_probeInterpreter`, forcing Python into UTF-8 mode regardless of host OS locale/console code page. `PYTHONUTF8` enables PEP 540 UTF-8 Mode; `PYTHONIOENCODING` is a belt-and-suspenders override for the stdio stream encoding specifically. Did not touch temp-file writing (already correct) or add any BOM/decoding logic on the Node side — the fix lives entirely at the subprocess environment layer.

**Pattern worth remembering:** Whenever spawning a Python (or any locale-dependent runtime) child process on Windows with piped stdio and expecting UTF-8 text back, always force UTF-8 explicitly via env vars — never rely on the OS default locale/codepage, since CPython's PEP 528 UTF-8 console-encoding change only applies to a real interactive console, not to redirected pipes.

**Testing:** Added a `"forced UTF-8 subprocess encoding"` suite (2 tests) asserting `options.env.PYTHONIOENCODING`/`PYTHONUTF8` on both the probe-interpreter spawn call and the run-markitdown spawn call, plus that the full `process.env` is still spread in (checked via key-count comparison, not exact `PATH` key match — Windows env var casing, e.g. `Path` vs `PATH`, made an exact-key assertion flaky).

**Verification:** `npm run check:types` clean, `npm run compile` clean, `npm test` → 378 passing (up from 376; 2 new tests added), 2 pre-existing failures (`RtfConverterPanelService`, `commitMessageCommands`) confirmed unrelated via `git stash` — they fail identically on the base branch before this change.

---

## Bug fix — 2026-07-23 (`@types/sinon` v17 vs `sinon`/`@sinonjs/fake-timers` v21/v15 type drift)

**Root cause:** `package.json` pinned `"@types/sinon": "^17.0.3"` alongside `"sinon": "^21.0.0"`. Sinon 21 depends on `@sinonjs/fake-timers@15.4.0`, whose type declarations restructured/renamed their exports and no longer expose `FakeTimerInstallOpts` in the shape `@types/sinon@17.x` expects — a pure types-level mismatch (`TS2694`), not a runtime bug. `sinon`'s own runtime behavior was completely unaffected.

**Fix:** Bumped `@types/sinon` to `^22.0.0` (npm's current `latest` dist-tag) — no source changes needed, the newer major compiled cleanly against all existing test usage.

**Verification:** `tsc -p ./` / `npm run test-compile` clean, `npm run lint` clean, `npm test` → 381 passing / 8 pending / 1 failing. The 1 failure (`ConvertToMarkdownPanelService` "save-to-file" — Sinon can't stub `vscode.workspace.fs.writeFile`, "property descriptor is non-configurable and non-writable") is pre-existing and unrelated: confirmed because `@types/sinon` is a types-only devDependency with zero runtime footprint, and the actual `sinon` runtime version was untouched.

**Pattern worth remembering:** `sinon` and `@types/sinon` are versioned independently in `package.json`. A transitive major bump in `sinon`'s own dependencies (here `@sinonjs/fake-timers`) can silently break the build with `@types/sinon` even though `@types/sinon`'s semver range in `package.json` never changed — npm just resolves a newer patch of `@types/sinon` against a newer transitive dep than what the pinned major was designed for. **Whenever `sinon` gets bumped to a new major, immediately check whether `@types/sinon` needs a matching major bump** (`npm view @types/sinon dist-tags`) rather than assuming the existing `^17.x`-style range is still safe.

---

## Bug fix — 2026-07-23 (fixed the pre-existing `ConvertToMarkdownPanelService` "save-to-file" Sinon failure)

**Root cause:** `sinon.stub(vscode.workspace.fs, "writeFile")` fails in this VS Code test host because `vscode.workspace.fs` returns a `FileSystem` instance whose own methods (`writeFile`, etc.) have non-configurable/non-writable property descriptors — Sinon requires a configurable/writable descriptor to install a stub on an object property directly.

**Fix:** Instead of stubbing the method on the `fs` object instance, stub the `fs` **getter property on `vscode.workspace` itself** and swap in a plain object that spreads the real `fs` and overrides only `writeFile`:
```ts
writeFileStub = sinon.stub().resolves();
sinon.stub(vscode.workspace, "fs").value({ ...vscode.workspace.fs, writeFile: writeFileStub });
```
`vscode.workspace.fs` (the getter on the `workspace` namespace object) *is* configurable, even though the object it returns is not. This kept `writeFileStub` a plain, freely resolvable/rejectable Sinon stub usable across all three `save-to-file` tests (success, cancel, error) without touching the other two tests' bodies.

**Verification:** `npm run test-compile` clean, `npm run test` → 384 passing / 8 pending / 0 failing (no regressions).

**Pattern worth remembering:** When Sinon refuses to stub a method on a VS Code namespace object (e.g. `vscode.workspace.fs.*`, likely also `vscode.env.*` or similar) with "property descriptor is non-configurable and non-writable", don't try to stub the method in place — stub the **parent getter property** instead (`sinon.stub(vscode.workspace, "fs").value({ ...original, method: fakeStub })`). This works because VS Code's proxy/namespace-level getters are typically configurable even when the objects they return are frozen/sealed.

---

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

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Implemented the full-scope migration approved by Eric: folder renamed `rtf-converter/` → `convert-to-markdown/`, `RtfConverterPanelService` → `ConvertToMarkdownPanelService`, `Commands.OPEN_RTF_CONVERTER` → `Commands.OPEN_CONVERT_TO_MARKDOWN`, view type and message keywords renamed throughout. New `MarkitdownConversionService` (argv-array spawn, 10MB cap, two-layer SIGTERM/SIGKILL timeout, sandboxed temp cleanup) and new `nexkit.convertToMarkdown.pythonPath` setting. `npm run check:types` clean. Trinity added 19+11 tests covering the new service and panel; all pass.

---

## Archived 2026-07-30 (second pass) — verbose 2026-07-20..23 entries

Moved out of `history.md` by the Scribe when the file crossed the 15 KB gate. Full text preserved verbatim.

- 2026-07-30: **Prerequisite automation feature — implementation pass (9 new files, 6 modified).** Built `src/features/prerequisite-automation/` end to end: `types.ts` (all contracts + `PrerequisiteError` taxonomy + `systemClock`/`systemTimers`), `outputBuffer.ts` (1 MB tail-preserving ring buffer), `scriptResolver.ts` (pure functions taking `platform` as an explicit parameter — **never** `process.platform` — so both OS branches are testable on one runner), `nodeProcessRunner.ts` (the ONLY file in the feature importing `child_process`), `nodeFileSystem.ts`, `prerequisiteConfigService.ts`, `prerequisiteRunnerService.ts`, `prerequisiteOrchestratorService.ts`, `commands.ts`. Wired through `commands.ts` constants, `package.json` (command + 2 settings), `serviceContainer.ts`, `extension.ts`, `settingsManager.ts`. **Key design decisions worth reusing:** (1) `ScriptRunOutcome` is a 4-value enum (`completed`/`timedOut`/`scriptNotFound`/`spawnFailed`) and is authoritative — I deliberately dropped a redundant `timedOut: boolean` field so two sources of truth can never drift; callers inspect `outcome` before `exitCode`. (2) There is no `"cancelled"` outcome member: on cancellation the runner returns `outcome: "completed"`, `exitCode: null`, `failureReason: "cancelled"`, and the orchestrator checks `token.isCancellationRequested` first so the token always wins. (3) A missing script returns a synthetic result with `outcome: "scriptNotFound"` — never collapsed to exit code 1, because "your setup is broken" and "prerequisites are not validated" are different answers. (4) Every injectable seam (`IProcessRunner`, `IClock`, `ITimers`, `IFileSystem`, `IPrerequisiteLogger`) is a **defaulted constructor parameter**, so production wiring stays a one-liner while tests can override any single dependency.

- 2026-07-30: **Prerequisite automation feature — analysis/planning pass (no code written).** Confirmed the repo's feature-folder anatomy for adding a new feature: a folder under `src/features/<feature>/` containing the service(s) + a `commands.ts` exporting `register<X>Command(context, services)`, wired in five places — `src/shared/constants/commands.ts` (id constant), `package.json` `contributes.commands` (+ `contributes.configuration` for settings), `src/core/serviceContainer.ts` (interface property + `initializeServices()` instantiation + `context.subscriptions.push()` if disposable), and `src/extension.ts` (call the register function). `activationEvents` is `onStartupFinished` only — no per-command activation entries needed. **Key convention clarification: the "settings always via `SettingsManager` with `ConfigurationTarget.Global`" rule applies only to `vscode.workspace.getConfiguration().update()` (configuration), NOT to `context.workspaceState`** — `SettingsManager` already uses `workspaceState` extensively for per-workspace state (`workspaceInitialized`, `lastAppliedProfile`, `activeDevOpsConnection`, `devOpsConnections`, `repositoryCommitShas`) and `globalState` for cross-workspace state (`lastUpdateCheck`, `firstTimeUser`). So "per-workspace state" and "Global-only settings" are not in conflict — they're different storage tiers behind the same facade. **Two existing process-execution precedents to copy from:** `src/features/convert-to-markdown/markitdownConversionService.ts` uses `spawn(bin, argvArray, { shell: false })` with captured stdout/stderr and a two-layer SIGTERM-then-SIGKILL timeout (the model for headless, exit-code-driven execution); `src/features/github-workflow-runner/githubWorkflowRunnerService.ts` uses `vscode.window.createTerminal()` + `sendText` for long-running user-visible runs and `exec`/`execSync` for short capability probes, and already implements the Windows-PS1 / Unix-bash script split via `vscode.Uri.joinPath(this._extensionUri, "scripts", ...)`. `ConfirmationService.confirm(message, detail, workspaceStateKey)` is the reusable consent gate with built-in "refuse forever" persistence, and `SettingsManager.CONFIRMATION_KEYS` is where those keys are centralised. **Gotcha found while auditing the AFEAS reference scripts in `Documentation/prerequis/gl-afeas/`: PS1 and SH branches of the same "cross-platform" script pair had silently diverged** — the bash validator never persists validation state (so check→validate→check never converges on Unix), the bash setup writes to `.vscode/settings.json` while the PS1 checker reads `.vscode/afeas.local.settings.json`, and the PS1 validator ignores `minimumVersion` entirely while bash compares versions. Lesson: when orchestrating an existing ps1/sh script pair, diff their _observable contract_ (exit codes, files written, fields honoured) before building on top of them — a shared filename and a shared README do not imply shared behaviour. Also: bash scripts using `< <(...)` process substitution and `declare -a` must be invoked with explicit `bash`, never the user's `$SHELL`.

- 2026-07-23: **Convert to Markdown production-only packaging bug — root cause: missing source file, not an esbuild/vsce bug.** `src/features/convert-to-markdown/webview/index.html` was never re-created during the `rtf-converter` → `convert-to-markdown` rename (commit 503f8ae) — the old `src/features/rtf-converter/webview/index.html` was deleted in an earlier cleanup commit and `git log --all` confirmed zero history for the new path. `esbuild.config.js`'s `copyStaticFiles()` uses `if (fs.existsSync(source))` and silently skips (no log) when the source is missing, so every clean CI build produced a VSIX without `out/convert-to-markdown/index.html`, and `ConvertToMarkdownPanelService.buildWebviewHtml()` always fell back to the generic "Unable to load Convert to Markdown" page in production. Locally, `npx vsce ls` looked fine only because a stale, never-committed copy of `out/convert-to-markdown/index.html` survived in the gitignored `out/` folder from an earlier uncommitted edit — `out/` is never cleaned between builds, so a stale artifact can mask a broken source. **Lesson: when `npx vsce ls` "looks right" locally but users report missing files in production, always verify against a clean checkout (`Remove-Item -Recurse out` then rebuild) before trusting local packaging output — stale `out/`/`dist/` directories are a classic false-negative source.** Also verified `esbuild.rebuild()` correctly awaits synchronous `onEnd` plugin hooks (including `copyStaticFiles()`, which is fully sync via `copyFileSync`/`existsSync`) before resolving — so the async-ordering theory was ruled out; it wasn't a race condition. Fix: recreated the missing `index.html`, made `copyStaticFiles()` `console.warn` on missing source files (fails loud in CI logs going forward), and wired the `buildWebviewHtml()` catch block to `LoggingService.getInstance().error(...)` so the real fs error surfaces in the "Nexkit" output channel instead of being swallowed.

- 2026-07-21: The Git title-menu command receives a `vscode.SourceControl` context whose `rootUri` identifies the invoked repository. Forwarding that URI to `CommitMessageService` and comparing canonical `Uri.toString(true)` values against Git API repository roots preserves Command Palette fallback behavior while making multi-root SCM actions deterministic.

