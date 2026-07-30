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

- 2026-07-30: **`ConfirmationService.confirm()` failed open — dismissal was consent.** `vscode.window.showInformationMessage` resolves to `undefined` when the modal is dismissed (Escape, X, focus loss), and the method's final `return "accepted"` swallowed that. The fix is to make the **accept branch explicit** rather than making it the fallthrough: `if (result === "Accept") return "accepted"; return "refused";`. **General rule for any VS Code modal: never let the accept path be the `else`.** `showInformationMessage`/`showWarningMessage`/`showQuickPick` all resolve `undefined` on dismissal, so the default branch must always be the deny branch. `confirmOnce()` was already correct precisely because it was written as `return result === "Continue"` — a positive comparison, not a fallthrough. **When auditing a consent gate, grep for a bare `return "<accept>"` at the end of the function; that shape is the bug.**
- 2026-07-30: **Widening a public result union is usually the wrong fix for a consent bug.** I considered adding a `"dismissed"` member to `ConfirmationResult` so callers could distinguish Escape from an explicit Refuse. Rejected: all three `confirm()` callers use the identical `if (result !== "accepted") return;` guard, none has an exhaustive switch, and the widening would have forced edits into an out-of-bounds feature folder. Collapsing dismiss → `"refused"` kept the signature byte-identical, needed zero caller changes, and is semantically honest (dismissal _is_ a refusal for that invocation). **Prefer the change that requires no caller edits when the extra information has no consumer.** The one thing that genuinely matters is that dismissal returns the _non-persisted_ refusal, not `"refused-forever"` — otherwise an accidental Escape would silently lock the feature out of the workspace forever.
- 2026-07-30: **A test can encode a vulnerability as a requirement.** `confirmationService.test.ts` contained `"Should return 'accepted' when user dismisses the dialog (ESC)"` — a green, deliberately-written test asserting the fail-open behaviour. The suite was passing _because_ the bug was present. **When fixing a security defect, always grep the test suite for a test that pins the broken behaviour before assuming the suite will catch you.** Net test count went 534 → 536 (one bad test removed, three added).
- 2026-07-30: **Consent gates that bypass the shared service are invisible to an audit.** `MCPConfigService.promptInstallRequiredMCPsOnActivation()` calls `vscode.window.showInformationMessage` directly instead of going through `ConfirmationService`. It happens to fail closed already, so no bug — but it would not have shown up in a `.confirm(`/`.confirmOnce(` grep. **When auditing a consent boundary, grep for the underlying VS Code API (`showInformationMessage`, `showWarningMessage`) as well as the service methods**, otherwise the audit only covers the calls that were already doing the right thing architecturally.

- 2026-07-30: **`ConfirmationService` needed a second, non-rememberable variant.** The existing `confirm()` always offers a "Refuse Forever" option, which is correct for reversible actions but wrong for a gate that authorises software installation. Rather than bypassing the service (which would move the consent boundary out of the shared layer), I added `confirmOnce(message, detail): Promise<boolean>` — a modal warning with a single "Continue" action and no persistence. **Pattern: when an existing shared service is _almost_ right, extend it with a sibling method instead of inlining a one-off `showWarningMessage` at the call site.** Keeps every consent decision auditable in one file.
- 2026-07-30: **Multi-root workspace root resolution for file discovery.** `SettingsManager.isWorkspaceOverrideActive()` already established that the folder holding the `.code-workspace` file takes precedence over `workspaceFolders[0]`. I generalised that into `PrerequisiteConfigService.getWorkspaceRootCandidates()`, which returns the `workspaceFile` dirname first, then every `workspaceFolder`, deduped and filtered to `scheme === "file"`. `load()` then returns the **first candidate that actually carries the config file** rather than assuming index 0. Reusable any time a feature needs "find this file in the workspace" and must behave in multi-root.
- 2026-07-30: **Path-containment defence needs a realpath pass.** Rejecting `..`, absolute paths, drive-qualified paths and UNC paths in the _configured_ string is necessary but not sufficient — a symlink inside the workspace can still point outside it. After resolving the scripts root I call `realPath()` on both the workspace root and the scripts root and re-assert containment, falling back silently to the pre-realpath URI when realpath is unavailable (e.g. virtual filesystems). Combined with a hard allowlist of the six permitted script filenames, this means no workspace-supplied string can ever name the executed file.
- 2026-07-30: **PowerShell scripts that predate a new switch parameter fail with an opaque binding error.** Passing `-Interactive:$false` to a script that doesn't declare an `-Interactive` parameter produces "A parameter cannot be found that matches parameter name 'Interactive'", which reads like a Nexkit bug. Two mitigations: pass the switch only to the steps that need it (`validate`, `setup` — never `check`), and pattern-match that exact message in `classifyFailure()` to convert it into a `Configuration` error with an actionable remediation. **Pattern: when invoking user-owned scripts with flags, always add a stderr classifier for "script is older than the contract" so version drift degrades into a clear instruction rather than a cryptic failure.**
- 2026-07-30: **Windows/PowerShell tooling trap — never pipe `npm run check:types` through `Select-Object`.** `npm run check:types 2>&1 | Select-Object -Last 40` returned exit code 1 with _zero_ output: `2>&1` converts stderr into `ErrorRecord` objects and the compiler diagnostics were silently discarded, making a passing build look like a mystery failure. Two further gotchas found in the same pass: (a) `npx tsc` resolves to an unrelated squatted `tsc@2.0.4` package that prints "This is not the tsc command you are looking for" — always invoke `node ./node_modules/typescript/bin/tsc` directly; (b) `npm` is aliased to pnpm in this repo and every `npm run <script>` first runs a dependency-status check that currently fails with `ERR_PNPM_IGNORED_BUILDS` (a pre-existing environment issue unrelated to any code change), so verification must call the underlying binaries directly: `node ./node_modules/typescript/bin/tsc --noEmit -p ./tsconfig.json`, `node esbuild.config.js`, `node ./node_modules/eslint/bin/eslint.js src --ext ts`. Redirect with `*> file.txt` and `Get-Content` when output still goes missing.
- 2026-07-30: **`tsconfig.json` includes `test/**/\*`, so widening a shared interface can break the type-check via test fixtures.** Adding three required properties to the `ServiceContainer`interface was the highest-risk part of this change for exactly that reason. It happened to pass clean here, but the general rule stands: after touching`ServiceContainer`, always run the full project type-check (not just the feature folder), because mock container literals in `test/` are structurally typed against it.

