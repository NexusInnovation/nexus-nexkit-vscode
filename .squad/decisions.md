# Squad Decisions

> Entries older than 30 days are periodically moved to `decisions-archive.md` by the Scribe.

## Decision: Convert to Markdown — fix accented character (mojibake) corruption on Windows

**Date:** 2026-07-23
**Agent:** Link (approved by Eric Decarufel)
**Classification:** Project-specific — `convert-to-markdown` feature (bug fix)

### Context

On Windows (reported on a French install), the `markitdown` Python subprocess does not default to UTF-8 for stdout when piped rather than attached to a real console — it falls back to the OS locale codepage (e.g. cp1252 on fr-FR). Node then force-decoded the resulting single-byte accented characters as UTF-8, producing exactly one U+FFFD replacement character per accented letter, matching the reported corruption pattern.

### Decision

`MarkitdownConversionService._runMarkitdown()` and `_probeInterpreter()` now spawn the Python subprocess with `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` forced into the child's environment (spread alongside `...process.env`). The temp-file write path (`Buffer.from(text/html, "utf8")`) was already correct and untouched — the fix lives entirely at the subprocess environment layer.

### Tests

Added a "forced UTF-8 subprocess encoding" suite (2 tests) in `test/suite/markitdownConversionService.test.ts` asserting these env vars are present on both spawn call sites, and that the rest of `process.env` is still preserved.

### Verification

`npm run check:types` clean, `npm run compile` clean, `npm test` → 378 passing (2 new tests added; 2 pre-existing unrelated failures — `RtfConverterPanelService`, `commitMessageCommands` — confirmed via `git stash` to predate this change).

### Why

Whenever spawning a Python (or other locale-dependent runtime) child process on Windows with piped stdio expecting UTF-8 text back, force UTF-8 explicitly via env vars rather than relying on the OS default locale/codepage — CPython's UTF-8 console-encoding change only applies to a real interactive console, not to redirected pipes.

---

## Decision: Convert to Markdown — full markitdown migration (supersedes narrow-scope architecture)

**Date:** 2026-07-20
**Agent:** Morpheus (approved by Eric De Carufel)
**Classification:** Project-specific

### Context

Morpheus first proposed a narrow-scope architecture: keep `mammoth`/`rtf.js`/`turndown`/`turndown-plugin-gfm` for existing formats (paste-HTML, .docx, .rtf, .html, plain text) and route only genuinely new formats (.pptx, .pdf, .xlsx, images) through `microsoft/markitdown` via a Python child process. This was to minimize blast radius and avoid making Python a mandatory dependency for the whole feature. Internal identifiers (`RtfConverterPanelService`, `OPEN_RTF_CONVERTER`, `nexkitRtfToMarkdown`, etc.) were originally left unrenamed — only user-visible text was to change.

Eric explicitly overrode this narrower recommendation to maximize consistency (one conversion engine, one code path).

### Decisions

#### All formats route through markitdown

Every input path — paste-HTML, paste-plain-text, .docx, .rtf, .html, .pptx, .pdf, .xlsx, images, .txt — is now converted host-side via a Python child process running `markitdown`. The entire client-side conversion stack (`mammoth`, `rtf.js`, `turndown`, `turndown-plugin-gfm`, their type shims) is deleted. `markdown-it` is retained — it renders the final Markdown output for the Preview toggle only (output-side concern, unrelated to input parsing).

#### New setting `nexkit.convertToMarkdown.pythonPath`

String, default `""` (auto-detect via `python3`/`python`/`py` candidates), wired through `SettingsManager.getConvertToMarkdownPythonPath()`, for non-standard Python installs.

#### Full internal rename (not just user-visible text)

- Folder `src/features/rtf-converter/` → `src/features/convert-to-markdown/`
- Class `RtfConverterPanelService` → `ConvertToMarkdownPanelService`
- Command id `nexus-nexkit-vscode.openRtfConverter` → `nexus-nexkit-vscode.openConvertToMarkdown`
- `Commands.OPEN_RTF_CONVERTER` → `Commands.OPEN_CONVERT_TO_MARKDOWN`
- `VIEW_TYPE` `"nexkitRtfToMarkdown"` → `"nexkitConvertToMarkdown"`
- Sidebar message keyword `"openRtfConverter"` → `"openConvertToMarkdown"` (in `webviewMessages.ts`, `nexkitPanelMessageHandler.ts`, `ToolsSection.tsx`)
- `CollapsibleSection` id `tools-rtf-converter` → `tools-convert-to-markdown`

