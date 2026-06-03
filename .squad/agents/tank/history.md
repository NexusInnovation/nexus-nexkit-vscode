# Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function pipeline — Nethris payroll reports to SharePoint. C# .NET 10.0, BDD testing with
  Gherkin/SpecFlow, multi-environment CI/CD (dev/test/prod). 125-hour budget.
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions
- **Created:** 2026-04-24

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-13 — CI Push Trigger on Main Was Missing

**Completed:** Added `push` trigger on `main` to `ci.yml`.

- **Problem:** The CI workflow only fired on `pull_request` and `workflow_dispatch`. After a PR was merged to `main`, no CI
  run was triggered — no test report and no code coverage were produced for the merged state.
- **Fix:** Added a `push` trigger targeting `main` with the identical `paths` filter used by the `pull_request` trigger
  (`src/**`, `tests/**`, `EquipeLaurence.sln`, `Directory.Build.props`).
- **Guard:** The `pr-comment` job already had `if: github.event_name == 'pull_request'`, so it correctly skips on `push`
  events without any additional change.
- **Rule:** CI workflows that need to validate the merged state of `main` must include a `push: branches: [main]` trigger in
  addition to `pull_request`. PRs validate the proposed change; the push trigger validates the actual merged result.

### 2026-05-11 — Build Triage Must Start From Current Worktree, Not Stale Failure Text

**Completed:** Reproduced and resolved the reported root `dotnet build` failure without changing application code.

- **Observed failure:** first compiler error reported `CS1501` against `ISharePointClient.UploadFileAsync` from
  `tests/EquipeLaurence.Core.Tests/NethrisReportSyncServiceTests.cs` and
  `tests/EquipeLaurence.Specs/Steps/NethrisReportSyncSteps.cs`, claiming a removed 6-argument overload.
- **Controlling path:** not `src/EquipeLaurence.Infrastructure/Clients/SharePointClient.cs`; the controlling contract is
  `src/EquipeLaurence.Core/Clients/ISharePointClient.cs` and the callers in test/spec projects.
- **Verified workspace state:** local unstaged edits already removed the obsolete metadata argument from both failing
  test/spec files. The mismatch was between earlier build output and the live worktree.
- **Fix path:** `dotnet clean EquipeLaurence.sln --nologo` followed by `dotnet build EquipeLaurence.sln --nologo` succeeds on
  the current workspace.
- **Triage rule:** before changing implementation code for a compiler mismatch, check `git diff`/worktree state and
  revalidate after a clean. Build logs can lag behind the actual source on disk.

### 2026-04-30 — OIDC Diagnostic & Provisioning Fix Summary

**Completed batch:** Created diagnostic script, fixed provisioning cascade bug, reviewed infra-deploy.yml.

- **`scripts/diagnose-oidc.ps1`**: Non-interactive 6-check validator for OIDC prerequisites. Prints fix commands inline.
  `-Fix` flag auto-repairs. Does NOT use Read-Host.
- **`provisioning.yml` cascade fix**: Added `deploy-dev-infra` to prod's `needs` list. Rewrote `if` condition to distinguish
  deliberate skip from cascade skip via event type + input check.
- **`infra-deploy.yml` review**: Confirmed sound. `azure/login@v3` correctly defaults `allow-no-subscriptions: false`. Login
  failure is Azure AD config (roles/federated credential), not workflow bug.
- **Decisions 12–14 recorded** in squad/decisions.md.

### 2026-04-30 — Function App Name Fix (Session: fix-function-app-name)

**Completed:** Fixed function app name mismatch in CI/CD pipeline (run 25174109342 ✅).

- **Problem:** `deploy.yml` hardcoded names (`equipelaurence-dev-func`, etc.) that don't match Bicep's `uniqueString` output.
- **Solution:** Removed `function-app-name` input from `function-deploy.yml`. Now reads exclusively from GitHub Environment
  `vars.FUNCTION_APP_NAME`.
- **Changes:** `.github/workflows/function-deploy.yml`, `.github/workflows/deploy.yml`; set
  `FUNCTION_APP_NAME=eql-dev-func-ifbrc23yuf52o` in dev environment.
- **Decision 15 recorded** in squad/decisions.md.
- **Commit:** `9ab6e5b` on `feature/workflow-ci-cd`.

### 2026-04-30 — Fix Dotfile Packaging in function-build.yml

