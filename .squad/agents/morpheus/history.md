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

### Prerequisite automation plan review (2026-07-30)

Reviewed Rusty's `Documentation/prerequis/Plan-implementation-automatisation-prerequis.md`. Verdict: APPROVE WITH CHANGES.

Architectural rules confirmed/established this session:

1. **Process execution needs an explicit seam.** Any feature shelling out must depend on an injected `IProcessRunner` interface (`run(command, args, options) => { exitCode, stdout, stderr, durationMs, timedOut }`), not on `child_process` directly. Only the concrete `NodeProcessRunner` touches `spawn`. This is a deliberate upgrade over the existing house pattern (`sinon.stub(childProcess, "spawn")` used in `markitdownConversionService.test.ts`) — module-level stubbing works but is brittle and couples tests to Node internals.
2. **A class is not justified for a pure function.** Killed `ScriptSelectorService` (OS→script mapping). Precedent: `GitHubWorkflowRunnerService` does platform selection inline with `process.platform === "win32"`. DI registration has a cost; pay it only for things with state or dependencies.
3. **State that belongs to the _target_ workspace, not to the extension, still belongs in `ExtensionContext.workspaceState`** behind `SettingsManager`, not in a committed settings file. `workspaceState` is per-workspace + per-machine and switches automatically — exactly right for machine-specific validation status. A committed file would leak one dev's machine state to the whole team. Precedent: `WORKSPACE_INITIALIZED_KEY`.
4. **"Missing config file" is not always an error.** For features that run across arbitrary workspaces, absence of the feature's config (here `requirements.json`) means "not applicable" and must be a silent no-op, not an error dialog.

Recurring gap pattern in externally-authored plans: concurrency guards, `CancellationToken`, `withProgress`, disposable registration, and telemetry PII rules are consistently omitted. Precedents to cite: `commitMessageService.ts` (withProgress), `templateMetadataScannerService.ts` (CancellationTokenSource).

Verdict written to `.squad/decisions/inbox/morpheus-prereq-automation-verdict.md`.

### Prerequisite automation code review (2026-07-30)

Reviewed Link's implementation of `src/features/prerequisite-automation/`. Verdict: **APPROVE WITH MINOR CHANGES**. All three blocking conditions from the plan review were met cleanly — `IProcessRunner` is the sole `child_process` seam, `scriptResolver.ts` is pure functions with `platform` as an explicit parameter, and validation state is a `workspaceState` cache behind `SettingsManager` that is provably never read on the decision path.

Durable lessons:

1. **"Cache that never short-circuits" is verifiable by grep, and should be.** `getPrerequisitesValidated()` has exactly one definition site and zero call sites. That is the cheapest possible proof that a cache cannot cause a stale-state bug. Design caches so this check is possible: a write-only cache with a read accessor nobody calls is safe by construction. Prefer this shape whenever an external process is the real source of truth.
2. **`ConfirmationService.confirm()` treats modal dismissal (Escape / X) as `"accepted"`** — `showInformationMessage` returns `undefined` and the method falls through to the accept branch. Pre-existing and repo-wide, but it silently converts "user walked away" into consent. Anything that executes code or installs software must not rely on it until it is fixed to fail closed.
3. **Killing a child process does not kill its descendants.** `child.kill()` on a `pwsh`/`bash` installer wrapper leaves `winget`/`brew`/`apt` running. Cancellation on any long-running installer flow needs process-group semantics (`detached: true` + `process.kill(-pid)` on POSIX, `taskkill /T /F /PID` on Windows) or an explicit documented limitation.
4. **Decode process output with `stream.setEncoding("utf8")`, never `chunk.toString("utf8")` per `data` event.** Multi-byte characters split across chunk boundaries produce replacement characters. Matters here because the reference scripts emit accented French and box-drawing glyphs.
5. **A byte-size cap applied after `readFile` is not a cap.** Validate size with `stat` before reading, otherwise the guard only fires once the memory has already been allocated.
6. **When a contract says a marker is emitted first, parse the first match, not the last.** Link's `parseValidationMarker` takes the last `::VALIDATED::` occurrence; Tank's script contract specifies the marker is emitted first. Low probability, but a gratuitous divergence from a written contract.
7. **Extension-side hardening is bounded by what the scripts do.** The scripts `eval`/`Invoke-Expression` `versionCommand` from `requirements.json` on every run. The extension's argv-array + `shell: false` + filename allowlist + path containment cannot close that; only Workspace Trust does. Record it as an accepted risk rather than implying the feature is hardened end to end.

Cross-check with Tank's script contract (`.squad/decisions/inbox/tank-prereq-script-parity.md`) found agreement on state file path, exit codes, `requirements.json` location, `bash` invocation, and the `-Interactive` switch (correctly applied to `validate`/`setup` only — `Check-Validation.ps1` does not declare it). One dead signal: the extension sets `NEXKIT_NON_INTERACTIVE=1` in the child environment and no script reads it.

Review written to `.squad/decisions/inbox/morpheus-prereq-code-review.md`.

---

### 2026-07-30 — Team update (recorded by Scribe)

- **Your review findings were actioned by Ghost, not Link.** Link is locked out of this artifact under the
  reviewer-rejection protocol. Ghost's Round 4 revision made the `::VALIDATED::` parser case-sensitive,
  separator-optional, and **first-match**, closing the divergence you flagged as finding 6.
- **Your finding 7 stands as a recorded residual risk**, not a defect: the scripts `eval`/`Invoke-Expression` the
  `versionCommand` from `requirements.json`, and only Workspace Trust closes that. It is captured in `decisions.md`.
- **Tank's script contract is the authoritative reference.** Your cross-check against it is now the merged record.
- **`NEXKIT_NON_INTERACTIVE=1` remains dead signal** — injected by the extension, read by no script.
- **Trinity's verification:** 534 passing / 15 failing / 0 pending, then 541 / 0 after fixes. Four failures were
  self-inflicted test defects. Integration coverage is Windows-only — a known gap, not a regression.
- **Open item deferred to Eric:** `ConfirmationService.confirm()` fails **open** on modal dismiss (Escape = consent).
  Pre-existing and repo-wide, now gating workspace-controlled script execution. Ships as its own slice with its own
  regression test.
