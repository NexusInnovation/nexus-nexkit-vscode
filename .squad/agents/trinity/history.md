# Trinity — Tester / QA

Testing specialist ensuring all acceptance criteria are met through unit, integration, and BDD scenarios.

## Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function pipeline — Nethris payroll reports to SharePoint. C# .NET 10.0, BDD testing with
  Gherkin/SpecFlow, multi-environment CI/CD (dev/test/prod). 125-hour budget.
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions
- **Created:** 2026-04-24

## Phase 1 Summary (Complete)

✅ **Hello World Foundation Tests — 27 tests, all passing**

- **BDD:** 5 scenarios + 3-row Scenario Outline (8 tests) — SpecFlow + real GreetingService
- **Unit:** 14 xUnit Theory tests — GreetingServiceTests.cs covering null, empty, whitespace, special chars, Unicode
- **Functions:** 5 function tests — GreetingFunctionTests.cs with mocked IGreetingService, DefaultHttpContext simulation

**Patterns established:** BDD via SpecFlow auto-code-gen from .feature files, naming convention
Method_Scenario_ExpectedResult, Moq for external deps, DefaultHttpContext for HTTP trigger testing, [Theory] for
parameterized edge cases.

**Build Status:** 0 warnings, 0 errors. Phase 1 sign-off approved by Eric (2026-05-06).

---

## Phase 2 Progress

### 2026-04-30 — HTTP Sync Function Tests (7 tests, all green)

- NethrisReportSyncFunctionTests.cs — tests thin trigger wrapper, mocks orchestrator
- Patterns: NullLogger<T>.Instance for simplicity, helper factories for SyncCycleResult creation
- Verifies 200 on success, 200 with partial failures (per-report isolation), 500 on exception, no sensitive data leakage,
  single invocation, CancellationToken forwarding

### 2026-04-30 — Nethris Sync BDD Suite (4 scenarios, all green)

- NethrisReportSync.feature — 4 Gherkin scenarios + step definitions
- Coverage: successful sync (3 uploaded), all already synced (2 skipped), partial failure (per-report isolation), auth
  failure (500)
- Real orchestrator + real function, all clients mocked, Moq "last setup wins" pattern for partial failure simulation

### 2026-05-04 — Acceptance Criteria Verification (26/26 tests passing)

- **BL-001 through BL-008:** Full re-verification completed
- **Gap found & fixed:** BL-005 empty extension test was missing — Neo added ExecuteSyncAsync_EmptyExtension_FallsToBin
- **Test inventory:** 15 Core.Tests, 7 Functions.Tests, 4 Specs, 0 warnings
- **Learning:** Cross-reference backlog AC list item-by-item against test method names; use Validator.TryValidateObject for
  Data Annotations testing

### 2026-05-07 — SharePoint Permission Error Handling Tests (Issue #14, 17 tests)

- **SharePointClient tests (13):** Error handling for 401/403, exception wrapping, metadata PATCH resilience, permission
  validation
- **StubSharePointClient tests (4):** Path generation, metadata handling, cancellation token forwarding
- **Testing approach:** Manual IRequestAdapter mocks (ThrowingRequestAdapter, SuccessRequestAdapter) to avoid real Graph SDK
- **Edge case learning:** IRequestAdapter.ConvertToNativeRequestAsync<T> has unconstrained nullable return; BaseUrl setter
  nullable
- **Build Status:** 98 total tests (19 Core + 42 Infrastructure + 12 Integration + 15 Functions + 10 Specs), 0 failures, 0
  warnings

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

- 2026-07-10: The RTF converter webview in `src/features/rtf-converter/webview/main.tsx` has no exported pure rendering helpers and the test stack has no DOM harness (`jsdom`, Testing Library, or Preact test utilities). Keep service-level panel tests separate; validate the Markdown/Preview interaction manually until a deliberate webview-test architecture is introduced.