**Completed:** Fixed `Compress-Archive` in the "Create deployment package" step to include hidden directories.

- **Problem:** On Ubuntu runners, `Compress-Archive -Path publish_output/*` does NOT match dotfiles/hidden directories. The
  `.azurefunctions/` folder (containing `Microsoft.Azure.WebJobs.Extensions.FunctionMetadataLoader.dll`) was omitted from the
  zip, causing the function host to find 0 functions.
- **Solution:** Replaced the glob path with `Get-ChildItem -Force` which includes hidden items:
  `$items = (Get-ChildItem publish_output -Force).FullName` piped into `Compress-Archive`.
- **Key learning:** PowerShell's `*` wildcard excludes dotfiles on Linux. Always use `Get-ChildItem -Force` when zipping
  published .NET output to ensure `.azurefunctions/` is included.
- **File changed:** `.github/workflows/function-build.yml` (line 96).
- **Commit:** `3629fc0` on `feature/sync-function`.
- **Decision 20 recorded** in squad/decisions.md.

### 2026-05-08 — CI/CD Pipeline Optimization Analysis

**Completed:** Detailed analysis and proposal for reducing build/deployment times.

- **Core finding:** 3 out of 4 common Git events trigger duplicate or triple builds due to overlapping triggers between
  `ci.yml`, `deploy.yml`, and `squad-ci.yml`.
- **Root cause:** `ci.yml` has push triggers that overlap with `deploy.yml`; `deploy.yml` has PR triggers that overlap with
  `ci.yml`; `squad-ci.yml` targets `main` which overlaps both.
- **Solution:** Separate by event type — `ci.yml` for PRs only, `deploy.yml` for pushes only. Remove `main` from
  `squad-ci.yml`.
- **Secondary findings:** `fetch-depth: 0` in `function-build.yml` is unnecessary (no step uses Git history);
  `integration-tests.yml` builds entire solution when it only needs the integration test project; `provisioning.yml` has an
  anomaly where push-to-develop could trigger prod infra deployment.
- **Key constraint:** Branch protection requires "CI — Build & Test" status check — must verify exact check name before
  modifying triggers.
- **Effort:** ~1 hour for all changes.
- **Deliverable:** `docs/proposal-cicd-optimization.md` — awaiting Eric's approval.

### 2026-05-08 — CI/CD Pipeline Optimization Implementation

**Completed:** Implemented all 6 approved optimizations from `docs/proposal-cicd-optimization.md`.

- **`ci.yml`**: Removed `push` trigger (was duplicating `deploy.yml` on develop). Added `pull-requests: write` permission and
  `pr-comment` job that posts build summary on PRs (ported from `squad-ci.yml`).
- **`deploy.yml`**: Removed `pull_request` trigger (was duplicating `ci.yml` on main PRs). Simplified concurrency group to
  `deploy-${{ github.ref }}`.
- **`function-build.yml`**: Changed `fetch-depth: 0` → `fetch-depth: 1`. No workflow step uses Git history.
- **`integration-tests.yml`**: Scoped `dotnet restore`/`dotnet build` to `tests/EquipeLaurence.IntegrationTests` instead of
  the full solution.
- **`provisioning.yml`**: Fixed `deploy-prod-infra` condition to require `github.ref == 'refs/heads/main'` for push events,
  preventing accidental prod infra deployment on develop pushes.
- **`squad-ci.yml`**: Simplified branches to `preview` only. `develop`/`main` are covered by `ci.yml`; `dev`/`insider` are
  unused.
- **Net effect:** Eliminates duplicate/triple builds on the 3 most common Git events; reduces build minutes and removes the
  risk of accidental prod infra provisioning from develop.

### 2026-05-11 — Fix Provisioning/Deploy Race Condition

**Completed:** Eliminated the cross-workflow race condition where `provisioning.yml` and `deploy.yml` could race each other
to deploy prod infra and the prod app simultaneously on a push to `main` that touched both `infra/**` and `src/**`.

- **Root cause:** `provisioning.yml` triggered on push to `main` (infra changes) and `deploy.yml` triggered on push to `main`
  (src changes). GitHub Actions `needs` only orders jobs within a workflow; there is no cross-workflow dependency
  enforcement.
