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

- 2026-08-06: **Bug fix — telemetry `resolutionSource: "activeConnection"` was inaccurate for the single-connection
  path.** In `devOpsBranchCreationService.ts`'s `_resolveTarget()`, the `connections.length === 1` branch now checks
  `onlyConnection.isActive` and, when `false`, calls `await this._devOpsConfig.setActiveConnection(onlyConnection.id)`
  before returning — so the label actually reflects the resulting state (approved by Eric, side effect accepted:
  `setActiveConnection` rewrites `.vscode/mcp.json` and triggers `workbench.action.reloadWindow` after a 500ms
  delay via `DevOpsMcpConfigService.reloadWindowForMcpChange()`). Wrapped in try/catch — a failure only logs via
  `this._logging.warn(...)` and branch creation still proceeds with `resolutionSource: "activeConnection"` returned
  regardless (telemetry accuracy isn't allowed to block the actual feature). No changes needed to
  `ResolvedDevOpsTarget` — `"activeConnection"` was already in the union. Test mock `devOpsConfig` in
  `devOpsBranchCreationService.test.ts` needed a `setActiveConnection: sandbox.stub().resolves()` added alongside
  `getConnections` (wasn't there before — the single-connection tests only asserted on `getConnections`). Added 3
  tests: not-active → `setActiveConnection` called with the connection's `id`; already-active → not called;
  `setActiveConnection` rejects → target still resolves and telemetry still fires. `npm run check:types` clean,
  `npm test` → 447 passing, 8 pending, 0 failing.

- 2026-08-06: **SCM "Create Branch from Work Item" menu entry + protected-branch commit prompt.** Added
  `nexus-nexkit-vscode.createBranchFromWorkItem` to the `nexus-nexkit-vscode.commitMenu` submenu in `package.json`
  (`group: "1_generate@2"`, right after Generate Commit Message, before Open Settings — command/contribution entry
  already existed). Separately, `CommitMessageService.generateCommitMessage()` now calls a new private
  `_maybeProposeBranchCreation(repo)` helper immediately after `repo.inputBox.value = trimmed;` (only when `trimmed`
  is non-empty). Protected branch list lives as a small local const in `commitMessageService.ts` itself:
  `const PROTECTED_BRANCHES = ["main", "develop"];` (exact, case-sensitive match, no settings/config — intentionally
  not put in `SettingsManager`). Reads current branch via `repo.state.HEAD?.name` (added `HEAD?: { name?: string }`
  to the local `GitRepository` shim interface, mirroring the real Git extension API). If HEAD is undefined
  (detached/unknown) or the branch isn't in the protected list, it silently returns — no prompt, no throw. If
  protected, shows a French `vscode.window.showWarningMessage` (`"Nexkit: Vous êtes sur la branche protégée
\"${currentBranch}\". Créer une branche avant de committer ?"`) with one action button
  (`"Créer une branche depuis un élément de travail"`); on that response it executes
  `Commands.CREATE_BRANCH_FROM_WORK_ITEM` via `vscode.commands.executeCommand`. Dismissing/no-action does nothing —
  the commit message always stays in the input box regardless of the prompt outcome. No new imports/deps beyond
  `Commands` from `shared/constants/commands`; deliberately did not add `TelemetryService` (file has none today).
  Test mocks: existing repo mocks in `commitMessageService.integration.test.ts` don't need `HEAD` (undefined is a
  valid, non-throwing state); added a `mockHead` var + `state.HEAD` getter to the primary mock repo and 4 new tests
  (main → prompt+execute, develop → prompt+dismiss-no-execute, feature branch → no prompt, HEAD undefined → no
  prompt). `npm run check:types` clean, `npm test` → 444 passing, 0 failing.

- 2026-08-06: **Branch prefix mapping added to `branchNameBuilder.ts`.** Replaced the raw slugified work-item-type
  prefix with an industry-standard mapping table (`WORK_ITEM_TYPE_PREFIXES: Record<string, string>`, co-located in
  `branchNameBuilder.ts` itself — small enough not to warrant a separate file). Bug/Issue → `bugfix`; User
  Story/Product Backlog Item/Requirement/Feature/Epic/Improvement → `feature`; POC/Spike → `experiment`; Technical
  Debt/Task/Impediment/Risk/Review/Change Request → `chore`; Test Case → `test`; Documentation → `docs`. Lookup
  normalizes the raw `workItem.type` via `normalizeTypeName()` (trim, lowercase, collapse internal whitespace/hyphens
  to a single space) before matching table keys (written in the same normalized form, e.g. `"product backlog item"`).
  Unmapped/custom types fall back unchanged to the original behavior: `slugify(type) || FALLBACK_TYPE_SLUG`.
  `hotfix`/`ci`/`release`/`refactor` are intentionally NOT mapped from any work item type — no clean 1:1 signal.
  Updated `branchNameBuilder.test.ts` (existing "Bug"→`bug/` and "Product Backlog Item"→`product-backlog-item/`
  assertions now expect `bugfix/`/`feature/`; added per-type mapping coverage, case-insensitivity, and unmapped-type
  fallback tests) and `devOpsBranchCreationService.test.ts` (integration mocks hardcoded the old `bug/42-...` branch
  name — updated to `bugfix/42-...`). `npm run check:types` clean, `npm test` → 440 passing, 8 pending, exit code 0.
- 2026-08-06: **DevOps Branch Creation — implemented.** New feature folder `src/features/devops-branch-creation/`
  (models, `AzureDevOpsAuthService`, `AzureDevOpsRestClient`, `branchNameBuilder`, `DevOpsBranchCreationService`,
  `commands.ts`), plus `parseAzureReposGitRemoteUrl()` added to `devOpsUrlParser.ts`. Auth via
  `vscode.authentication.getSession("microsoft", ["499b84ac-1321-427f-aa17-267ca6975798/.default"], { createIfNone: true })`.
  Work item REST call scoped to org + id only (`GET https://dev.azure.com/{org}/_apis/wit/workitems/{id}?api-version=7.1`)
  — project is never sent, since work item IDs are unique per-org. Branch naming slugifies the raw
  `System.WorkItemType` (no hardcoded type→prefix table). Git extension API shim follows the `commitMessageService.ts`
  precedent (local minimal TS interfaces per file), extended with `state.remotes`, `createBranch()`, `getBranch()`,
  `checkout()`. Panel vs Command Palette trigger disambiguation reuses the existing optional-arg convention from
  `UPDATE_INSTALLED_TEMPLATES` rather than a special-cased handler. Telemetry (`devops.branch.created`) includes
  `organization` (per Eric's approval, aligned with `devops.connection.added` precedent) plus `workItemType`,
  `resolutionSource`, `triggerSource` — never project, title, or branch name. `npm run check:types` clean, `npm test`
  → 420 passing, 8 pending.
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
