# Link — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Stack:** TypeScript 5.x (strict), VS Code Extension API 1.105.0+, esbuild, Mocha + Sinon (testing).

**Owner:** Eric Decarufel

**My domain:** TypeScript services, DI architecture, CLI integration, file operations, service composition.

**Key files:** src/extension.ts, src/core/serviceContainer.ts, src/core/settingsManager.ts, src/shared/commands/commandRegistry.ts, src/features/*/ feature services.

## Summary of Prior Learnings

- **Worktree gotcha (ongoing):** pnpm + node_modules junction causes ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY on pnpm run and husky hook failures. Workaround: run tools directly (
px tsc, 
px eslint, 
ode ./out/test/runTest.js) and commit/push with --no-verify. For pnpm scripts use --config.verifyDepsBeforeRun=false.
- **Test host limitation:** VS Code test harness doesn't register contributed configuration; setter tests must wrap in try/catch + 	his.skip() on "not registered" errors. Default-getter tests work (fallback defaults apply).
- **Convert to Markdown production bug (2026-07-23):** Missing source files silently skipped by esbuild; stale out/ artifacts masked broken sources locally. Always clean checkout and rebuild to verify packaging. Add loud warnings when copy-static skips.
- **Settings deployer & marketplace:** Removed #main suffix from marketplace keys; added legacy normalization logic. Settings.json writes restricted to two sanctioned paths: initialization and migration.
- **GitHub Ruleset Validation (Lots 1–6, 2026-07-08):** API client, policy compiler, consent service, hook deployer. RTF Converter migration (2026-07-20) via microsoft/markitdown subprocess. SCM repository-context routing (2026-07-21) for multi-root determinism.

## 2026-09-28 — Squad MVP Implementation (SQD Sprint)

Implemented 11 major SQD tickets (see .squad/decisions.md for full details):

- **SQD-002/004/006:** Settings, Detection, Version reading — all constructor-injected for testability
- **SQD-011/015:** File service, Preset validator — read-only, pure, SquadResult<T> error pattern
- **SQD-016/017/018:** GitHub downloader, Preset sources, Composite provider — layered providers
- **SQD-020/021/025:** Init flow, Doctor, CLI chooser — backup-first semantics, never silent

**Team note (SQD-001):** Morpheus completed domain types; all SQD tickets depend on src/features/squad/models/.

**Environment patterns:**
- Worktree: run tools directly, commit --no-verify
- Tests: wrap Global setters in try/catch for "not registered"
- Services: constructor-inject I/O seams for deterministic unit tests
- GitHub I/O: error wrapping + rate-limit detection
- Error handling: SquadResult<T>-first, never silent failures

## 2026-09-28 — Follow-up issues (SQD-R1, SQD-R2)

**Issue #297 (SQD-R1: Dead legacy preset path):** Morpheus identified that after merging SQD-019 (#293) and SQD-020 (#294), the SQD-007 `selectPreset`/`applyPreset` hook actions and their host stubs are superseded by the dedicated `presetPicker` slice. Cross-team cleanup needed: Ghost removes legacy actions + `squad.presets`/`selectedPresetId` fields from webview state and AppState; Link removes corresponding dead host cases and union members. Both are return actionable errors (not silent), so removal is safe. Tracked as issue #297 for post-MVP cleanup.

**Issue #298 (SQD-R2: Service folder inconsistency):** SQD-005 files (`squadCliService.ts`, `squadProcessRunner.ts`, `squadDetectionService.ts`, `squadProjectVersionReader.ts`, `squadDoctorParser.ts`) sit at `src/features/squad/` root while SQD-011/016/017/018/020 use `src/features/squad/services/`. Link to consolidate under `services/` (pure move + import fixups, low risk). Tracked as issue #298.

## Learnings

- **SQD-R2 canonical Squad service layout (2026-09-28):** PR #300 moved the remaining root-level Squad service modules into `src/features/squad/services/` and updated `src/` + `test/` imports. Keep future Squad service/provider/process/parser modules under `services/`; `models/` remains the domain-type barrel and `validation/` remains pure validator logic.
- **SQD-030 parallel-merge pattern (2026-09-28):** Update detection now lives behind `SquadUpdateService` + `squadUpdates` contracts; when merging parallel Squad PRs, preserve every additive `ServiceContainer` service/message branch (`squadUpdates`, `squadPlugins`, `squadWrite`, `squadExport`) and rerun the full worktree validation after each base move.
- **SQD-033 export sync gotcha (2026-09-28):** Export landed in PR #303 on top of concurrent plugin/write-service changes. Shared files (`ServiceContainer`, `SquadPanelMessageHandler`, `webviewMessages`, `squadState`) are high-conflict during Squad P2; preserve all additive message/service union members and rerun both unit + webview suites after every base sync.
- **SQD-038 plugin inventory seam (2026-09-28):** PR #302 added `SquadPluginService` under `src/features/squad/services/` as the reusable read-only seam for Squad plugin marketplaces and installed plugin inventory. Keep marketplace file parsing in `SquadFileService`; lifecycle/write actions for #254 should reuse `SquadPluginService` and continue returning `SquadResult` failures rather than empty success states.
- **SQD-035 upstream display (2026-09-28):** `.squad/upstream.json` is optional when absent, but once present malformed JSON, unsupported shapes, incomplete entries, or unsupported kinds must surface as `parse-failed` errors instead of an empty success. Upstream display now belongs in its own Squad section; the status header remains a count summary.
- **SQD-026 controlled writes (2026-09-28):** PR #305 introduced `SquadFileWriteService` as the write seam separate from read-only `SquadFileService`. Future direct edits (#242/#243) should extend its allowlisted target contract and keep BackupService-before-write semantics plus sanitized webview save-result messages.
- **SQD-027 decisions/routing editing (2026-09-28):** PR #306 added optimistic concurrency for governance-doc saves: `SquadMarkdownDoc.contentHash` (SHA-256 of full on-disk bytes, `null` when absent) + `truncated`; `saveSquadDoc.baseContentHash` mismatch returns the new `write-conflict` code before any backup/write. Docs or content over `SQUAD_MAX_READ_BYTES` are refused (truncated reads must never overwrite the tail), CRLF is preserved. Preconditions live in `saveMarkdownDoc` so `saveControlledFile` stays shared/untouched. Worktree gotcha: the shared main `node_modules` junction lacked `happy-dom`; replace the junction with `pnpm install --frozen-lockfile --ignore-scripts` in the worktree instead of installing into the shared checkout.

## 2026-09-28 — Ralph Round 1, P2 Kickoff (Team Update)

**From Scribe:** SQD-R2 (issue #298, PR #300) completed and merged into feature/squad-support. Consolidated 5 Squad service files under src/features/squad/services/: squadCliService, squadProcessRunner, squadDetectionService, squadProjectVersionReader, squadDoctorParser. Pure move + import fixups. Domain types stay in models/, validation in alidation/. Canonical layout established for future Squad modules.

**Cross-team note:** Ghost (SQD-R1) removed legacy preset commands; Trinity validated webview harness (69 tests green, isolated from Electron). All post-MVP cleanup changes landed safely.

**MVP Status:** All 23 SQD PRs merged into squad/mvp-integration branch (744 tests passing, Morpheus-approved). P2 wave 1 (#241, #245, #248, #250, #253) launching now — Link to lead additional Squad features.

- **SQD-039 plugin actions (2026-09-28):** PR #308 merged into feature/squad-support. `SquadPluginActionService` runs `squad plugin …` via the allow-listed `SquadCliCommand.Plugin`; flow = validate operand (reject leading `-`/control chars) → marketplace pre-check through `SquadPluginService` (malformed manifest aborts, already-registered is a no-op) → confirm writes → BackupService → CLI. Declines return `cancelled` (not echoed as `squadError`); CLI failures remap to `plugin-action-failed` and successful writes re-post `squadPluginsUpdate`.

- **SQD-036 upstream CLI actions (2026-09-28):** PR #309 merged into feature/squad-support; issue #251 closed. Resumed an interrupted merge (all conflicts already resolved/staged; MERGE_HEAD matched base tip). While I was merging, the base moved twice (#308 plugin actions, #307 upstream recommendations). The conflicts were all additive (handler registrations in nexkitPanelMessageHandler, hook type imports, services/index.ts barrel exports), so I kept both sides. Lesson: re-fetch right before `gh pr merge`. GitHub's mergeable flag goes stale after a push when sibling PRs land in parallel.

- **SQD-028 model-config editing (2026-09-28):** PR #310 merged into feature/squad-support; issue #243 closed. `SquadFileWriteService.saveModelConfig` validates (size → JSON/schema via `parseSquadModelConfig`) before BackupService/fs, then reuses `saveControlledFile` (new `ModelConfig` kind). Base moved three times during sync (#306, #308, #307, #309). Every conflict was additive (barrel exports, type imports), so a scripted diff3 'ours+theirs' resolve worked, plus manual dedupe of duplicated import and union lines. Git's auto merge commits (`--no-edit`) don't carry the Co-authored-by trailer, so amend them before pushing.

- **SQD-051 personal Squad contract (2026-09-28):** PR for #266 adds `SquadPersonalSquadService` as the reusable precondition for #267 consult mode: personal marker absence is a successful `not-initialized` state, malformed/unreadable personal files remain actionable failures, and `squad init --global` is only run after an explicit warning that the operation targets the user profile outside the workspace. CLI allowlist now permits `--global` only on `init`; tests stub both CLI and personal file seams.
