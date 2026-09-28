# Morpheus — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories. Handles workspace initialization, MCP server configuration, and automated extension self-updates.

**Stack:** TypeScript 5.x (strict), VS Code Extension API 1.105.0+, Preact (webview sidebar), esbuild (bundling), Mocha + Sinon (testing), semantic-release + Conventional Commits.

**Owner:** Eric Decarufel

**Architecture:** Service-oriented with dependency injection via `ServiceContainer`. All services instantiated in `src/core/serviceContainer.ts`.

**Key contact for approval:** Eric De Carufel (provides clarifications, approves architecture decisions)

## Learnings

### GitHub Ruleset Validation Feature

**Key Decisions (2026-07-08):**

1. **Strict Pattern Matching** — When translating GitHub ruleset patterns to local Git hooks, maintain full semantic parity. Any pattern that cannot be strictly evaluated must be marked as unsupported (server-only), not approximated. This ensures local validation never silently accepts commits that GitHub would reject.

2. **Dual-Hook Enforcement** — Branch-name and commit-message rules must run at both `commit-msg` AND `pre-push` Git hooks, not just one. This prevents edge cases where commits created outside VS Code bypass validation.

3. **Explicit Consent UX** — First-time hook activation requires active user approval ("Activer localement" button), not passive/silent acceptance. This respects user autonomy and makes debugging easier if hooks cause issues.

4. **Include Org-Level Rulesets** — Use `includes_parents=true` when reading GitHub rulesets API so organization/enterprise-level rules are captured in V1, not just repo-level rules.

**Architecture Principle:**

- Two-layer design: remote read layer (GitHub REST API) + local enforcement layer (rule translation)
- Keeps GitHub API concerns isolated from hook generation
- Makes unsupported rules explicit rather than overloading the hook deployer
- Read-only sync pattern: user consents once per repo; subsequent refreshes run silently

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Eric approved the full scope expansion over the prior narrow proposal: ALL formats (not just new ones) now route through markitdown, and the full internal rename (RTF-to-Markdown → Convert to Markdown, including class/command/view-type identifiers, not just user-visible text) is done. Link/Ghost/Trinity delivered implementation, webview, and 30 passing tests respectively — merged into decisions.md ("Convert to Markdown — full markitdown migration (supersedes narrow-scope architecture)" and "...implementation, webview, and test details"). The previously-flagged stale-`out/` test-compile follow-up was hit again this session (Mocha crashed on a leftover compiled artifact from a long-deleted `cron-schedule-builder` feature) — resolved by deleting `out/` and rebuilding; still worth adding a clean step to `pretest` to stop recurring.

## Team update — 2026-09-28 (SQD-001 Squad domain types)

Delivered the foundation types for the Squad epic under `src/features/squad/models/` (barrel `index.ts`). Layout: `squadResult.ts` (SquadResult<T> discriminated union + structured SquadError with actionable remediation — the "errors visible, never a success state" contract), `squadDetection.ts` (FR-001/002/003 markers, install/version status, CLI info), `squadRoster.ts` (FR-022/023), `squadDocs.ts` (FR-024), `squadPreset.ts` (FR-010/011/012), `squadDoctor.ts` (FR-060), `squadConfig.ts` (upstreams/plugins/model/Ralph), `squadProfileConfig.ts` (FR-065). Types/const-maps only, no service logic; no `vscode` imports so webview can consume them. Convention reinforced: const-asserted PascalCase objects (not TS `enum`), `unknown` as a first-class version state. Gotcha hit: a JSDoc line containing `agents/*/charter.md` — the `*/` prematurely closes the block comment and breaks tsc/eslint parsing; reworded to `<id>`. Ran mocha directly with `--ui tdd` on the compiled test to validate without spinning up the full VS Code host. Decision note in `.squad/decisions/inbox/morpheus-squad-domain-types.md`.

## Team update — 2026-09-28 (SQD-001 Squad domain types)

