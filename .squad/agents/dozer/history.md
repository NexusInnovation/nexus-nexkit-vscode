# Dozer — History & Learnings

## Summary (2026-05-19)

**Current Focus:** Issue #90 — ACS App Configuration and Key Vault wiring.

**Phase 6 Work (2026-05-19):**

- Issue #89: Cherry-picked ACS provisioning commit onto squad/90-acs-config as the foundation.
- Issue #90: Added AcsPhoneNumber KV secret placeholder to keyVault.bicep; added Acs:ConnectionString App Config KV reference
  to appConfiguration.bicep; wired params through main.bicep; updated all three .bicepparam files. Branch squad/90-acs-config
  pushed — awaiting Neo's C# changes.

## Research Session (2026-05-20, Eric De Carufel request — ACS Phone Number Acquisition for SMS)

**Requestor:** Eric De Carufel  
**Purpose:** Comprehensive research document for acquiring phone numbers via ACS for SMS to French-Canadian employees

### Findings Summary

1. **SMS Phone Number Types (Canada)**
   - **Recommended:** Toll-free numbers (1-8XX-XXX-XXXX) — GA in Canada, supports SMS send/receive
   - **Not Available:** Canadian local long codes (10-digit) do NOT support SMS in ACS (voice only)
   - **Alternative:** Short codes (5-6 digit) — available but require CWTA registration, ~6-8 weeks timeline, not practical
     for emergency use
   - **Impact:** Emergency notifications must use toll-free numbers

2. **Portal Process**
   - Navigate: ACS Resource → Phone numbers → + Get
   - Select: Canada, Toll-Free, SMS capability
   - Standard portal acquisition: instant to 5 minutes if numbers available
   - Special order (manual form): 3–10 business days via acstns@microsoft.com

3. **Compliance Forms Required**
   - **Toll-Free Verification Form (mandatory as of Nov 8, 2023):** Blocks unverified SMS traffic
   - **Standard portal:** No additional forms; automatic if available
   - **Manual order:** Download ACS-Manual-Number-Acquisition-Form-US-UK-CA-DK.docx from GitHub (need: business name,
     address, use case, volume)
   - **Toll-Free Verification Content:** Brand info, use case (emergency notifications), message volume, opt-out attestation

4. **Canadian Regulatory Landscape**
   - **CASL:** Transactional/emergency SMS exempt from consent; still need clear business ID + opt-out support
   - **CRTC:** Regulates toll-free SMS; requires verification program enrollment
   - **Mandatory Keywords:** STOP/ARRET, START/DEBUT, HELP (must be listened for via inbound webhooks and honored)
   - **Quebec Loi 25:** Requires Privacy Impact Assessment before transferring employee phone data to ACS; up to CA$25M
     penalties for non-compliance
   - **PIPEDA:** Federal law; similar but less strict than Loi 25
   - **SHAFT Compliance:** Not required in Canada (US requirement only)

5. **SMS Pricing**
   - **Toll-free number lease:** $2.00 CAD/month per number
   - **Outbound SMS:** $0.0085 CAD per 160-char segment
   - **Inbound SMS:** Not offered by ACS for Canada
   - **Toll-Free Verification:** No separate charge
   - **Example:** 1000 SMS/month on 1 number ≈ $10.50 CAD/month total

6. **Timeline for Acquisition**
   - **Portal self-serve:** Instant–5 min
   - **Manual form:** 3–10 business days
   - **Toll-Free Verification:** 1–5 business days after submission
   - **Total (best case):** 1 business day; (worst case): 15 business days
   - **Action:** Start immediately if targeting a specific SMS launch date

7. **Post-Acquisition Technical Setup**
   - **Outbound:** ACS SDK (Azure.Communication.Sms) + connection string from Key Vault (via Managed Identity)
   - **Inbound (opt-out handling):** Event Grid webhook subscription to `Microsoft.Communication.IncomingSMSReceived`
   - **Event payload schema:** Contains `to` (your number), `from` (sender), `message` (keyword)
   - **Security:** Use DefaultAzureCredential for Managed Identity auth; store connection string in Key Vault; HTTPS-only
     webhooks

8. **Canadian Data Residency & Alternatives**
   - **ACS in Canada regions:** Available in Canada Central (Toronto) and Canada East (Quebec City)
   - **Data residency ≠ data sovereignty:** Still subject to US CLOUD Act legal access
   - **Loi 25 requirement:** Conduct PIA before SMS data flows; ensure explicit consent documented
   - **Azure Government Cloud:** ACS NOT available in Canadian sovereign cloud; not an option for strict gov compliance
   - **Recommendation:** Use Canada East region for physical residency; document data flows in Loi 25 compliance file

### Key Learnings

