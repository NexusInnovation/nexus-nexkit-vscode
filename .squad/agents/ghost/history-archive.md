# Ghost — History Archive

## Archived Learnings (Prior to 2026-09-28)

### 2026-07-10: RTF Converter Architecture

The standalone RTF converter is fully client-side in `src/features/rtf-converter/webview/main.tsx`; its host-side panel test suite only verifies HTML injection and panel lifecycle. A rendered Markdown mode can remain local Preact state while `handleCopy` continues to copy the shared raw `markdownValue`. `markdown-it` requires `@types/markdown-it` for strict TypeScript compilation and is imported as `import MarkdownIt = require("markdown-it")` under this project's compiler settings. Pattern: isolate webview component state locally; delegate cross-boundary mutations to host messages + AppState update cycles.

### 2026-07-10: Preact Form & Hook Patterns

Webview form inputs must re-validate on every keystroke (debouncing via `setTimeout` is safe; cancel on unmount via `useEffect` cleanup). `class` (not `className` in JSX) for DOM elements. Selector hooks like `useTemplateData()` should re-filter/re-map on every render (lightweight, deterministic). Avoid direct AppState manipulation; dispatch actions through message handlers.

### 2026-07-10: Template Wizard Flowcharts & Error Boundaries

Complex flows use collapsible sections + step indicators. Each step can emit errors into a shared error slice (no scattered error notices). Modal confirmations are fully synchronous in the webview — message-based confirmation (host shows vscode dialog) requires explicit action dispatch on result. Pattern: webview handles presentation, host handles dialogs & heavy operations.



---
## Recovered snapshot (2026-07-30) — restored from VS Code local history on 2026-09-28 after a Scribe summarization dropped content

# Ghost — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension with a Preact-powered sidebar webview. Manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Stack:** TypeScript 5.x (strict), Preact (webview sidebar), esbuild bundling, Mocha + Sinon (testing).

**Owner:** Eric Decarufel

**My domain — webview architecture:**

- Components live in `src/features/panel-ui/webview/components/` (atoms / molecules / organisms)
- Hooks in `src/features/panel-ui/webview/hooks/`
- Central state: `AppState` in `src/features/panel-ui/webview/types/appState.ts`
- Message handling: `src/features/panel-ui/webview/contexts/AppStateContext.tsx`
- Root app: `src/features/panel-ui/webview/components/App.tsx`

**Critical:** This uses Preact, not React. `class` not `className`. Import from `'preact'` and `'preact/hooks'`.

**Build:** `npm run compile` | Tests: `npm test` | Lint: `npm run lint`

## Learnings

- 2026-07-10: The standalone RTF converter is fully client-side in `src/features/rtf-converter/webview/main.tsx`; its host-side panel test suite only verifies HTML injection and panel lifecycle. A rendered Markdown mode can remain local Preact state while `handleCopy` continues to copy the shared raw `markdownValue`. `markdown-it` requires `@types/markdown-it` for strict TypeScript compilation and is imported as `import MarkdownIt = require("markdown-it")` under this project's compiler settings.