Delivered the foundation types for the Squad epic under `src/features/squad/models/` (barrel `index.ts`). Layout: `squadResult.ts` (SquadResult<T> discriminated union + structured SquadError with actionable remediation — the "errors visible, never a success state" contract), `squadDetection.ts` (FR-001/002/003 markers, install/version status, CLI info), `squadRoster.ts` (FR-022/023), `squadDocs.ts` (FR-024), `squadPreset.ts` (FR-010/011/012), `squadDoctor.ts` (FR-060), `squadConfig.ts` (upstreams/plugins/model/Ralph), `squadProfileConfig.ts` (FR-065). Types/const-maps only, no service logic; no `vscode` imports so webview can consume them. Convention reinforced: const-asserted PascalCase objects (not TS `enum`), `unknown` as a first-class version state. Gotcha hit: a JSDoc line containing `agents/*/charter.md` — the `*/` prematurely closes the block comment and breaks tsc/eslint parsing; reworded to `<id>`. Ran mocha directly with `--ui tdd` on the compiled test to validate without spinning up the full VS Code host. Decision note in `.squad/decisions/inbox/morpheus-squad-domain-types.md`.

## Team update — 2026-09-28 (Squad MVP merge-train review + integration)

Acted as reviewer gate for the 23-PR Squad MVP (SQD-001..025, #216–240). Built integration branch `squad/mvp-integration` from `feature/squad-support` in the worktree; real `pnpm install --frozen-lockfile` (no junction) let pnpm scripts + lefthook hooks run normally — no `--no-verify` needed. Merged all 23 PRs in topological order as real merge commits (preserves authorship). 20 clean; 3 pure-additive union conflicts resolved: styles.css (#293: SQD-010+SQD-019 CSS blocks), webviewMessages.ts + nexkitPanelMessageHandler.ts (#292: SQD-019 preset handler + SQD-025 CLI-setup handler — unioned imports/fields/ctor/delegation, single `runSquadDoctor`). No code fixes needed beyond conflicts: tree passed all gates first try — check:types/lint/test-compile all green, `pnpm test` **744 passing / 11 pending / 0 failing**, webview bundle clean. Pushed to origin; did NOT open a PR or merge into feature/squad-support (Eric's action).

Review: verified cross-cutting conventions across the whole merged surface via grep+targeted reads rather than 23 full diffs — SettingsManager+Global target ✅, no direct getConfiguration in squad ✅, CLI `shell:false`+explicit allowlist+cmd.exe /d/s/c shim wrapping ✅, single centralized webview message listener (vscodeMessenger) ✅, no dangerouslySetInnerHTML (safe markdown = escaped `<pre>`) ✅, lazy DI/no activation work ✅, downloader UA header+GitHubApiError+rate-limit+maxFiles ✅, telemetry only command-id/exit-code ✅, backup-before-write + traversal guard + rollback in SquadInitService ✅. Posted 23 `gh pr review --comment` verdicts (author-owned PRs, so --comment not --approve). **23/23 APPROVE, 0 reject** — genuinely sound work.

Two non-blocking coherence findings (emergent from parallel dev, not any single PR's defect): R1 🟠 dead legacy preset path — SQD-007's `selectPreset`/`applyPreset` hook actions + SQD-008 host stubs are invoked by no component after #293/#294's dedicated `presetPicker` slice superseded them (assign Ghost+Link cross-revision); R2 🟡 squad service files split between `squad/` root and `squad/services/` (assign Link, folder consolidation). `saveSquadCharter`/`saveSquadDoc` stubs are legitimately deferred (FR-023/024), not dead.

Strategy recommended to Eric: **Option (b)** — merge the single integration branch (conflicts resolved once, validated green, per-PR authorship preserved via merge commits) and close the 23 PRs as superseded; NOT one-by-one (GitHub would re-hit the same 3 conflicts across 23 CI runs). Decision: `.squad/decisions/inbox/morpheus-mvp-merge-train.md`.

Process learning: for large parallel PR stacks, grep-based convention sweeps across the merged tree catch violations faster and more completely than reading each diff in isolation — the emergent issues (dead paths, folder drift) only surface *after* integration, so review the integrated whole, not just the parts. Decision inbox docs from Link/Ghost gave reliable design intent to verify against.