#### New host-side service `MarkitdownConversionService`

Behind an interface, injected into the panel service (constructor injection, mockable) and registered in `serviceContainer.ts`. Owns: availability detection (python/markitdown presence, cached per session, user-triggerable recheck), sandboxed temp-file handling with guaranteed cleanup, `child_process.spawn` with argv array (`shell: false`, no string interpolation), 10MB size cap enforced before writing to disk, and a two-layer timeout (SIGTERM soft timeout, SIGKILL hard timeout as safety net).

#### Message contract

New host↔webview `postMessage`/`onDidReceiveMessage` channel (previously the feature was client-only). Shared pure-type definitions live in `src/features/convert-to-markdown/messages.ts` (no runtime code, importable from both host and webview bundles).

### Why

Introducing a mandatory external Python runtime dependency into a VS Code extension carries real risk (installation friction, version drift, CI/test environment gaps) and was flagged loudly to Eric before implementation. Eric accepted the full-pipeline Python dependency as a deliberate trade-off for consistency; Morpheus's availability-risk flag (single point of failure for the whole feature, not just 4 formats) stands as documented, and the decision is approved and superseding.

---

## Decision: Convert to Markdown — implementation, webview, and test details

**Date:** 2026-07-20
**Agents:** Link, Ghost, Trinity
**Classification:** Project-specific

### Context

Implementation of the markitdown migration and full rename described in the architecture decision above, split across three agents by file ownership.

### Decisions

#### Link — `MarkitdownConversionService` / `ConvertToMarkdownPanelService`

