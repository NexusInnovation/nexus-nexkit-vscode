# Switch — History

## Learnings

### 2026-05-25 — Issue #137: SmsFormFunction uses IBaseTiRepository directly, not ISmsRecipientSource

**Context:** Issue #137 asks to display the employee list (with phone numbers) when a bureau card is expanded.

**Key findings:**
- `SmsFormFunction` injects `IBaseTiRepository` directly (field `_baseTiRepository`), not `ISmsRecipientSource`.
- `GetAllAsync()` returns `IReadOnlyList<BaseTiRecord>` — the full employee record including `MobilePhoneE164`, `MobilePhoneRaw`, `LocationName`, `LocationCode`, `IsEligibleForSms`, `LastIngestedUtc`.
- The function already groups all records by `LocationCode` to build bureau counts — employee list data is already in memory after the single `GetAllAsync()` call.
- `ISmsRecipientSource.GetByLocationAsync()` (implemented by `BaseTiSmsRecipientSource`) would require N+1 Table Storage calls (one per bureau), which is unnecessary given the data is already loaded.
- Recommended approach: extend the existing `byLocation` grouping to carry employee lists into `GenerateFormHtml` rather than introducing a new injection point.
- `BaseTiRecord.MobilePhoneE164` maps to `RecipientRecord.MobileNumber` in the adapter — the E.164 field name differs between the two models.
- Phone formatting: Canadian numbers `+1XXXXXXXXXX` (length 12) format cleanly to `(XXX) XXX-XXXX`; international numbers fall back to raw E.164.
- `LastIngestedUtc` on `BaseTiRecord` is the freshness signal — display a warning if older than 25 hours.

**Key file paths:**
- `src/EquipeLaurence.Functions/SmsFormFunction.cs` — injects `IBaseTiRepository`, calls `GetAllAsync()`
- `src/EquipeLaurence.Core/Models/BaseTiRecord.cs` — full employee record model
- `src/EquipeLaurence.Core/Models/RecipientRecord.cs` — SMS-facing subset model (MobileNumber ≠ MobilePhoneE164)
- `src/EquipeLaurence.Core/Clients/ISmsRecipientSource.cs` — location-scoped interface (N+1 if used per bureau)
- `src/EquipeLaurence.Infrastructure/Clients/BaseTiSmsRecipientSource.cs` — adapter mapping BaseTiRecord → RecipientRecord

---

### 2026-05-11 — Build Break Was Stale ISharePointClient Test Contract, Not SharePointClient

**Reproduction path:** `dotnet build src/EquipeLaurence.Infrastructure/EquipeLaurence.Infrastructure.csproj` passed, and
`dotnet build tests/EquipeLaurence.Infrastructure.Tests/EquipeLaurence.Infrastructure.Tests.csproj` also passed. The failing
solution build was isolated to Core and SpecFlow callers of `ISharePointClient.UploadFileAsync`.

**Local hypothesis:** the compile failure adjacent to `SharePointClient` came from stale test/spec callers still using an
older six-argument `UploadFileAsync` contract after the interface had already been reduced to five arguments.

**Evidence:** `ISharePointClient` currently exposes
`UploadFileAsync(folderPath, fileName, content, contentType, cancellationToken)`. The solution build failure reported CS1501
in `tests/EquipeLaurence.Core.Tests/NethrisReportSyncServiceTests.cs` and
`tests/EquipeLaurence.Specs/Steps/NethrisReportSyncSteps.cs`, while the owned implementation and infrastructure tests
compiled cleanly.

**Outcome:** No SharePoint production-code edit was required. By the time triage completed, the working tree already
contained the adjacent test/spec signature fixes, and a rerun of `dotnet build EquipeLaurence.sln --nologo` succeeded.

### 2026-05-08 — REPORT_FORMAT Numeric Code Mapping Fix (.bin → .xlsx)

**Root cause:** Nethris `REPORT_FORMAT` field is `N(2)` — a numeric code, not a text label. The API returns values like `"0"`
(PDF), `"1"` (XLS formatted), `"2"` (delimited text), `"3"` (XLS non-formatted), `"4"` (XLSX formatted), `"5"` (XLSX
non-formatted). `MapFormatToExtension` was matching against text labels (`"PDF"`, `"XLSX"`, etc.), so every real Nethris
response hit the default fallback case, which was originally `"bin"`.

**Fix:** Updated `MapFormatToExtension` to handle numeric codes `"0"`–`"5"` as the primary mapping, with text labels retained
for robustness. Made method `internal static` for testability. Added diagnostic `LogDebug` in `MapToReportSummary` to log raw
`REPORT_FORMAT` value and resolved extension for each report.