- **Toll-free is the only practical SMS option in Canada via ACS** — local long codes unsupported
- **Toll-Free Verification is mandatory** — unverified traffic blocked by carriers since Nov 2023
- **Quebec Loi 25 compliance is essential** — PIA + consent records required; penalties severe
- **Timeline: start immediately** — best case 1 day, worst case 15 days
- **Managed Identity integration** — connection string in Key Vault, Event Grid for inbound opt-out handling
- **Canada region (East) recommended** for data residency alignment with Quebec

**Research complete.** Comprehensive report written to `.squad/decisions/inbox/dozer-acs-phone-number-research.md`

## Learnings (2026-05-19, issue #90)

### App Configuration Key-Value Patterns

Two content types are used for App Config key-values:

| Pattern             | contentType                                                        | When to use                                   |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| Plain value         | text/plain                                                         | Non-secret config (URLs, codes, names, flags) |
| Key Vault reference | application/vnd.microsoft.appconfig.keyvaultref+json;charset=utf-8 | Secrets stored in Key Vault                   |

**Key Vault reference JSON shape** (must match exactly): \\\json
{"uri":"https://<vault>.vault.azure.net/secrets/<secretName>/"} \\\

Helper functions in appConfiguration.bicep:

- getKeyVaultSecretUri(keyVaultUri, secretName) → URI string with trailing slash
- getAppConfigKeyVaultReference(secretUri) → JSON envelope string

**Resource naming convention** (App Config key-values use : as section separator):

- Nethris:BaseUrl, Nethris:UserPassword (KV ref), Twilio:AccountSid (KV ref)
- Acs:ConnectionString (KV ref) — new in #90

### Key Vault Secret Placement Decision

- **Dynamic secrets** (from listKeys() on new service modules like ACS) → inline resource in main.bicep with parent:
  keyVaultRef + dependsOn: [keyVault, serviceModule]
- **User-supplied secrets** (passwords, tokens, phone numbers) → declared as params in keyVault.bicep with shouldProvide\*
  conditional guard

### ACS-Specific Wiring Summary (#89 + #90)

- acsService.bicep provisions the ACS resource; its connection string is written to KV inline in main.bicep as
  secretAcsConnectionString
- acsPhoneNumber secret follows the phone number pattern in keyVault.bicep: if(!empty(acsPhoneNumberValue)) — no placeholder
  guard, no minimum length
- Acs:ConnectionString App Config key references KV secret acs-connection-string
- appConfiguration module now dependsOn: [functionAppKeyVaultAccess, secretAcsConnectionString] to ensure the KV secret
  exists before App Config reads it
- Issue #32: Fixed CI workflow parameter drift with Bicep. Params synced across workflows.

All Bicep builds passing. PRs under review.

### SMS provider switch (2026-05-20T09:04:58.029-04:00)

- `main.bicep` now uses `smsProvider` to select `twilioProvider.bicep`, `acsService.bicep`, or no SMS module.
- Twilio provisioning is Key Vault-only: `twilio-account-sid` and `twilio-auth-token` are written without creating Azure SMS
  resources.
- App Configuration now publishes `Sms:Provider` plus conditional Twilio KV references, while ACS-specific App Config entries
  were removed.
- Environment `.bicepparam` files now default to `smsProvider = 'Twilio'` and keep secret values out of source-controlled
  parameter files.

**Work Completed:**

- ACS Phone Number Acquisition research (toll-free recommended, portal process, compliance requirements)
- SMS provider switch decision (Bicep parameter controls module loading)
- Research merged to decisions.md
- Inbox cleared

- infra/main.bicep provisions: Storage Account, Application Insights + Log Analytics, Function App + App Service Plan, Key
  Vault, App Configuration
- Resource naming: {prefix}{env}{resource-suffix} — prefix defaults to eql (max 5 chars)
- Parameters per environment: infra/parameters/{env}.bicepparam
- Credentials (AppId, BusinessCode, UserCode, UserPassword) come from Azure Key Vault via managed identity
- All App Configuration keys centralized as single source of truth (see archived history for consolidation details)

### Round 1 Session (2026-05-20 — Ralph-driven, Issue #128)

**Issue #128 — Infrastructure Bicep: authsettingsV2 Entra ID Easy Auth**

**Branch:** `feature/128-bicep-entraid-auth` → PR #133 (→ develop, In review)

**Changes made:**

- Added `authsettingsV2` resource to the Function App Bicep module — enables Entra ID Easy Auth at the infrastructure level
- Added `authorizedGroupId` parameter — restricts access to a specific Entra ID group
- Added `AzureAd:AuthorizedGroupId` key to App Configuration — exposes the group ID to application code
- **Critical fix:** Added `excludedPaths` for Twilio and ACS webhook endpoints — inbound SMS webhooks must remain publicly
  reachable without Entra ID token enforcement; omitting this would have silently broken all inbound SMS handling