- `webview-ready` and `recheck-availability` both resolve via a shared `_postAvailabilityStatus()` helper; `recheck-availability` additionally calls `invalidateAvailabilityCache()` first so the interpreter is re-probed on demand instead of trusting a stale in-memory cache.
- `sourceLabel` convention: `"Pasted HTML"` / `"Pasted text"` for paste flows, and the original (untrusted) `fileName` string for file conversions — safe because `sourceLabel` is only used for UI display, never as a filesystem path (the temp file uses a UUID name + validated extension only, via `_extractValidatedExtension`).
- `MarkitdownConversionService` caches both the availability result and the concrete resolved interpreter binary (`python3`/`python`/`py`/configured path) together, so a later conversion reuses the exact interpreter that was probed (avoids a TOCTOU-style mismatch between probe and use).
- Timeout implementation: two plain `setTimeout` timers — soft (`SIGTERM`) then hard (`SIGKILL`) scheduled only once the soft timer fires — rather than one timer with internal phase tracking. Both timers are cleared on `close`/`error` regardless of which fired.
- Error sanitization: `_convert()`'s catch-all always logs the raw error via `LoggingService.error()` but always rethrows a fixed generic message to the caller. Exception: the availability-not-found message echoes the user's own configured `nexkit.convertToMarkdown.pythonPath` value (user's own input, not an internal path — no sanitization concern).

#### Ghost — standalone webview rebuild

Rebuilt `src/features/convert-to-markdown/webview/` (index.html + main.tsx) as a thin message-passing Preact UI. No client-side conversion logic remains — all `WebviewToHostMessage`/`HostToWebviewMessage` types come from Link's `messages.ts`. Kept `markdown-it` for the raw/preview toggle only, rendering host-returned Markdown — never raw pasted HTML (paste handler calls `event.preventDefault()` before reading clipboard data, so pasted HTML is never inserted into the DOM). Availability gating disables (not hides) the paste area/upload input while `available !== true`, with a persistent banner + Recheck button. `ToolsSection.tsx` renamed `openRtfConverter` → `openConvertToMarkdown`.

#### Trinity — test coverage

- `test/suite/markitdownConversionService.test.ts` (19 tests): stubs `child_process.spawn` via Sinon — never spawns real Python. Covers availability detection + caching + invalidation, configured-interpreter-only behavior, all-candidates-fail with non-leaking reason, argv-array/no-shell security assertion, 10MB cap (no spawn call), temp-dir cleanup on success/error/spawn-error paths, two-layer SIGTERM/SIGKILL timeout via `sinon.useFakeTimers()`, and sanitized error messages (no temp path/stack leak to caller).
- `test/suite/convertToMarkdownPanelService.test.ts` (11 tests): fakes `IMarkitdownConversionService` and stubs `vscode.window.createWebviewPanel`. Covers panel creation/reveal-not-recreate, all 5 `WebviewToHostMessage` types, conversion-error posting on rejection, and safe dispose (including double-dispose).
- Updated `extension.test.ts`, `nexkitPanelMessageHandler.test.ts`, `serviceContainer.test.ts` for the rename; added a `markitdownConversion` presence assertion to `serviceContainer.test.ts`.
- Deviation: no Preact/DOM tests for `main.tsx` — no DOM test harness (jsdom/Testing Library/Preact test utils) exists in this repo yet, consistent with prior team decision to keep that a manual-verification boundary.

### Why

Keeps CI hermetic (no real Python/markitdown dependency in tests), locks down the security-sensitive spawn contract (argv array, `shell:false`, no path/stack leakage) as a regression guard, and matches the host-never-trusts-webview-HTML security intent.

---

## Decision: GitHub Ruleset Validation — PRD open questions resolved

**Date:** 2026-07-08
**Agent:** Squad (Coordinator), approved by Eric Decarufel
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Morpheus's PRD for the GitHub Rulesets local-validation feature (`src/features/ruleset-validation/`) listed 4 open questions blocking implementation. Eric answered them directly.

### Decisions

1. **Initial notification requires explicit consent.** The first-time `showInformationMessage` is not merely informational — the user must actively approve ("Activer localement") before Nexkit installs any Git hooks. Silent/passive acceptance is NOT sufficient.
2. **Enforce at both `commit-msg` AND `pre-push` hooks.** Branch-name and commit-message validation must run at both stages, not just one.
3. **Regex/pattern matching is strict, not best-effort.** If a rule's pattern/operator cannot be evaluated with full parity to GitHub's semantics, it must be treated as unsupported (server-only) rather than approximated locally.
4. **Include inherited/org-level rulesets in V1.** Use `includes_parents=true` when calling `GET /repos/{owner}/{repo}/rulesets` so organization/enterprise-level rules are captured, not just repo-level ones.

### Impact on PRD

- §7 Étape 4 (notification): remove the "passive acceptance" alternative — consent flow is mandatory.
- §7 Étape 5 (hooks): both `commit-msg` and `pre-push` are in scope for V1 (already primary proposal — now confirmed, no fallback to single-hook).
- §6/§7: `RulesetPolicyCompilerService` must fail closed (mark as `unsupportedRules`) on any pattern it cannot strictly evaluate — no fuzzy/partial matching.
- §5 API integration: `includes_parents=true` is confirmed mandatory for V1, not optional.

---

## Decision: GitHub Ruleset Validation — Architecture (Lot 1 scope)

**Date:** 2026-07-08
**Agent:** Morpheus
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Nexkit must add local validations that mirror GitHub rulesets for the currently opened repository, but only when that repository is hosted on GitHub or GitHub Enterprise. The feature must remain non-blocking during activation, reuse existing GitHub authentication flows, and fit the current service-oriented architecture.

### Proposed decision

Implement the feature as a dedicated `ruleset-validation` feature with a two-layer design:

1. **Remote read layer** — a mockable GitHub ruleset client/provider that only reads rulesets and applicable branch rules from the GitHub REST API.
2. **Local enforcement layer** — a compiler/deployer that translates the supported subset of rules (`branch_name_pattern`, `commit_message_pattern`) into local Nexkit-managed hook artifacts and native Git hooks.

### Why

- Keeps GitHub API concerns isolated from hook generation and local file deployment.
- Makes unsupported rules explicit instead of overloading the hook deployer with partial API logic.
- Preserves testability: GitHub API, git remote detection, cache persistence, and hook rendering can be unit-tested independently.
- Supports future iterations where more ruleset types are translated without changing initialization orchestration.

### Initial boundaries

- **Read-only** against GitHub rulesets: no create/update/delete through Nexkit.
- **Supported V1 translations only:** branch naming and commit message rules.
- **Cache under `.nexkit/rulesets/`** to keep workspace-local state inspectable and portable with the repo clone.
- **User consent only on first successful sync per workspace/repository fingerprint**; subsequent refreshes run silently unless the cache becomes invalid or auth is lost.

---

## Decision: Ruleset API client pagination (Lot 2)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Implementation of the GitHub Rulesets API client layer for fetching rulesets from the REST API.

### Decision

The GitHub Rulesets client uses native `fetch` (like `extensionGitHubReleaseService`) and explicitly follows pagination via the HTTP `Link` header instead of assuming a single page response.

### Why

- The `GET /repos/{owner}/{repo}/rulesets` endpoint supports `per_page` and `page` parameters, so a V1 implementation must remain correct even for repositories inheriting many rulesets from organization/enterprise level.
- Centralizing GitHub header management, `GitHubAuthHelper` authentication, and error categorization in a dedicated client keeps Lot 3 focused on policy compilation rather than network details.

---

## Decision: Policy compiler and cache implementation details (Lot 3)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Implementation of policy caching and regex pattern validation for local ruleset enforcement.

### Decisions

1. **Policy hash computation** is implemented in `rulesetCacheService.ts` as an exported helper function (`computeRulesetPolicyHash`) reused by both the compiler and cache store to prevent divergence between the hash calculated during compilation and the hash persisted in cache.

2. **Strict regex validation** applies a fail-closed heuristic focused on GitHub/RE2 parity: any regex containing backreferences (`\1`–`\9`) or lookarounds (`(?=)`, `(?! )`, `(?<=)`, `(?<!)`)) is classified as `unsupportedRules`, even if JavaScript's `new RegExp()` accepts it.

