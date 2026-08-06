# Trinity — Tester / QA

Testing specialist ensuring all acceptance criteria are met through unit, integration, and BDD scenarios.

## Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function pipeline — Nethris payroll reports to SharePoint. C# .NET 10.0, BDD testing with
  Gherkin/SpecFlow, multi-environment CI/CD (dev/test/prod). 125-hour budget.
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions
- **Created:** 2026-04-24

## Phase 1 & 2 Summary (Archived detail — condensed 2026-08-06)

Phase 1 (complete, signed off 2026-05-06): 27 Hello World foundation tests (BDD/SpecFlow, xUnit Theory unit tests,
mocked-service function tests), 0 warnings/errors.

Phase 2 highlights: HTTP sync function tests (7), Nethris Sync BDD suite (4 scenarios), full AC re-verification
(26/26, one gap found & fixed — BL-005 empty extension), SharePoint permission error handling (17 tests, manual
`IRequestAdapter` mocks to avoid real Graph SDK). Reached 98 total tests across 5 projects with 0 failures.

Established patterns: `Method_Scenario_ExpectedResult` naming, Moq for external deps, `NullLogger<T>.Instance` for
function tests, `DefaultHttpContext` for HTTP trigger simulation, `[Theory]` for parameterized edge cases,
`Validator.TryValidateObject` for Data Annotations testing, manual `IRequestAdapter` implementations for Graph SDK
testing without real HTTP/auth.

---

## Key Learnings

- **BDD integration pattern:** Real orchestrator + real function with fully mocked clients (Moq) provides end-to-end coverage
  without external dependencies
- **Function test simplicity:** NullLogger<T>.Instance removes test noise; focus on HTTP semantics (status, body type) only
- **Per-report error isolation:** Partial failures verify correctly via Moq setup override on specific report IDs
- **Options validation:** Validator.TryValidateObject is the correct pattern for unit-testing Data Annotations outside of
  host
- **Graph SDK testing:** Manual IRequestAdapter implementations eliminate dependency on real HTTP/auth; construct ODataError
  with ResponseStatusCode and MainError

---

## Next Phase (Phase 2 continuation)

- Real NethrisAuthClient and NethrisReportClient implementations (Neo) — backlog items and AC needed
- Real SharePointClient and TableStorageSyncLedger implementations (Neo, Switch)
- Timer trigger NethrisTimerSyncFunction (not yet tracked)
- Client-level unit tests following same Moq patterns
- E2E test plan and infrastructure integration tests

## Learnings

## Learnings (Nethris project, condensed 2026-08-06)

- **RTF converter Markdown preview (2026-07-10):** No exported pure rendering helpers in `main.tsx`; no DOM test
  harness (jsdom/Testing Library/Preact utils) exists. Keep service-level panel tests separate; verify Markdown/Preview
  toggle manually until a deliberate webview-test architecture is introduced. QA approved: `check:types`, package-lock
  dry-run, and a focused `markdown-it` probe confirmed raw HTML is escaped and unsafe `javascript:`/`data:` links don't
  render as hrefs — acceptable manual-test boundary for this small, isolated switch.

- **Reusable QA patterns from Nethris payroll work:** cross-reference backlog AC items 1:1 against test method names to
  catch gaps (caught missing BL-005 empty-extension case); `CapturingLogger<T> : ILogger<T>` (appends formatted messages
  to a `List<string>`) is the go-to pattern for asserting on log output/PII-masking without extra NuGet packages;
  reflection + `DispatchProxy` contract tests let QA lock a future interface shape before the implementer has written it;
  branch-safe reflection harnesses let a test project compile even before a function type exists, then exercise the real
  constructor once it lands. Full historical detail (issues #14, #42, #100, #101, #110, #111, plan-de-tests inventory,
  SMS auth/Easy-Auth redirect tests) archived — see git history of this file prior to 2026-08-06 if needed.

### 2026-07-21 — Commit-message SCM context reviewer gate

APPROVED: the Git-menu command forwards the optional invoking `SourceControl.rootUri`, and `CommitMessageService` selects the matching Git repository by canonical `Uri.toString(true)` before preserving the existing single-repository, uniquely-staged, then-index-zero fallback sequence. Focused integration coverage proves the selected second repository is used and unmatched context retains staged-change selection; command coverage verifies URI forwarding. `npm run check:types` and test compilation remain blocked by unrelated missing RTF converter dependencies/types in `src/features/rtf-converter/webview/main.tsx`; the extension-host test runner did not honor the supplied grep and ended with SIGINT after broad execution. `git diff --check` reported no focused whitespace errors.

### 2026-07-21 — Commit-message SCM repository routing QA

Approved the commit-management multi-root routing change. The Git-menu command forwards the invoking
`SourceControl.rootUri`; `CommitMessageService` selects the exact Git API repository by URI before preserving the
existing single-repository, uniquely staged, and first-repository fallbacks. Focused test cases cover exact selection,
unmatched-context fallback, and command forwarding. `git diff --check` passed. Full test compilation and type-checking
remain blocked by unrelated missing RTF converter dependencies (`mammoth`, `turndown`, `turndown-plugin-gfm`, and
`rtf.js`).

**Patterns:** JavaScript behavior assertions in rendered HTML, session expiry detection via redirect/content-type.

## Team update — 2026-07-20 (RTF converter to markitdown migration)

Shared context (see decisions.md "Replace custom RTF/DOCX/HTML to Markdown conversion with microsoft/markitdown"): conversion moved host-side via microsoft/markitdown (Python child process). Message contract lives in src/features/rtf-converter/messages.ts (convert-paste-html | convert-file | recheck-availability -> conversion-result | conversion-error | availability-status). markdown-it preview retained; deps mammoth/turndown/turndown-plugin-gfm/rtf.js/@types/turndown removed; type shims rtfJsBundle.d.ts + turndownPluginGfm.d.ts deleted. Security: argv array + sandboxed temp file, shell:false, 10MB cap, two-layer timeout. Suite 382 passing / 0 failing. Open follow-up: add clean/rimraf out step before test-compile (stale out/ artifacts can abort npm test).

## Team update — 2026-07-20 (Convert to Markdown — full migration complete and merged)

Wrote `markitdownConversionService.test.ts` (19 tests) and `convertToMarkdownPanelService.test.ts` (11 tests) covering the full-scope migration; updated `extension.test.ts`, `nexkitPanelMessageHandler.test.ts`, `serviceContainer.test.ts` for the rename; deleted `rtfConverterPanelService.test.ts`. All 30 pass. Note for the team: the stale-`out/` test-compile issue flagged in the prior session recurred — Mocha crashed loading a leftover `out/test/suite/cronSchedule.test.js` from a deleted feature. Coordinator resolved it by deleting `out/` (no `cronstrue` dependency was actually needed).