**Nethris REPORT_FORMAT codes (from API spec page 65):**

- 0 = PDF
- 1 = Excel xls (formatted)
- 2 = Delimited text (csv)
- 3 = Excel xls (non-formatted)
- 4 = Excel xlsx (formatted)
- 5 = Excel xlsx (non-formatted)

**Key file paths:**

- `src/EquipeLaurence.Infrastructure/Clients/NethrisReportClient.cs` — `MapFormatToExtension`, `MapToReportSummary`
- `References/Nethris.md` (page 65, Table 12) — ENTITY AUTOMATEDREPORT field definitions
- `tests/EquipeLaurence.Infrastructure.Tests/NethrisReportClientTests.cs` — format mapping theory tests

**Build status (2026-05-08):** 0 errors, 0 warnings. 105 tests pass (19 Core, 49 Infrastructure, 15 Functions, 12
Integration, 10 Specs).

---

### 2025-05-08 — GraphServiceClient DI Research

**Task:** Eric asked whether the manual `GraphServiceClient` singleton registration follows Microsoft's recommended DI
pattern.

**Finding:** The current approach is correct for this project. Microsoft documents two patterns:

1. `AddMicrosoftGraph()` from `Microsoft.Identity.Web.GraphServiceClient` — for delegated (user) auth only
2. Manual singleton with `DefaultAzureCredential` — for app-only / daemon / managed identity scenarios

This project uses app-only permissions (`Sites.Selected`) with managed identity, so pattern #2 is the right choice. No
changes needed.

**Key insight:** `Microsoft.Identity.Web.GraphServiceClient` NuGet package requires `AddMicrosoftIdentityWebApi()` or
`AddMicrosoftIdentityWebApp()` as a prerequisite — it's tightly coupled to the delegated auth pipeline. Adding it to a daemon
app would be incorrect.

**Minor improvement available:** `DefaultAzureCredential` is instantiated twice (App Configuration + Graph). Could be shared
as a single singleton. Low priority — no functional impact.

**Decision:** Inbox item `switch-graph-di-research.md` created. No code changes proposed.

---

### 2026-05-07 — Issue #14: SharePoint Access Denied Error Handling

**Root cause:** The `Sites.Selected` permission model requires a two-step setup. Step 1 grants the API permission in Entra
ID. Step 2 creates a per-site permission via `POST /sites/{siteId}/permissions`. Missing step 2 causes 403 even with the
permission granted. The `SharePointClient` had zero Graph SDK error handling — `ODataError` exceptions propagated raw as
generic "SyncFailed" errors.

**Changes made:**

- `SharePointAccessDeniedException` added to `Core/Exceptions/` — typed exception with SiteId, DriveId, TargetPath,
  HttpStatusCode properties
- `SharePointClient.UploadFileAsync` now catches `ODataError` when `ResponseStatusCode` is 401/403 and wraps in
  `SharePointAccessDeniedException` with actionable log message
- `ValidateAccessAsync()` added to `ISharePointClient` — reads drive root to verify access, useful for startup diagnostics
- `ClassifyError` in `NethrisReportSyncService` now maps `SharePointAccessDeniedException` → `"AccessDenied"`
- Metadata write-back 403 is logged as warning but does not fail the upload
- Permission setup documentation at `docs/sharepoint-permission-setup.md`

**Key patterns:**

- Graph SDK v5 uses `Microsoft.Graph.Models.ODataErrors.ODataError` (not `ServiceException`)
- Access denied check: `ex.ResponseStatusCode is 401 or 403`
- Error code and message via `ex.Error?.Code` and `ex.Error?.Message`
- `StubSharePointClient` must be kept in sync with `ISharePointClient` contract changes

**Key file paths:**

- `src/EquipeLaurence.Infrastructure/Clients/SharePointClient.cs` — real Graph client
- `src/EquipeLaurence.Infrastructure/Stubs/StubSharePointClient.cs` — stub
- `src/EquipeLaurence.Core/Clients/ISharePointClient.cs` — interface contract
- `src/EquipeLaurence.Core/Exceptions/SharePointAccessDeniedException.cs` — typed exception
- `src/EquipeLaurence.Functions/FunctionAppStartup.cs` — DI registration (lines 69-75)
- `docs/sharepoint-permission-setup.md` — permission setup runbook

**Build Status (2026-05-07):** Issue #14 resolved. All 98 solution tests pass. 13 SharePointClient tests + 4 stub tests added
by Trinity. Decision #24 recorded.

**Branch:** `squad/14-fix-sharepoint-access-denied`