- 2026-07-30: Revision-author pass on `src/features/prerequisite-automation/` (Link locked out after Morpheus's APPROVE WITH MINOR CHANGES). Key facts worth keeping:
  - **Verification commands.** `npm run compile` / `npm test` are blocked by a pre-existing pnpm gate (`ERR_PNPM_IGNORED_BUILDS`) unrelated to any feature work. Working substitutes: `.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json` (type-check), `.\node_modules\.bin\eslint.cmd src --ext ts` (lint), `.\node_modules\.bin\tsc.cmd -p ./` (compile to `out/`), `node ./out/test/runTest.js` (full suite). Do NOT run `pnpm approve-builds`.
  - **Suite baseline:** 534 passing / 15 pending / 0 failing. The runner emits hundreds of benign "Failed to get GitHub authentication session" lines; the Mocha summary is near the end of the captured output, not the visible tail.
  - **`process.platform` discipline.** The feature touches it only as an injectable default constructor parameter at a composition boundary. I added a second such default (`_platform` on `NodeProcessRunner`) for the tree-kill branch — same pattern, still testable, no new global reads.
  - **Script marker contract.** Tank's contract and the real `.ps1`/`.sh` scripts agree: `::VALIDATED::true|false` is case-sensitive, stdout-only, emitted once and first, with no separator. A trailing `\r` is harmless because the pattern stops at the value, so CRLF-terminated `Check-Validation.ps1` still parses. The parser is now strict (no `/i`, no `\s*`, first match wins).
  - **`NEXKIT_NON_INTERACTIVE` was a phantom contract** — set by the extension, read by nothing. Removed. Windows non-interactivity comes solely from `-Interactive:$false` on `Setup-Environment.ps1` / `Validate-Prerequisites.ps1`; `Check-Validation.ps1` declares no such switch.
  - **Cancellation is now a first-class `ScriptRunOutcome`**, not a `failureReason` magic string. When the kill cannot be extended to the process tree, `ScriptRunResult.descendantsMaySurvive` is set and the user-facing message says an installer may still be running rather than pretending a clean stop.
  - **Test-doubles fragility.** `IFileSystem.fileSizeBytes` was added as _optional_ on purpose — making it required would have broken every existing test double for no behavioural gain.
  - **Ordering trap.** `prerequisiteOrchestratorService.test.ts` asserts a pre-cancelled run still reaches `furthestStep === "check"`. Cancellation checks in `_ensureJq` / `_resolvePowerShellCommand` must therefore sit _after_ the probe fails and immediately before the throw — never eagerly at the top of the method.

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Rebuilt `src/features/convert-to-markdown/webview/` (index.html + main.tsx) as a thin message-passing Preact UI driven entirely by Link's `messages.ts` contract — no client-side conversion logic remains. Paste handler calls `event.preventDefault()` before reading clipboard data so pasted HTML is never inserted into the DOM. Availability gating disables (not hides) inputs with a banner + Recheck button. `ToolsSection.tsx` renamed `openRtfConverter` → `openConvertToMarkdown`. `npm run check:types` clean; merged into decisions.md.

---

### 2026-07-30 — Team update (recorded by Scribe)

- **You owned the prerequisite-automation revision** because Link was locked out under the reviewer-rejection protocol.
  Your Round 4 fix made the `::VALIDATED::` parser case-sensitive, separator-optional, and **first-match**, matching
  Tank's contract exactly. Trinity's `DIVERGENCE:` test for that behaviour is now stale and should be flipped.
- **Tank's script contract is the authoritative reference** for anything touching the AFEAS scripts — state-file path,
  0/1 exit codes, `bash` (not `sh`), and the marker semantics.
- **Morpheus accepted the `eval` / `Invoke-Expression` surface as a recorded residual risk**, closed only by Workspace
  Trust. Do not attempt to close it extension-side; do not describe the feature as hardened end to end.
- **`--skip-validation` marks state validated without validating.** The extension must never expose that flag.
- **Trinity's results:** 534 passing / 15 failing / 0 pending, then 541 / 0 after your fixes. Integration coverage is
  Windows-only.
- **Open item deferred to Eric:** `ConfirmationService.confirm()` fails **open** on modal dismiss (Escape = consent).
  Pre-existing and repo-wide, but it now gates workspace-controlled script execution. Ships as its own slice.

### 2026-07-30 — Team update: ConfirmationService now fails closed (recorded by Scribe)

- **Dismissal is no longer consent.** `ConfirmationService.confirm()` shipped its fix (Link, own slice). The accept
  branch is an explicit `=== "Accept"` comparison; everything else — including `undefined` from Escape, the close
  button, or focus loss — returns `"refused"`.
- **This changes the behaviour of the prerequisite-automation code you revised.** `prerequisiteOrchestratorService`
  `.checkAndSetup()` previously **ran the workspace scripts** on an accidental Escape; it now returns `"declined"` and
  logs that the user declined. No caller edit was needed — every `confirm()` caller already used the guard
  `if (result !== "accepted") { return; }`.
- **`confirmOnce()` was already correct** (`return result === "Continue"`) and is unchanged. It now has a regression
  test pinning it so it cannot drift.
- **Dismissal returns `"refused"`, never `"refused-forever"`** — nothing is persisted, so an accidental Escape costs
  one extra prompt, not a silent workspace lockout.
- **Still open, routed to Morpheus:** callers 1–3 (`deployWorkspaceMCPServers`, `addUserMCPServer`,
  `addWorkspaceMCPServer`) fail **silently** on refusal — bare `return`, no user feedback. Pre-existing, shared with
  the explicit-Refuse path, deliberately not fixed here.
- **Suite:** 536 passing / 15 pending / 0 failing (baseline 534 / 15 / 0).


---
## Recovered snapshot (2026-08-06) — restored from VS Code local history on 2026-09-28 after a Scribe summarization dropped content

# Ghost — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension with a Preact-powered sidebar webview. Manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Stack:** TypeScript 5.x (strict), Preact (webview sidebar), esbuild bundling, Mocha + Sinon (testing).

**Owner:** Eric Decarufel

**My domain — webview architecture:**

- Components live in `src/features/panel-ui/webview/components/` (atoms / molecules / organisms)
- Hooks in `src/features/panel-ui/webview/hooks/`
- Central state: `AppState` in `src/features/panel-ui/webview/types/appState.ts`
- Message handling: `src/features/panel-ui/webview/contexts/AppStateContext.tsx`
- Root app: `src/features/panel-ui/webview/components/App.tsx`

**Critical:** This uses Preact, not React. `class` not `className`. Import from `'preact'` and `'preact/hooks'`.

**Build:** `npm run compile` | Tests: `npm test` | Lint: `npm run lint`

## Learnings

- 2026-08-06: Added the panel UI trigger for "Create Branch from Work Item" — `createBranchFromWorkItem` handler +
  new `CollapsibleSection` in `ToolsSection.tsx`, mirroring the existing `openConvertToMarkdown` fire-and-forget
  button pattern exactly. No new `AppState`/hook needed when the extension host already owns the command, message
  type, and handler wiring — the panel button can stay a thin trigger. No test file existed yet for
  `ToolsSection.tsx`, so none was added. `npm run check:types` clean, `npm test` → 420 passing, no regressions.
- 2026-07-10: The standalone RTF converter is fully client-side in `src/features/rtf-converter/webview/main.tsx`; its host-side panel test suite only verifies HTML injection and panel lifecycle. A rendered Markdown mode can remain local Preact state while `handleCopy` continues to copy the shared raw `markdownValue`. `markdown-it` requires `@types/markdown-it` for strict TypeScript compilation and is imported as `import MarkdownIt = require("markdown-it")` under this project's compiler settings.

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Rebuilt `src/features/convert-to-markdown/webview/` (index.html + main.tsx) as a thin message-passing Preact UI driven entirely by Link's `messages.ts` contract — no client-side conversion logic remains. Paste handler calls `event.preventDefault()` before reading clipboard data so pasted HTML is never inserted into the DOM. Availability gating disables (not hides) inputs with a banner + Recheck button. `ToolsSection.tsx` renamed `openRtfConverter` → `openConvertToMarkdown`. `npm run check:types` clean; merged into decisions.md.