**Key decision:** Webhook exclusion paths are non-negotiable for inbound SMS; they must be listed explicitly in
`authsettingsV2.excludedPaths` or carriers cannot deliver inbound messages to the function.

## Previous Work

Earlier sessions (2026-05-05 through 2026-05-11) documented in history-archive.md:

- RBAC role assignments (Key Vault Administrator, App Configuration Data Owner)
- App Configuration consolidation (Issue #41) — removed duplicate direct app settings
- Startup-critical settings bootstrap layer
- Key Vault placeholder detection guards (Issue #38)
- SharePoint IDs configuration for dev environment

### ACS Provisioning (2026-05-19, issue #89)

**Branch:** `squad/89-provisionner-acs` → PR #96 (draft)

**Files created/modified:**

- `infra/modules/acsService.bicep` — new module
- `infra/main.bicep` — ACS module call + KV secret resource + 2 outputs
- `infra/parameters/dev.bicepparam`, `test.bicepparam`, `prod.bicepparam` — added `acsConnectionStringSecretName`

**Key decisions:**

- ACS resource uses `location: 'global'` (required by the provider); no `location` param in module to avoid unused-param
  warning
- Naming: `${prefix}${environment}acs` (no hyphens, matches naming convention `eqldevacs`)
- Connection string stored in Key Vault via a direct `Microsoft.KeyVault/vaults/secrets` inline resource in `main.bicep` (not
  inside `keyVault.bicep`) — because the value is only available after the `acsService` module deploys;
  `dependsOn: [keyVault]` ensures KV exists before the secret is written
- `#disable-next-line outputs-should-not-contain-secrets` applied on the `connectionString` output (same pattern already used
  in `storage.bicep`)
- `acsConnectionStringSecretName` param added to `main.bicep` with default `'acs-connection-string'`; explicitly set in all
  three `.bicepparam` files
- Outputs added to `main.bicep`: `acsResourceId`, `acsName` (not the connection string itself — secrets not exposed as stack
  outputs)
- Bicep build: 0 errors, 0 warnings

**Pattern established:** For new services whose connection strings are dynamic (listKeys), store the secret inline in
main.bicep rather than routing through keyVault.bicep to avoid ordering/circular dependency issues.

## Round 2 Session (2026-05-19, Ralph/Scribe)

**Issue #90 Status:** ✅ Bicep infrastructure complete, branch squad/90-acs-config pushed

- AcsPhoneNumber KV secret with post-deploy manual setup pattern established
- Acs:ConnectionString App Config key wired to KV reference
- Dependency chain validated: acsService → KV secret → App Config reference
- All bicepparam files updated with placeholder csPhoneNumberValue = ''
- Awaiting Neo's C# side (PR #98) before opening Bicep PR

**Learnings Applied:**

- App Configuration KV reference content-type pattern memorized from previous work
- Dynamic secrets from service modules → inline resource in main.bicep pattern confirmed reliable
- Post-deployment manual credential setup documented for operator handoff

**Decision Archive Impact:** 10 entries (#22–#32) archived; decisions.md reduced by 7397 bytes

## Round 3 Session (2026-05-20, Scribe)

**Issue #112 Status:** ✅ PR #120 opened — Bicep SMS provider separation complete

**Work Completed:**

- Refactored `infra/main.bicep` to support `smsProvider` parameter for conditional module loading
- Created new `infra/modules/twilioProvider.bicep` module (Twilio secrets only, no Azure SMS service)
- Retained `infra/modules/acsService.bicep` for rollback compatibility
- Updated App Configuration to publish `Sms:Provider` value
- Modified `infra/modules/appConfiguration.bicep` to handle conditional Twilio KV references
- Updated `infra/modules/keyVault.bicep` for Twilio credential guards
- Synced all `.bicepparam` files (dev, test, prod) with `smsProvider = 'Twilio'` defaults

**Decision Recorded:**

- SMS provider switch controlled via Bicep parameter
- Twilio secrets stored in Key Vault only; no Azure SMS service provisioned
- ACS module retained for rollback safety

**Files Changed:**

- infra/modules/twilioProvider.bicep (new)
- infra/modules/appConfiguration.bicep
- infra/modules/keyVault.bicep
- infra/main.bicep
- infra/parameters/dev.bicepparam
- infra/parameters/test.bicepparam
- infra/parameters/prod.bicepparam

### 2026-05-29 — Easy Auth Redirect Fix (production bug)

Changed `unauthenticatedClientAction` from `Return401` to `RedirectToLoginPage` in `functionApp.bicep`. Removed
`/api/notifications/sms/form` from `excludedPaths` so Easy Auth handles form authentication at the platform level.
Platform-level redirect is more reliable than app-level OnChallenge in Azure Functions.

**Files:** infra/modules/functionApp.bicep
