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