### Why

- `sourceHash` must reflect a single canonical policy definition to correctly trigger silent redeployments when a ruleset changes.
- The product confirmed strict matching only: rejecting constructs known to diverge from RE2 avoids false positives/negatives between Nexkit's local validation and GitHub's server-side validation.

---

## Decision: Session-scoped decline caching (Lot 4)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Management of user consent state for the ruleset validation feature during VS Code sessions.

### Decision

When a user clicks **"Plus tard"** or dismisses the consent popup, `RulesetConsentService` treats that as a session-scoped decline and returns `already-declined-this-session` on subsequent calls for the same repository fingerprint during the same extension session.

### Why

The requested API explicitly exposes the `already-declined-this-session` result. An in-memory per-service cache avoids repeat consent prompts in the same session while preserving the product rule that dismissal is **not** approval and must not persist `approved=true`.

---

## Decision: Hook runtime path resolution (Lot 5)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Runtime configuration of generated Git hooks to handle edge cases like worktrees and separate gitDirs.

### Decisions

1. **Repository root resolution** in generated hook scripts under `.nexkit/git-hooks/` uses `__dirname` with a fixed path calculation (`repoRoot = path.resolve(__dirname, "..", "..")`) rather than `process.cwd()` to remain correct even when Git executes the hook from a different working directory or via a separate `gitDir` (worktree).

2. **Pre-push commit range** calculation: when the remote SHA1 is all zeros (new branch on the remote), the validated commit range is calculated with `git log <localSha> --not --remotes=<remoteName>`. This strategy targets commits unknown to the named remote without revalidating the entire local history.

### Why

- Native Git hooks sometimes live in a `gitDir` outside the workspace (`.git` text file for worktrees); basing resolution on the Nexkit script location avoids fragile working-directory dependencies.
- The `pre-push` protocol provides no usable remote boundary for a new branch. `--not --remotes=<remoteName>` is the most precise compromise available locally to approximate "commits actually being pushed".

---

## Decision: Ruleset bootstrap orchestration and hook-toggle wiring (Lot 6)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Integration of GitHub ruleset validation into the existing startup verification and hook management infrastructure.

### Decisions

1. **Bootstrap interactivity** is proxied through `deployUserLevelSettings`:
   - `verifyOnStartup()` passes `deployUserLevelSettings: false`, so ruleset bootstrap runs silently and never opens the first-time consent popup during VS Code startup.
   - Explicit workspace verification/initialization keeps the default `true`, so the consent popup can appear only during intentional user-triggered flows in V1.

