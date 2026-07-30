# Trinity — Tester / QA

Testing specialist ensuring all acceptance criteria are met through unit, integration, and BDD scenarios.

## Project Context

- **Owner:** Eric De Carufel
- **Current project:** Nexkit — VS Code extension (TypeScript strict, esbuild, Preact webview). Test stack is
  **Mocha `tdd` ui + Sinon + Node `assert`**, run inside a real headless VS Code host. No chai, no Gherkin, no xUnit, no Moq.
- **Prior project (archived):** EquipeLaurence — C#/.NET Azure Functions with SpecFlow BDD. **None of that tooling applies
  here.** See `history-archive.md`.
- **Created:** 2026-04-24

## Carried-forward rules (from archived learnings)

- **Cross-reference the acceptance-criteria list item-by-item against test method names.** That is how a missing test gets
  found; scanning for "looks covered" does not.
- **Per-item error isolation must be asserted explicitly** — a batch that partially fails should prove the other items still
  succeeded.
- **Assert on captured log output for compliance**, not on the absence of a crash: prove secrets, phone numbers, and message
  bodies never reach the log, and that output is length-independent so nothing leaks by inference.
- **Hand-rolled fakes beat heavyweight SDK mocks** when the SDK boundary is an interface you can implement in a few lines.
- **Contract tests can be written before the types exist** (reflection-based), so QA never blocks the implementer.

## Learnings

- 2026-07-10: The RTF converter webview in `src/features/rtf-converter/webview/main.tsx` has no exported pure rendering helpers and the test stack has no DOM harness (`jsdom`, Testing Library, or Preact test utilities). Keep service-level panel tests separate; validate the Markdown/Preview interaction manually until a deliberate webview-test architecture is introduced.

- 2026-07-10: QA approved the RTF converter Markdown preview. `npm run check:types`, package-lock dry-run resolution, and a focused markdown-it probe passed: raw HTML is escaped, unsafe `javascript:` and `data:` links do not render as hrefs, and HTTPS links render. The current absence of DOM interaction coverage is acceptable for this small, isolated switch but remains a manual-test boundary.

---

### 2026-07-21 — Commit-message SCM context reviewer gate / repository routing QA

APPROVED. The Git-menu command forwards the optional invoking `SourceControl.rootUri`, and `CommitMessageService` selects
the matching Git repository by canonical `Uri.toString(true)` before preserving the existing single-repository,
uniquely-staged, then-index-zero fallback sequence. Focused integration coverage proves the selected second repository is
used and that unmatched context retains staged-change selection; command coverage verifies URI forwarding.
`git diff --check` passed. `npm run check:types` and full test compilation remained blocked by unrelated missing RTF
converter dependencies/types (`mammoth`, `turndown`, `turndown-plugin-gfm`, `rtf.js`) in
`src/features/rtf-converter/webview/main.tsx`; the extension-host runner did not honour the supplied grep and ended with
SIGINT after broad execution.

## Team update — 2026-07-20 (Convert to Markdown / markitdown migration, complete and merged)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"):
conversion moved host-side via microsoft/markitdown (Python child process). Message contract in `messages.ts`
(`convert-paste-html` | `convert-file` | `recheck-availability` → `conversion-result` | `conversion-error` |
`availability-status`). markdown-it preview retained; `mammoth`/`turndown`/`turndown-plugin-gfm`/`rtf.js`/`@types/turndown`
removed along with the `rtfJsBundle.d.ts` + `turndownPluginGfm.d.ts` shims. Security: argv array + sandboxed temp file,
`shell: false`, 10 MB cap, two-layer timeout.

My coverage: `markitdownConversionService.test.ts` (19) + `convertToMarkdownPanelService.test.ts` (11); updated
`extension.test.ts`, `nexkitPanelMessageHandler.test.ts`, `serviceContainer.test.ts` for the rename; deleted
`rtfConverterPanelService.test.ts`. All 30 pass (full suite 382/0). **Recurring trap:** stale `out/` artifacts abort
`npm test` — Mocha crashed loading a leftover `out/test/suite/cronSchedule.test.js` from a deleted feature. Resolution is
to delete `out/`; a clean step before `test-compile` is still an open follow-up.

### 2026-07-30 — nexus-nexkit-vscode test stack: the ACTUAL conventions (correcting my BDD/Gherkin default)

This repo is **not** the C#/SpecFlow project my earlier history describes. There is **no Gherkin, no SpecFlow, no Moq, no
xUnit**. Do not propose `.feature` files here. The real stack:

- **Runner:** Mocha in **TDD ui** (`suite()` / `test()` / `setup()` / `teardown()`), configured in
  [test/suite/index.ts](test/suite/index.ts) — `ui: "tdd"`, `timeout: 10000`, `reporter: "spec"`. Tests are discovered by
  globbing `suite/**/*.test.js` from `out/test/`, and a compiled test is only loaded if its `.ts` source still exists
  (guards against stale build artifacts after refactors).