### Archived sections (see `history-archive.md` for full detail)

- GitHub Ruleset Validation Feature (Lots 1–6, completed 2026-07-08) — API client, policy compiler, consent service, hook deployer, bootstrap orchestration.
- RTF Converter Markdown/Preview Validation (2026-07-10).
- Convert to Markdown → markitdown migration team updates (2026-07-20).
- Bug fixes (2026-07-23), three reusable patterns: force `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` explicitly for locale-dependent child processes on Windows (piped stdout does not inherit console UTF-8 mode) — fixed mojibake in markitdown; keep `@types/sinon`'s major in step whenever `sinon` gets a major bump (`TS2694` drift vs `sinon@21`); stub the parent `fs` getter with a spread override to work around Sinon failing on non-configurable VS Code namespace properties like `vscode.workspace.fs.writeFile`.
- Prerequisite automation — implementation + analysis passes (2026-07-30). Feature-folder anatomy and the five wiring points (`commands.ts` constant, `package.json` contributes, `serviceContainer.ts`, `extension.ts`, `settingsManager.ts`); `ScriptRunOutcome` as a 4-value single source of truth (no redundant `timedOut` flag); every injectable seam a defaulted constructor param; `platform` passed explicitly, never `process.platform`, so both OS branches test on one runner; `context.workspaceState` is exempt from the "settings always Global" rule (different storage tier, same facade).
- Convert to Markdown production packaging bug (2026-07-23). `index.html` was never re-created during the `rtf-converter` rename; `copyStaticFiles()` skipped it silently and a stale gitignored `out/` masked it locally. Verify packaging against a clean checkout before trusting `vsce ls`.
- SCM multi-root commit-message routing (2026-07-21). `vscode.SourceControl.rootUri` identifies the invoked repository; compare canonical `Uri.toString(true)` against Git API roots.

---

### 2026-07-30 — Team update (recorded by Scribe)

- **Tank's script contract is the authoritative reference** for the AFEAS prerequisite scripts. Where your implementation and
  the contract disagree, the contract wins. It fixes the state-file path, the 0/1 exit codes, the `::VALIDATED::` marker
  semantics, and `bash` (not `sh`) as the shell.
- **You are locked out of the revision** on the prerequisite-automation artifact under the reviewer-rejection protocol.
  Ghost owned the Round 4 fix — including making the marker parser case-sensitive, separator-optional, and **first-match**
  (your version took the last occurrence). Route further revisions on this artifact to Ghost.
- **Morpheus accepted the `eval` / `Invoke-Expression` surface in the setup scripts as a recorded residual risk**, closed only
  by Workspace Trust. Extension-side hardening (argv array, `shell: false`, filename allowlist, path containment) is
  correct but bounded — do not describe the feature as hardened end to end.
- **`--skip-validation` marks state validated without validating.** Never expose it from the extension.
- **`NEXKIT_NON_INTERACTIVE=1` is dead signal** — you inject it, no script reads it. Either wire it into the scripts or drop it.
- **Trinity's results:** 534 passing / 15 failing / 0 pending, then 541 / 0 after fixes. Four failures were test defects, not
  product defects. Integration coverage is Windows-only.
- **Open item deferred to Eric:** `ConfirmationService.confirm()` fails **open** on modal dismiss (Escape = consent).
  Pre-existing and repo-wide, but it now gates workspace-controlled script execution. Ships as its own slice.