2. **Hook-level toggles** are enforced by extending `GitRulesetHooksDeployer.deployHooks()` with optional `deployCommitMsgHook` and `deployPrePushHook` flags:
   - the bootstrap always persists the compiled policy,
   - only enabled hook wrappers/scripts are deployed,
   - disabled hook wrappers/scripts are actively removed to keep local enforcement aligned with current settings.

### Why

This keeps activation non-intrusive while still allowing explicit consent during deliberate setup flows, matching the startup-verification design already present in Nexkit. Passing hook flags into the deployer is the most coherent place to honor per-hook settings because both hook types consume the same compiled policy but produce different local artifacts.

---

## Decision: RTF converter Markdown preview contract

**Date:** 2026-07-10
**Agents:** Ghost, approved by Trinity
**Classification:** Project-specific - RTF converter preview

### Decision

The RTF converter's Markdown/Preview switch is client-only presentation state. The converted Markdown remains the single stored value used by the read-only textarea and Copy Markdown action; raw Markdown remains the default mode. Preview rendering uses `markdown-it` with `html: false`.

No DOM-test dependency is added solely for this toggle. Existing validation covers types, dependency resolution, and focused renderer safety probes; manual UI verification remains the appropriate residual check until the project deliberately adopts a webview DOM test harness.

### Why

This preserves existing clipboard and host-webview messaging behavior while preventing raw converted HTML from being rendered in the preview. Adding a test framework only for component-local UI state would add disproportionate scope to the feature.

---

## Decision: RTF converter Markdown preview contract

**Date:** 2026-07-10
**Agent:** Ghost
**Classification:** Project-specific - RTF converter preview

### Context

The standalone RTF converter now provides a switch between the generated Markdown and a rendered preview.

### Decisions

1. The Markdown string remains the single source of truth. The raw view, preview, and Copy Markdown action all use that same stored value; the switch changes presentation only.
2. The switch is client-only state in the converter webview. No host-webview messaging or panel state changes are needed.
3. Preview rendering uses `markdown-it` with `html: false`, so converted content cannot introduce raw HTML into the webview.
4. Do not add a DOM test dependency solely for this component-local toggle. Manual UI verification is the appropriate residual check until the project intentionally adopts a webview DOM test harness.

### Why

This preserves existing clipboard behavior, keeps the feature contained in the webview, and applies a conservative rendering boundary without expanding the project's test infrastructure for one presentation toggle.

---

## Decision: AI credit monitor monetary consumption KPI (Issue #180)

**Date:** 2026-07-10
**Agents:** Squad (Coordinator), approved by Eric De Carufel
**Classification:** Project-specific - AI credit monitor

### Decision

The AI credit monitor displays total monetary consumption split between included credits and additional credits. Monetary values use a fixed conversion of USD 0.01 per AI credit.

The monitor does not display a budget cap or consumption percentage.

### Context

This product clarification defines the KPI for issue #180 and was published in the issue discussion after explicit approval.

---

## Decision: AI credit monitor V1 local-only architecture and data boundary (Issue #180)

**Date:** 2026-07-10
**Agent:** Scribe, approved by Eric De Carufel
**Classification:** Project-specific - AI credit monitor

### Decision

1. V1 has no Azure Function or hosted backend. NexKit runs the monitor locally.
2. GitHub Actions secrets cannot be read back by NexKit. The billing credential is supplied locally and stored only in `ExtensionContext.secrets` / VS Code SecretStorage.
3. The active VS Code GitHub session resolves the target identity. The local billing credential is used for billing calls only for that login. V1 does not display organization, peer, budget, or percentage data.
4. The KPI is own included credits, additional credits, and total USD at USD 0.01 per AI credit. The POC must validate GitHub response semantics before treating values as additive, to prevent double counting.
5. VS Code exposes no public event for Copilot Chat usage originating in other extensions. Refresh while focused at most once per minute, plus activation, focus return, GitHub-session or configuration changes, and manual refresh. UI and documentation must acknowledge that GitHub attribution can lag.

### Context

Eric approved this refinement. Correction comments were published at:

- https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/180#issuecomment-4939569108
- https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/180#issuecomment-4939569111

No source code, issue body, labels, or state changed.
