# Mouse — Project History

## 2026-05-05 — TwilioOptions Config Analysis

### TwilioOptions Structure
- **File:** `src/EquipeLaurence.Core/Configuration/TwilioOptions.cs`
- **Section name:** `"Twilio"` (constant `TwilioOptions.SectionName`)
- **All three fields are `[Required]` with `required` keyword:**
  - `AccountSid` — Twilio account SID (format: `ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`, 34 chars starting with `AC`). Source: **Azure Key Vault**.
  - `AuthToken` — 32-char hex token. Source: **Azure Key Vault**.
  - `FromNumber` — E.164 format (e.g. `+15140000000`). Source: App Config (not Key Vault).
- No optional fields — all three are hard required.

### Program.cs Wiring
- Registered with `.AddOptions<TwilioOptions>().BindConfiguration("Twilio").ValidateDataAnnotations().ValidateOnStart()`.
- **`ValidateOnStart()` is present** → crashes immediately at host startup if any field is missing/null.
- `ITwilioClient` registered as `Singleton<TwilioSmsClient>` — constructor calls `TwilioClient.Init()` eagerly.

### Root Cause of Startup Crash
`ValidateOnStart()` triggers DataAnnotation validation before any HTTP request is served. If `Twilio:AccountSid`, `Twilio:AuthToken`, or `Twilio:FromNumber` are absent from config/Key Vault, the host refuses to start.

### Optionality Assessment
Twilio is the sole SMS transport — `ITwilioClient` has no no-op fallback. Making it conditionally optional would require:
1. A `NullTwilioClient` that returns `Success = false` without calling the API, or
2. Removing `ValidateOnStart()` (switches to lazy crash on first SMS send), or
3. Guarding registration with a config presence check before binding.
Architecturally, Twilio is always required in production. The crash is appropriate in prod; dev/CI environments need valid or stub credentials.

### 2026-05-05 — Twilio Analysis → Decisions Merged

**Status:** Analysis finalized and merged into `.squad/decisions.md`

**Resolution:** Confirmed no code changes needed. Dozer provisioned all three Twilio secrets in Key Vault (`twilio-account-sid`, `twilio-auth-token`, `twilio-from-number`) via Bicep, with references in Function App appSettings using `@Microsoft.KeyVault()` syntax.

**Outcome:** Startup crash will be resolved once Key Vault secrets are populated in each environment. For dev, user actions required: replace placeholder KV secrets with real or stub Twilio credentials.

## Learnings

### 2026-05-13T11:52:40.858-04:00 — Delivery status correlation

- Twilio delivery callbacks can be correlated back to a broadcast safely by appending `broadcastIdempotencyKey` to `Twilio:StatusCallbackUrl` on each `MessageResource.CreateAsync` call.
- Reusing a shared request-signature validator keeps inbound STOP/START and delivery-status webhooks aligned on URL reconstruction and HMAC validation rules.
- Persist only masked recipient numbers (for example `+1******7890`) in `SmsDeliveryStatus`; full E.164 values never need to leave the webhook request scope.

### 2026-05-13T12:06:22.845-04:00 — Delivery status store guardrails

- `IDeliveryStatusStore` now needs both `UpsertAsync` and `GetByMessageSidAsync` so callback ingestion can detect and ignore Twilio status regressions for the same `MessageSid`.
- `src/EquipeLaurence.Infrastructure/Clients/TableStorageDeliveryStatusStore.cs` should treat `delivered`, `failed`, and `undelivered` as terminal ranks and avoid overwriting them with late `sent` or `queued` callbacks.
- Optional callback correlation fields such as `BroadcastIdempotencyKey` should be omitted from Azure Table entities when absent; storing empty strings makes downstream null checks unreliable.

### 2026-05-19T10:14:29.872-04:00 — BaseTI-backed SMS recipient resolution

- `SendEmergencySmsFunction` now resolves recipients through `ISmsRecipientSource`, with `src\EquipeLaurence.Infrastructure\Clients\BaseTiSmsRecipientSource.cs` adapting `BaseTi` snapshot rows into `RecipientRecord` so the Twilio pipeline can move to the BaseTI source without changing opt-out, audit, or idempotency contracts.
- `IBaseTiRepository` now exposes `GetByLocationAsync`, letting SMS flows query the authoritative `BaseTi` Azure Table partition directly instead of depending on the older `RecipientIndex` table.
- `SendEmergencySmsFunction` supports lightweight token rendering (`{firstName}`, `{lastName}`, `{fullName}`, `{employeeNumber}`, `{locationCode}`) and logs each send result with masked recipient numbers only; message bodies and full E.164 values still stay out of logs.

### 2026-05-20T08:17:46.634-04:00 — Twilio inbound STOP/START webhook