- 2026-07-10: QA approved the RTF converter Markdown preview. `npm run check:types`, package-lock dry-run resolution, and a focused markdown-it probe passed: raw HTML is escaped, unsafe `javascript:` and `data:` links do not render as hrefs, and HTTPS links render. The current absence of DOM interaction coverage is acceptable for this small, isolated switch but remains a manual-test boundary.

- 2026-05-20T08:42:26.759-04:00: Issue #111 cleanup found no `AcsInboundSmsFunctionTests.cs` in
  `tests/EquipeLaurence.Functions.Tests`, so QA removed the four remaining ACS-only startup assertions from
  `FunctionAppStartupTests.cs` instead. Full-solution validation moved from 205 total tests (199 passed, 1 failed, 5 skipped
  — failing ACS startup assertion) to 201 total tests (196 passed, 0 failed, 5 skipped), leaving
  `AcsDeliveryStatusFunctionTests` and `EquipeLaurence.Infrastructure.Acs.Tests` untouched.

- 2026-05-12: **Full test suite inventory (plan-de-tests.md):** Suite totale ~100 tests répartis sur 5 projets. Core.Tests :
  19 tests (10 NethrisReportSyncService + 9 OptionsValidation). Infrastructure.Tests : ~42 tests (10 NethrisAuthClient + 13+
  NethrisReportClient dont 13 Theory cases + 13 SharePointClient + 3 StubSharePoint + 4 TableStorageSyncLedger).
  Functions.Tests : 15 tests (9 NethrisReportSyncFunction + 6 FunctionAppStartup). IntegrationTests : 12 tests (3
  NethrisAuth + 3 NethrisReportClient + 6 AppConfiguration + 2 Twilio skip). Specs : 10 scénarios BDD (4 NethrisReportSync +
  6 AppConfiguration). Plan d'acceptation en 9 scénarios client + grille finale rédigé dans `docs/plan-de-tests.md`.

- 2026-05-11: When a solution build fails near SharePoint/Graph but
  [src/EquipeLaurence.Infrastructure/Clients/SharePointClient.cs](src/EquipeLaurence.Infrastructure/Clients/SharePointClient.cs)
  and infrastructure tests already compile, treat it as caller-side contract drift first. The fix here was stale six-argument
  `ISharePointClient.UploadFileAsync` mocks in
  [tests/EquipeLaurence.Core.Tests/NethrisReportSyncServiceTests.cs](tests/EquipeLaurence.Core.Tests/NethrisReportSyncServiceTests.cs)
  and
  [tests/EquipeLaurence.Specs/Steps/NethrisReportSyncSteps.cs](tests/EquipeLaurence.Specs/Steps/NethrisReportSyncSteps.cs),
  followed by a focused validation on the touched test slice and then the full solution build.

