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

- 2026-07-24: Async unit timeout root cause in repository-sync tests was non-deterministic fake process lifecycle plus stale `out/test` artifacts. Stabilizing approach: make child-process stubs return fresh fake emitters per spawn call and trigger overlap assertions only after the first run is confirmed in-flight (`setImmediate` gate + explicit `releaseFirstRun` assertion). Also rerun `npm run test-compile` before `test:unit` when TypeScript tests changed so `out/test` matches source.

- 2026-07-24: When stubbing `vscode.window.showQuickPick` in strict TypeScript tests, `sinon.stub(...).resolves("...")` can bind to the `QuickPickItem` overload and cause `TS2345`. A minimal safe pattern is `callsFake` with explicit overload signatures (string[] and `QuickPickItem[]`) so the stub stays aligned with the real API typing.

- 2026-07-24: Repository Sync LOT 2 can stay safe and still useful by splitting pull into two stages: a strict non-destructive precheck (`status --porcelain`, branch allowlist, upstream tracking, remote reachability) and a fetch-only viability check (`fetch --prune --quiet` + `rev-list --left-right --count HEAD...@{u}`) that classifies outcomes into `success-ready`, `skipped`, `conflict-risk`, and `failed` without ever running merge/rebase. Scheduler reliability improves with run-plan caps (10 repos), bounded concurrency (2-3 from settings), overlap suppression with one queued pending run, and retry-failed-only filtering based on previous run outcomes.

- 2026-07-24: Repository-sync feature scaffolding integrates cleanly by following the existing Nexkit layering pattern: introduce typed models in `src/features/<feature>/models`, keep service logic conservative and non-destructive, wire all instances through `ServiceContainer`, expose settings only through `SettingsManager`, and register feature commands via per-feature `commands.ts` + centralized `registerCommand`. For test coverage, a lightweight baseline that validates command contributions in `package.json`, service-container presence, and command behavior with mocked scheduler/status-bar services provides strong regression protection before implementing real git operations.

- 2026-07-23: **Convert to Markdown production-only packaging bug — root cause: missing source file, not an esbuild/vsce bug.** `src/features/convert-to-markdown/webview/index.html` was never re-created during the `rtf-converter` → `convert-to-markdown` rename (commit 503f8ae) — the old `src/features/rtf-converter/webview/index.html` was deleted in an earlier cleanup commit and `git log --all` confirmed zero history for the new path. `esbuild.config.js`'s `copyStaticFiles()` uses `if (fs.existsSync(source))` and silently skips (no log) when the source is missing, so every clean CI build produced a VSIX without `out/convert-to-markdown/index.html`, and `ConvertToMarkdownPanelService.buildWebviewHtml()` always fell back to the generic "Unable to load Convert to Markdown" page in production. Locally, `npx vsce ls` looked fine only because a stale, never-committed copy of `out/convert-to-markdown/index.html` survived in the gitignored `out/` folder from an earlier uncommitted edit — `out/` is never cleaned between builds, so a stale artifact can mask a broken source. **Lesson: when `npx vsce ls` "looks right" locally but users report missing files in production, always verify against a clean checkout (`Remove-Item -Recurse out` then rebuild) before trusting local packaging output — stale `out/`/`dist/` directories are a classic false-negative source.** Also verified `esbuild.rebuild()` correctly awaits synchronous `onEnd` plugin hooks (including `copyStaticFiles()`, which is fully sync via `copyFileSync`/`existsSync`) before resolving — so the async-ordering theory was ruled out; it wasn't a race condition. Fix: recreated the missing `index.html`, made `copyStaticFiles()` `console.warn` on missing source files (fails loud in CI logs going forward), and wired the `buildWebviewHtml()` catch block to `LoggingService.getInstance().error(...)` so the real fs error surfaces in the "Nexkit" output channel instead of being swallowed.
- 2026-07-21: The Git title-menu command receives a `vscode.SourceControl` context whose `rootUri` identifies the invoked repository. Forwarding that URI to `CommitMessageService` and comparing canonical `Uri.toString(true)` values against Git API repository roots preserves Command Palette fallback behavior while making multi-root SCM actions deterministic.
- 2026-07-21: Implemented the SCM repository-context fix for Generate Commit Message and added command and integration coverage. Its focused extension-host suite passed (379 passing, 8 pending); broader type/test compilation remains blocked by pre-existing RTF-converter unresolved modules and implicit-any diagnostics.

### Archived sections (see `history-archive.md` for full detail)

- GitHub Ruleset Validation Feature (Lots 1–6, completed 2026-07-08) — API client, policy compiler, consent service, hook deployer, bootstrap orchestration.
- RTF Converter Markdown/Preview Validation (2026-07-10).
- Convert to Markdown → markitdown migration team updates (2026-07-20).
- Bug fix (2026-07-23): accented-character (mojibake) corruption on Windows — forced `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` into the markitdown subprocess env (piped stdout doesn't inherit console UTF-8 mode). Pattern: always force UTF-8 env vars explicitly for locale-dependent child processes on Windows.
- Bug fix (2026-07-23): bumped `@types/sinon` to `^22.0.0` to fix `TS2694` type-only drift vs `sinon@21`/`@sinonjs/fake-timers@15`. Pattern: keep `@types/sinon`'s major in step whenever `sinon` gets a major bump.
- Bug fix (2026-07-23): fixed a pre-existing Sinon stub failure on `vscode.workspace.fs.writeFile` (non-configurable property) by stubbing the parent `fs` getter with a spread override instead. Reusable pattern for any frozen VS Code namespace object.