- **Fix — `provisioning.yml`:** Removed `main` from `on.push.branches`. Prod infra on push to main now lives exclusively in
  `deploy.yml`. Cleaned up `deploy-prod-infra` job condition to remove the now-unreachable push-to-main branch.
  `provisioning.yml` still handles dev infra (push to develop), PR validation (pull_request to main), and manual dispatch.
- **Fix — `deploy.yml`:** Added `infra/**` to `on.push.paths` so infra-only changes on main still trigger this workflow.
  Added `detect-changes` job (dorny/paths-filter@v4) to detect whether `infra/**` or `src/**` changed on push events. Updated
  `build` job to depend on `detect-changes` and skip when only infra changed. Updated `deploy-prod-infra` job to depend on
  `detect-changes` and fire on push-to-main when infra changed (in addition to existing workflow_dispatch). `deploy-prod-app`
  required no changes — its existing `always()` + `skipped||success` pattern correctly gates on build and infra results.
- **Invariant preserved:** Infra always deploys before app on push to main. Both are ordered jobs within the same workflow
  via `needs`.
- **Decision recorded:** `.squad/decisions/inbox/tank-pipeline-ordering.md`

### 2026-05-19 — Issue #101 Delivery Readiness Assessment

**Completed:** Assessed GitHub issue #101 (Use Azure Table Storage data to send SMS) for DevOps delivery readiness.

- **Finding:** All DevOps prerequisites are satisfied. Infrastructure, CI/CD, secret management, and DI registration are
  ready.
- **Infrastructure status:** Bicep templates support Twilio configuration (`smsEnabled`, `twilioAccountSid`,
  `twilioAuthToken`, `twilioFromNumber`, `twilioStatusCallbackUrl`). Key Vault stores secrets. App Configuration holds
  non-secret settings. All three environments (dev, test, prod) have parameter definitions.
- **Secret flow:** GitHub Actions secrets → Bicep parameters → Key Vault → App Configuration (KV reference) → Function App.
- **CI/CD status:** `ci.yml`, `deploy.yml`, and `integration-tests.yml` already configured to pass Twilio credentials.
  Feature flags (`Sms:Enabled`, `AzureWebJobs.SendEmergencySms.Disabled`, `AzureWebJobs.TwilioInboundWebhook.Disabled`) ready
  to enable SMS.
- **DI registration:** `FunctionAppStartup.cs` binds `TwilioOptions` and registers `ITwilioClient` (either `TwilioSmsClient`
  or `DisabledTwilioClient` based on `Sms:Enabled`).
- **Existing interfaces & implementations:** All necessary clients exist (`ITwilioClient`, `ISmsIdempotencyStore`,
  `ISmsAuditClient`, `IOptOutRegistryClient`, `IDeliveryStatusStore`, `IRecipientIndexClient`). Infrastructure
  implementations in place.
- **Safety:** `smsEnabled` parameter defaults to `false` in all environments (not explicitly set in `.bicepparam` files) —
  safe for implementation work without affecting live environments.
- **Next steps:** Morpheus can implement Issue #101 immediately. When ready for production, Tank will enable
  `smsEnabled = true` per environment and monitor first deployment.
- **Decision recorded:** `.squad/decisions/inbox/tank-issue-101-readiness.md`

See history-archive.md for prior learnings and context from 2026-04-24 through 2026-04-30.

## 2026-05-19 — Issue #101 Readiness Assessment (Background Spawn)

**Status:** Completed  
**Verdict:** ✅ READY TO IMPLEMENT  
**Blocked by:** #100 (architecture triage)  
**Next:** Morpheus for implementation

Tank assessed DevOps readiness for issue #101 (SMS via Table Storage). Assessment:

- ✅ Bicep templates support Twilio parameters (all envs)
- ✅ Azure Key Vault secrets wired; App Configuration non-secrets configured
- ✅ GitHub Actions secrets defined: TWILIO\_\* (prod + test variants)
- ✅ CI/CD pipeline configured: ci.yml, deploy.yml, integration-tests.yml
- ✅ DI registration complete: ITwilioClient wired, feature flag Sms:Enabled ready
- ✅ All interfaces + reference implementations exist (SendEmergencySmsFunction as pattern)
- ✅ SMS disabled by default (safe until implementation complete)

No DevOps action required now. Implementation can begin immediately. When complete, Tank will enable smsEnabled = true per
environment.

Full readiness assessment in .squad/decisions.md. Orchestration log: .squad/orchestration-log/2026-05-19T141429Z-tank.md.