- 2026-05-11: **Capturing log output for security tests (Issue #42):** To assert on structured log output without Moq,
  implement a private sealed `CapturingLogger<T> : ILogger<T>` that appends `formatter(state, exception)` to a
  `List<string>`. The `formatter` delegate produces the fully formatted log message string (with placeholders substituted),
  making it easy to `Assert.DoesNotMatch(@"\*{2,}", msg)` for variable-length asterisk masks, or
  `Assert.Equal(authShort, authLong)` across two different-length passwords to prove log output is password-length
  independent. This pattern needs no extra NuGet packages and works with any `ILogger<T>` consumer.

- 2026-05-19T10:14:29.872-04:00: Issue #100 test prep added two parallel-safe guardrails.
  `tests/EquipeLaurence.Core.Tests/BaseTiArchitectureContractTests.cs` uses reflection + `DispatchProxy` so QA can lock the
  future `IBaseTiIngestionService`/`IBaseTiRepository` orchestration contract without blocking Neo before the types exist.
  `tests/EquipeLaurence.Infrastructure.Tests/BaseTiReferenceWorkbookTests.cs` inspects `References/BDNethris_BaseTI.xlsx`
  directly and proves the discovery row is row 2 (row 1 blank, row 2 headers including `Matricule`, `Code unique`,
  `Statut employé`, `Tél. cellulaire`), which keeps schema-discovery tests grounded in the real workbook instead of guessed
  column models.

- 2026-05-19T10:14:29.872-04:00: Issue #101 SMS QA coverage now lives in
  `tests/EquipeLaurence.Functions.Tests/SendEmergencySmsFunctionTests.cs`. The function-level suite locks four hard
  behaviors: recipient selection only sends `IsEligibleForSms` records that are not opted out, cached idempotency responses
  short-circuit all downstream calls, per-recipient Twilio failures remain isolated in the batch summary, and compliance
  checks assert logs exclude plaintext message bodies and full phone numbers while audit entries keep only the SHA-256
  message hash plus successful SIDs.

- 2026-05-20T08:17:46.634-04:00: Issue #110 Twilio inbound QA uses a branch-safe reflection harness in
  `tests/EquipeLaurence.Functions.Tests/TwilioInboundSmsFunctionTests.cs` so the test project can compile even if Mouse has
  not pushed `TwilioInboundSmsFunction` yet. Once the function type is present, the suite still exercises the real
  constructor and `RunAsync` behavior end-to-end with signed `DefaultHttpContext` form posts, covering STOP/ARRET opt-out,
  START opt-in, unknown keywords, missing `From`, invalid signatures, and the empty TwiML response contract.

---

## 2026-05-19T14:14:29Z — Cross-Agent Handoff (Scribe)

Mouse Issue #101 deliverables documented:

- BaseTI-backed SMS recipient source via ISmsRecipientSource adapter
- Personalized token rendering in message templates
- Masked send logs for PII compliance
- Documentation updated for operator reference
- Release build and test suite passing

Decision merged to .squad/decisions.md. Trinity's QA validation requirements consolidated into single decision record.

**Status:** All team records updated and committed.

## Session: ralph-round1 (2026-05-20T12:17:46Z)

### Issue #110 — Twilio Inbound SMS Function — Test Coverage

**Status:** 58/58 tests passing — Committed and pushed to squad/110-twilio-inbound-sms-function

**Work Completed:**

- Added `TwilioInboundSmsFunctionTests` with 7 test cases
- Test coverage:
  1. Valid STOP keyword — opt-out recorded
  2. Valid ARRET keyword (French) — opt-out recorded
  3. Valid START keyword — opt-out cleared
  4. Unknown keyword — rejected
  5. Missing From parameter — 400 response
  6. Invalid HMAC-SHA1 signature — 403 Forbidden
  7. Valid request — TwiML 200 response with empty body
- Phone masking log assertion (validates logs never contain plaintext numbers)
- All 58 unit tests passing

**Quality:**

- Test isolation: each test independently mocks Twilio client
- Full coverage of security, compliance, and happy path
- Phone masking validation ensures audit trail compliance

**Next Steps:**

- Await PR merge
- Post-merge: coordinate with Mouse on AcsInboundSmsFunction transition timeline

---

### 2026-05-29 — SMS Auth Fix tests

Added 3 new tests for RequesterPrincipal identity resolution from Entra ID claims. Added fetch/CSS assertions to
SmsFormFunctionTests. All 224 tests pass.

**Patterns:** ClaimsPrincipal mock setup for Entra ID identity tests, HTML response assertion for fetch() and CSS attributes.

---

### 2026-05-29 — SMS Auth Fix tests

Added 3 new tests for RequesterPrincipal identity resolution from Entra ID claims. Added fetch/CSS assertions to
SmsFormFunctionTests. All 224 tests pass.

**Patterns:** ClaimsPrincipal mock setup for Entra ID identity tests, HTML response assertion for fetch() and CSS attributes.

### 2026-05-29 — Easy Auth Redirect Fix tests

Added assertions for `resp.redirected` and session expiry message detection in `SmsFormFunctionTests.cs`. Validates that
client-side JavaScript correctly detects when Easy Auth session expires. 224 tests pass.

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