- **Assertions:** Node's built-in `assert` (`assert.ok`, `assert.strictEqual`, `assert.deepStrictEqual`). No chai.
- **Mocking:** `sinon`. Two accepted styles — `sinon.createSandbox()` + `sandbox.restore()` in teardown
  (githubWorkflowRunnerService), or bare `sinon.stub(...)` + `sinon.restore()` in teardown (markitdownConversionService).
  Both are in use; sandbox style is cleaner.
- **Suite naming:** `suite("Unit: ServiceName", ...)` and `suite("Integration: ...", ...)`. The `Unit:` / `Integration:`
  prefix is the convention documented in [test/README.md](test/README.md). Nested `suite()` blocks group behaviors within
  a service (markitdownConversionService does this well).
- **File naming:** `test/suite/<serviceName>.test.ts`, camelCase matching the source file, mirroring `src/` layout.
- **Execution environment:** tests run inside a **real headless VS Code instance** (`node ./out/test/runTest.js`), so
  `import * as vscode from "vscode"` works for real. Compile first with `npm run test-compile` (plain `tsc -p ./` → `out/`).
- **Coverage:** `nyc` (`npm run test:coverage`, lcov + text).

**How VS Code APIs get mocked here:**

- Namespace properties are replaced with `.value()`: `sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri, name, index: 0 }])`
  or `.value(undefined)` for the "no workspace" path.
- Functions are stubbed directly: `sandbox.stub(vscode.window, "showErrorMessage")`,
  `sandbox.stub(vscode.window, "createTerminal").returns(mockTerminal as any)`.
- `vscode.Uri.file("/mock/workspace")` is used freely — real `Uri` objects, fake paths.
- `ExtensionContext` is hand-rolled as a Map-backed literal cast `as any` (see
  [test/suite/installedTemplatesStateManager.test.ts](test/suite/installedTemplatesStateManager.test.ts)) — `workspaceState.get`
  reads from a `Map`, `workspaceState.update` writes to it. This is the established pattern for anything touching
  workspace state; there is no shared mock-context helper yet.
- A shared `test/suite/mockAuthentication.ts` (`setupBeforeAllTests()`) runs once before the whole suite to neutralize
  GitHub auth.

**How child processes are mocked (the key precedent for any script-runner work):**
[test/suite/markitdownConversionService.test.ts](test/suite/markitdownConversionService.test.ts) is the reference. It stubs the
**module**: `sinon.stub(childProcess, "spawn")`, and returns a `FakeChildProcess` — an `EventEmitter` with `stdout` and
`stderr` sub-`EventEmitter`s plus a `kill` stub. Named factory helpers make each scenario one line: `createClosingChild(code)`,
`createErroringChild(err)`, `createSuccessfulChild(stdout)`, `createHangingChild()` (never emits — used for timeout paths).
All emissions are deferred with `process.nextTick(...)` so the service's promise wiring is in place before events fire.
Caveat: this stubs a Node module rather than an injected seam, so it couples tests to the import style of the service. For
new work, prefer injecting a runner interface and stubbing that; keep the module-stub trick as the fallback.

**Filesystem patterns — two idioms, both accepted:**

1. **Real temp dir** (preferred when the code under test does meaningful multi-file I/O):
   `fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-<feature>-test-"))` in `setup()`, `fs.rmSync(dir, { recursive: true, force: true })`
   in `teardown()` wrapped in try/catch. See [test/suite/hooksConfigDeployer.test.ts](test/suite/hooksConfigDeployer.test.ts).
2. **Stubbed fs** (preferred when I/O is incidental and you want zero disk touch):
   `sinon.stub(fs, "mkdtempSync").returns("C:\\Fake\\Temp\\...")`, `sinon.stub(fs, "writeFileSync")`, `sinon.stub(fs, "rmSync")`.

**Fixtures:** there is currently **no** `test/fixtures/` directory and no fixture convention in this repo. All test data is
built inline (JSON literals written into temp dirs, or string constants). Introducing `test/fixtures/` is a new convention —
it must be justified and documented in [test/README.md](test/README.md) if adopted.

**Platform-conditional assertions:** the repo already branches on `process.platform === "win32"` _inside_ a single test to
assert PowerShell vs bash command shapes (githubWorkflowRunnerService). That works but only ever exercises the host OS. For
OS-selection logic, prefer injecting the platform rather than reading `process.platform` directly, so both branches are
covered on any machine.

**Security assertion worth copying:** markitdown tests iterate every recorded `spawn` call and assert `options.shell !== true`
and `Array.isArray(args)` — a standing guarantee against command injection. Any new process-spawning feature should carry the
same guard test. They also assert error messages don't leak local paths via regex `/[A-Za-z]:\\|\/(tmp|home|Users)\//`.

