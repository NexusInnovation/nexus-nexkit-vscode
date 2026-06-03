# Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function pipeline — Nethris payroll reports to SharePoint. C# .NET 10.0, BDD testing with
  Gherkin/SpecFlow, multi-environment CI/CD (dev/test/prod). 125-hour budget.
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions
- **Created:** 2026-04-24

## Summary (2026-04-24 through 2026-05-22) — archived to history-archive.md

**Phase 1 (Foundation):** Solution scaffold with 3-layer architecture (Core/Infrastructure/Functions), Directory.Build.props,
Bruno test collection, 27 initial tests.

**Phase 2 (Sync Pipeline):** NethrisReportSyncService orchestrator, 4 client interfaces (INethrisAuthClient,
INethrisReportClient, ISharePointClient, ISyncLedger), HTTP sync endpoint, stub infrastructure clients, DI wiring. Options
validation with ValidateOnStart.

**Key issues completed:**

- #90 AcsOptions POCO/DI, #91 ExcelEmployeeReader (EPPlus), #100 BaseTI workbook ingestion, #111 ACS dependency removal, #126
  EntraID middleware for SMS, #130 Entra ID auth documentation (PR #135)

**Patterns established:** Interface-first design, sealed stubs with ILogger, ValidateDataAnnotations+ValidateOnStart, typed
HttpClient with Polly, singleton readers, scoped orchestrators. Bruno tests are authoritative API reference.

**Full details:** See `history-archive.md`

---

## Learnings

### 2026-05-25 — Debug: Local Sync Pipeline (Pass 1 + Pass 2)

**Pass 1 — Timer trigger regression:**

- `local.settings.json` missing `Nethris__SyncSchedule` caused startup crash
- Commit `abb8cac` hardcoded cron instead of adding the key — severed production schedule
- Fix: restored `%Nethris__SyncSchedule%` binding + added key to local.settings.json
- Regression guard: reflection test asserts `TimerTriggerAttribute.Schedule == "%Nethris__SyncSchedule%"`

**Pass 2 — Nethris API case-sensitivity:**

- `GetAvailableReportsAsync`: `Type = "getList"` → `"getlist"` (lowercase)
- `DownloadReportAsync`: `Entity = "AutomatedReport"` → `"automatedreport"` (lowercase)
- Evidence: Bruno collection tests use lowercase and succeed against real WCF API
- Unit tests had perpetuated wrong values (they only checked internal consistency)

**Pass 2 — TryClaimAsync permanent lock-out:**

- `AddEntityAsync` returned 409 on re-claim after failed upload — reports permanently locked
- Fix: read-then-write pattern (get → check status → upsert/add) allows re-claim on retry
- 3 new tests: re-claim, synced-skip, concurrent-race

**Rules learned:**

- Never hardcode `%SettingKey%` bindings — add missing keys to local.settings.json
- Bruno tests = authoritative Nethris API field values
- Pre-operation claims need re-claim paths for retry safety

---

### 2026-05-29 — SMS Auth Fix (production bug)

Fixed `SmsAuthorized` policy to require `RequireAuthenticatedUser()` (Easy Auth redirect), changed SMS form JS to `fetch()`
with `credentials: 'include'`, and updated `RequesterPrincipal` to resolve actual Entra ID identity from `ClaimsPrincipal`.
Build clean. 224 tests pass.

**Patterns:** Auth policy composition (`RequireAuthenticatedUser` + custom claims), `fetch()` with credentials for
cookie-based auth, `ClaimsPrincipal` identity extraction.

### 2026-05-29 — Easy Auth Redirect Fix (production bug, continued)

Updated comments in `FunctionAppStartup.cs`. Updated `SmsFormFunction.cs` JavaScript to detect session expiration via
`resp.redirected` check and HTML content-type detection. Defense-in-depth: app-level handler remains alongside platform-level
Easy Auth redirect.

**Files:** src/EquipeLaurence.Functions/FunctionAppStartup.cs, src/EquipeLaurence.Functions/SmsFormFunction.cs


## Learnings — 2026-06-03 (Issue #162, nexus-nexkit-vscode)

### Context switch: TypeScript VS Code extension
This session involved a different project (nexus-nexkit-vscode, TypeScript) rather than the usual C#/.NET Azure Function work. The patterns are fundamentally different: static singleton services (SettingsManager), VS Code extension API, Sinon stubs.

### dit tool silently fails in this environment
The dit tool consistently reported success but did NOT write to disk. Workaround: use PowerShell Set-Content for short replacements, or Python scripts for complex multi-block changes. The create tool also failed — use Set-Content instead.

### Sinon stubbing of static classes
sandbox.stub(SettingsManager, 'methodName') works in Sinon but requires the method to exist in compiled types. When TypeScript errors say "cannot find name on type", compile first with 
pm run check:types to confirm the source methods exist.

### VS Code workspaceState for persistence
SettingsManager wraps workspaceState.update / get — the correct approach for persisting user decisions that are per-workspace (like "Refuse Forever"). Using globalState would have been wrong here; the confirmation is scoped to the workspace.

### Pre-existing test failures don't block our work
	eamsRelayServer.test.ts failed with a missing __mocks__/vscode module on both develop and our branch — confirmed pre-existing by running tests on the baseline. Our tests are covered by 	est:headless which passes cleanly.

### Confirmation UX pattern decided
- ESC / dismiss → treated as **Accept** (non-destructive default, user didn't explicitly refuse)
- **Refuse** → operation skipped this session
- **Refuse Forever** → key persisted in workspaceState, dialog never shown again for that key

---

### ConfirmationService architecture (Issue #162)

**Service structure:**
- `ConfirmationService.requestConfirmation(key, message)` — Shows modal, returns Promise<ConfirmationAction>
- Modal has three buttons: Accept, Refuse, Refuse Forever
- Each operation (chat settings, MCP servers, etc.) gets a confirmation key via CONFIRMATION_KEYS factory

**CONFIRMATION_KEYS pattern:**
- Static keys for singleton operations: `CONFIRMATION_KEYS.CHAT_SETTINGS`
- Factory functions for per-instance operations: `CONFIRMATION_KEYS.mcpUserServer(name)`, `mcpWorkspaceServer(name)`
- Isolation: refusing forever for one MCP server does NOT affect other servers

**Deployment gating:**
- `RecommendedSettingsConfigDeployer` (chat settings) — gated by ConfirmationService
- `MCPConfigDeployer` (user/workspace) — gated, checks if user already refused forever
- `MCPConfigService` reads/writes — gated before config mutations
- `workspaceToUserMigrationService` — explicitly excluded (has own multi-step consent flow)

**Testing patterns in VS Code extension context:**
- Sinon stubs for `vscode.window.showInformationMessage` to mock user responses (Accept, Refuse, Refuse Forever, undefined)
- Mock workspaceState via sandbox.stub(context, 'workspaceState')
- Test both accept/refuse/refuse-forever paths + undefined (modal dismissed)
- Verify `SettingsManager.setConfirmationRefusedForever(key)` was called only on RefusForever action