- `src\EquipeLaurence.Functions\TwilioInboundSmsFunction.cs` now handles `POST /api/sms/inbound/twilio`, validates `X-Twilio-Signature` with forwarded host/proto reconstruction, and always returns empty TwiML on accepted requests.
- STOP/START keyword matching was centralized in `src\EquipeLaurence.Core\Models\SmsKeywords.cs` so Twilio and ACS inbound handlers share the same bilingual opt-out/opt-in vocabulary.
- Inbound webhook logs continue the PII rule: only masked sender numbers (`****last4`) appear in `TwilioInboundSmsFunction` log entries and function tests cover both masking and first-word-only keyword handling.

### 2026-05-20T15:19:46.949-04:00 — ACS SMS Compliance Landscape (Canada/Quebec)

**CASL Exemption for Emergency SMS:**
- Emergency/transactional SMS to employees are exempt from CASL (Canadian Anti-Spam Legislation) consent requirements if non-promotional and directly related to employment/safety.
- Employment relationship provides implied consent; no express opt-in forms needed. However, Loi 25 (Quebec) imposes stricter data protection requirements.

**Loi 25 Mandatory Privacy Impact Assessment:**
- SMS system deployment requires formal PIA (Privacy Impact Assessment) due to cross-border data processing via Microsoft Azure infrastructure.
- PIA must document: personal data types, collection purpose, retention period, risk mitigation (encryption, access controls), and cross-border transfer risk assessment (US CLOUD Act).
- Privacy Officer must review and approve PIA before system goes live.

**ACS vs. Twilio Compliance Overhead:**
- Twilio auto-handles STOP/START keywords and some compliance features; ACS requires YOU to implement opt-in/out flows, keyword detection, blocklist management, and audit logging manually.
- No "10DLC" program for Canada; Twilio users on short codes must migrate to ACS toll-free (different verification process: 5–6 weeks).

**Toll-Free Verification (if using toll-free numbers):**
- 5–6 week approval cycle; requires business documentation (legal registration, address proof, authorized contact), use case description, sample messages, and proof of employee opt-in.
- Unverified toll-free numbers are BLOCKED from sending SMS in Canada.

**Bilingual STOP/ARRET Handling:**
- Both STOP and ARRET keywords must be detected and honored; auto-reply confirmation recommended in both languages ("You have been removed / Vous avez été retiré(e)").
- Centralize keyword detection in shared `SmsKeywords` class for consistency between Twilio and ACS inbound handlers.

**Phone Number Storage & Retention (Loi 25):**
- Phone numbers are personal information; must be stored securely and retained only as long as necessary.
- Recommended retention: active employment + 90 days post-termination; then securely delete.
- Employees have right to request deletion; you must comply within 30 days.

**Content Compliance (SHAFT, URLs):**
- Azure ACS prohibits SHAFT content (sex, hate, alcohol, firearms, tobacco), phishing, malware, fraud.
- Emergency/operational SMS are permitted; keep messages under 160 chars (English) or 70 chars (bilingual with accents).
- Use legitimate URLs; avoid carrier-flagged short URL services. Implement bilingual message encoding (GSM-7 vs. UCS-2).

## Session: ralph-round7 (2026-05-19T14:14:29Z)

### Scribe Note: Issue #101 Completion Recorded

Mouse Issue #101 deliverables documented:
- BaseTI-backed SMS recipient source via ISmsRecipientSource adapter
- Personalized token rendering in message templates
- Masked send logs for PII compliance
- Documentation updated for operator reference
- Release build and test suite passing

Decision merged to .squad/decisions.md. QA validation harness locked by Trinity.

**Status:** All team records updated and committed.

## Session: ralph-round1 (2026-05-20T12:17:46Z)

### Issue #110 — Twilio Inbound SMS Function

**Status:** PR #118 opened — In review

**Work Completed:**
- Implemented `TwilioInboundSmsFunction` at `POST /api/sms/inbound/twilio`
- HMAC-SHA1 signature validation for Twilio webhook security
- STOP/ARRET/START keyword handling via shared `SmsKeywords` class
- TwiML response format: `200 text/xml` with empty body for silent acknowledgments
- Marked `AcsInboundSmsFunction` obsolete (deprecated)
- Build and tests passed

**Decision Record:**
- Canonical SMS keywords in `src\EquipeLaurence.Core\Models\SmsKeywords.cs`
- Twilio and ACS handlers share one source of truth for bilingual compliance
- Decision merged to `.squad/decisions.md`

**Next Steps:**
- Await PR review
- Trinity added 7 test cases (58/58 passing)

## Session: mouse-research-round1 (2026-05-20T15:19:46Z)