**Ground truth for the prerequisites feature:** the real reference scripts live in
[Documentation/prerequis/gl-afeas/](Documentation/prerequis/gl-afeas/) — `requirements.json`, `Check-Validation.ps1`,
`Validate-Prerequisites.ps1`, `validate-prerequisites.sh`, `Setup-Environment.ps1`, `setup-environment.sh`. Confirmed:
`check-validation.sh` genuinely does not exist. `Check-Validation.ps1` emits a `::VALIDATED::true|false` marker on stdout
and exits 0/1; it treats a missing settings file, unreadable file, and malformed JSON all as `false` + exit 1 (no distinct
error code), and reads the flag `afeas.prerequisites.validated` from `.vscode/afeas.local.settings.json`. That marker +
exit-code pair is the cross-platform contract any parser must be tested against.

### 2026-07-30 — Prerequisite automation test suite

**Correction to an earlier note in this file:** `check-validation.sh` now exists in
`Documentation/prerequis/gl-afeas/`. All six real scripts are present, so the Unix/Windows
parity gap I recorded previously is closed. Do not repeat the old claim.

**This project is a TypeScript VS Code extension.** The seeded context at the top of this
file (Azure Functions, C#, SpecFlow, payroll) is from a different engagement and does not
apply. Test stack here is Mocha `tdd` ui + Sinon + Node `assert`. No chai, no Gherkin.

**Build gate workaround.** `npm test` and `npm run compile` both die on
`ERR_PNPM_IGNORED_BUILDS` before reaching any code. Do not run `pnpm approve-builds` to
"fix" it. Route around it: `.\node_modules\.bin\tsc.cmd -p ./` to compile, then
`node ./out/test/runTest.js` to run inside the VS Code host.

**Which runner to use.** `test/runHeadlessTest.ts` has a hardcoded allowlist of three
files. Anything importing `vscode` — which is nearly everything — must go through
`runTest.js`, not the headless runner. `test/suite/index.ts` globs `suite/**/*.test.js`,
so helper modules are safe in `test/suite/helpers/` as long as they do not end in
`.test.ts`.

**Fixture path resolution.** Tests run from `out/test/suite/`, so fixtures resolve as
`path.resolve(__dirname, "..", "..", "..", "test", "fixtures", ...)`. Three levels up,
not one.

**`assert.throws` returns `void` in Node.** It does not hand back the thrown error. Any
test that wants to inspect the error object needs a `captureError` helper wrapping
try/catch. I wrote this bug three times before catching it.

**Fake process runner queueing.** `respondTo(matcher, ...results)` appends to an existing
queue so a step can be scripted to behave differently on a re-run. That means a test
cannot contradict a response the harness pre-seeded. Added `overrideResponse` for that
case rather than changing the append semantics other tests depend on.

**Test the code, not your mental model.** My `OutputBuffer` eviction expectation was
wrong: eviction halts the moment the buffer is back within budget, so it retains more
than just the final chunk. When a test fails, read the implementation before assuming a
defect. Three of my four first-run failures were my error, one was a genuine assertion
design flaw.

**Divergences worth remembering:** `NEXKIT_NON_INTERACTIVE=1` is injected into every
spawn and no script reads it — dead safety code. The `::VALIDATED::` parser is
case-insensitive and whitespace-tolerant while the contract says it is case-sensitive.
Both are captured in tests named `DIVERGENCE:` so current behaviour is never mistaken
for agreed behaviour.

**Opt-in integration pattern.** Gate real-process suites behind an env var checked in
`setup()` with `this.skip()`. Skipped shows as _pending_, never as passing — so a suite
that never ran cannot masquerade as green.

---

### 2026-07-30 — Team update (recorded by Scribe)

- **Tank's script contract is the authoritative reference** for the AFEAS prerequisite scripts. Link's extension
  implementation and my parity tests both conform to it — when they disagree, the contract wins.
- **The `::VALIDATED::` divergence I captured is now closed.** Ghost's Round 4 revision made the extension's marker parser
  case-sensitive, separator-optional, and first-match, matching Tank's contract exactly. My `DIVERGENCE:` test for it should
  be retired or flipped to an agreement test on the next pass.
- **Link is locked out of the revision** under the reviewer-rejection protocol; Ghost owned the fix. Route follow-up
  revisions on this artifact to Ghost, not Link.
- **Morpheus accepted the `eval` / `Invoke-Expression` surface in the setup scripts as a recorded residual risk**, closed
  only by VS Code Workspace Trust. Do not file it as a new defect.
- **`--skip-validation` marks state validated without validating.** The extension must never expose that flag — any test
  that finds it reachable from the UI is a hard failure.
- **Open item deferred to Eric:** `ConfirmationService.confirm()` fails **open** on modal dismiss (Escape = consent).
  Pre-existing and repo-wide, but it now gates workspace-controlled script execution. It ships as its own slice with its own
  regression test.
- **My results this cycle:** 534 passing / 15 failing / 0 pending, then 541 / 0 after fixes. Four of the failures were
  self-inflicted test defects, not product defects. Integration coverage remains Windows-only.

Older EquipeLaurence-era entries were archived to `history-archive.md` on 2026-07-30.