### ACS SMS Compliance Research for Canada/Quebec

**Status:** Comprehensive research completed; document published to `.squad/decisions/inbox/mouse-acs-sms-compliance-research.md`

**Research Scope:**
- Canadian SMS regulatory landscape (CRTC, CASL, CWTA)
- ACS-specific compliance requirements (toll-free verification, acceptable use policy)
- Quebec Loi 25 privacy requirements (PIA, retention, cross-border data)
- Required documentation for phone number provisioning
- Opt-out/STOP-ARRET bilingual handling in ACS
- Content compliance (SHAFT policy, character limits)
- Twilio vs. ACS compliance migration differences

**Key Findings:**
- **CASL Exemption:** Emergency/transactional SMS to employees are exempt from CASL consent requirements if non-promotional
- **Loi 25 Mandate:** Privacy Impact Assessment is REQUIRED before deploying SMS system (cross-border data processing risk)
- **Toll-Free Verification:** If using toll-free numbers, 5–6 week verification cycle required; includes business docs, use case, sample messages, opt-in proof
- **ACS Compliance Gap:** Unlike Twilio, ACS requires manual implementation of opt-in/out flows, keyword detection (STOP/ARRET), blocklist management, and audit logging
- **Bilingual Requirement:** Both STOP and ARRET must be supported; bilingual confirmations recommended
- **No CASL Consent Needed:** Employment relationship + transactional/emergency classification = implied consent (no express opt-in forms needed)
- **Carrier Compliance:** No SMS short code support in ACS Canada (toll-free only); CWTA short code program does not apply to ACS

**Status:** Research complete; merged to decisions.md by Scribe (2026-05-20T19:19:46.949Z)- Comprehensive compliance checklist covering 8 regulatory domains
- Phase-by-phase implementation roadmap (9 weeks total)
- 25+ action items organized by PHASE 1–5 initiative
- References to official CRTC, CASL, CAI, and Microsoft documentation
- Comparison table: Twilio vs. ACS compliance overhead

## Learnings

### 2026-05-25T18:55:32.736-04:00 — SMS form collapsible bureau panels (issue #137)

- `IBaseTiRepository.GetAllAsync()` returns `BaseTiRecord`, not `RecipientRecord`. The phone field is `MobilePhoneE164` — always verify the concrete model before writing LINQ against it.
- Embedding employee data server-side at render time (no AJAX) is the correct approach for this form: the data is already in memory from `GetAllAsync`, the form is auth-gated by `[Authorize(Policy = "SmsAuthorized")]`, and adding a separate JSON endpoint would expose PII without benefit.
- For expand/collapse toggles that coexist with a checkbox inside the same clickable row: the JS click handler must `return` early when `e.target.type === 'checkbox'`, letting the browser handle the checkbox natively while the rest of the header row drives the panel toggle.
- Using `&#9658;` (▶) and `&#128222;` (📞) as HTML entities in C# interpolated string literals avoids UTF-8 escaping issues in the `StringBuilder`-generated HTML.
- The `max-width: 560px` container makes single-column (flex-direction: column) the natural layout for bureau panels — the previous auto-fill grid was optimized for wider viewports.
- Canadian E.164 numbers are always 12 chars starting with `+1`; a simple range-based formatter `$"+1 ({e164[2..5]}) {e164[5..8]}-{e164[8..]}"` is sufficient and avoids a regex dependency.

---

## Session: scribe-consolidation-round1 (2026-05-25T19:40:30Z)

### Decision: Server-side Rendering for SMS Form Employee Data (Issue #137)

**Status:** Merged to `.squad/decisions.md`

**Decision:**
- Employee data (names + formatted phone numbers) embedded directly in HTML during `GET /api/notifications/sms/form` rendering
- No additional AJAX endpoints created

**Rationale:**
- `IBaseTiRepository.GetAllAsync()` already called once — data in memory, integration cost zero
- Form protected by `[Authorize(Policy = "SmsAuthorized")]` — embedded data inherits this protection
- Separate JSON endpoint exposing names and numbers by location would constitute unnecessary PII API surface
- Server-side rendering avoids flash of empty content

**Implementation Details:**
- `BureauInfo` extended with `IReadOnlyList<EmployeePreview> Employees`
- `EmployeePreview` is a simple record: `(string DisplayName, string PhoneDisplay)`
- E.164 → Canadian display formatting via `FormatPhoneDisplay` in `SmsFormFunction.cs`
- Only employees with `IsEligibleForSms == true && MobilePhoneE164 != null/whitespace` appear in panels
- No `IBaseTiRepository` interface modifications required

**Scribe Note:** Decision merged during consolidation pass along with Neo debug findings and mouse's SMS form decision inbox entries.