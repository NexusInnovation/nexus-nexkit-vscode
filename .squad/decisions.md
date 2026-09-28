# Squad Decisions — Active

> **Résumé.** Active decisions only; see decisions-archive.md for full history of older decisions (before 2026-08-29).

---

## Decision: Settings deployer marketplace bootstrap (2026-08-07)

• Bootstraps chat.plugins.marketplaces with NexusInnovation/nexus-plugin-marketplace when missing.
• Pre-seed marketplace in test setups to avoid false-negative test failures.

---

## Decision: Test pipeline validation — auth noise and hardening plan (2026-08-07)

• Test pipeline stable: 388 passing, 8 pending. Previous failure transient/non-reproducible.
• Medium regression risk: extension-host auth logs produce blocked-dialog noise during tests.
• Follow-up: add auth suppression test, negative-path assertions, deterministic smoke script with per-stage logs.

---

## Decision: Marketplace identifier normalized (2026-08-26)

• OFFICIAL_PLUGIN_MARKETPLACE constant changed from NexusInnovation/nexus-plugin-marketplace#main to bare NexusInnovation/nexus-plugin-marketplace.
• Deduplication logic ensures existing #main-suffixed entries recognized as same marketplace, rewritten to bare key. Optimization: no write if unchanged.

---

## Decision: Squad-in-NexKit hybrid integration (2026-09-28)

• **Presets:** plugins/<team>/squad/ in nexus-plugin-marketplace; authoring out of scope for NexKit.
• **CLI/GUI:** NexKit reads .squad files; squad CLI user-initiated; prompt before install/run.
• **UI:** Dedicated Squad tab in webview; auto-detect updates; backup before apply.
• **Backlog:** GitHub Issues + Azure DevOps for MVP; Jira in v2+. MVP-first phasing.
• **Upstream:** Marketplace preferred; new repo fallback. Epics #212–#215 + 55 sub-issues created.

---

# Texte intégral — Entrées résumées (2026-09-28)

Below: full original text of summarized decisions for future reference.

---

## Decision: Align unchanged-settings test with marketplace bootstrap behavior

**Date:** 2026-08-07
**Agent:** Link
**Classification:** Project-specific — settings deployer tests

### Context

An unchanged-settings unit test in `RecommendedSettingsConfigDeployer` failed because it asserted no writes while the deployer intentionally bootstraps `chat.plugins.marketplaces` when missing.

### Decision

Pre-seed `plugins.marketplaces` with `NexusInnovation/nexus-plugin-marketplace#main` in the unchanged-settings test setup so the assertion validates only true regressions.

### Why

The deployer's bootstrap write is expected behavior, and the prior setup produced a false negative.

---

## Decision: Test triage outcome and regression-risk posture after transient failure

**Date:** 2026-08-07
**Agent:** Trinity
**Classification:** Project-specific — test pipeline validation

### Context

A prior run reported `npm run test` exit code `1`. Trinity revalidated the full pipeline.

### Decision

Current status is stable for this run: `npm run test-compile` pass, `npm run lint` pass, `npm test` pass (`388 passing`, `8 pending`, exit `0`). The previous failure is treated as transient/non-reproducible for now.

### Regression risk

Medium. Extension-host auth-path logs still produce repeated blocked-dialog noise during tests, which can obscure real auth regressions.

### Follow-up hardening

1. Add a focused extension-host test that explicitly validates auth prompt suppression in test mode.
2. Add negative-path assertions around auth session retrieval to validate expected failures.
3. Add a deterministic smoke script (compile + lint + unit + extension-host) that preserves per-stage logs for flaky-run diagnosis.

### Why

QA classification separates transient environment noise from actionable product/test regressions while documenting concrete hardening work.

---

## Decision: Marketplace identifier normalized, legacy suffix deduped

**Date:** 2026-08-26
**Agent:** Link
**Classification:** Project-specific — NexKit marketplace settings handling

### Context

`OFFICIAL_PLUGIN_MARKETPLACE` in `recommendedSettingsConfigDeployer.ts` changed from `NexusInnovation/nexus-plugin-marketplace#main` to the bare `NexusInnovation/nexus-plugin-marketplace`. The `chat.plugins.marketplaces` ensure-first logic now normalizes on a `#ref`-stripped key, so any existing `#main`-suffixed entry is recognized as the same marketplace, deduped against the bare key, and rewritten to the bare key (first in the list). The "skip write if unchanged" optimization still applies.

### Why

The `#main` suffix was unnecessary and caused a mismatch between the constant and a bare-key entry a user might already have, risking duplicate marketplace entries.

---

## Decision: Squad-in-NexKit Integration PRD — Hybrid Approach

**Date:** 2026-09-28
**Agent:** Orchestrator (Eric De Carufel)
**Classification:** Project-specific — nexus-nexkit-vscode Squad-in-NexKit feature roadmap

### Context

Squad management capability integration into Nexus NexKit. Three concurrent research agents (Morpheus, Link, Oracle) gathered requirements, authored PRD documentation, and created epic/issue backlog.

### Decision

Hybrid integration model for Squad management in NexKit:

1. **Presets location:** Squad presets live in `plugins/<team>/squad/` within nexus-plugin-marketplace. Authoring presets is out of scope for NexKit itself.

2. **Read-only `.squad` support:** NexKit will read and respect `.squad` files at workspace root for team/project/profile configuration. CLI operations (squad commands) are user-initiated via terminal.

3. **Hybrid CLI/GUI:** CLI operations handled by squad CLI; users are prompted before installing CLI tools. NexKit integration asks before running squad CLI commands.

4. **UI placement:** Dedicated "Squad" tab in the existing NexKit webview sidebar panel, alongside existing features.

5. **Updates:** Auto-detect Squad config updates, notify user, confirm before applying. Automated backup before any destructive operations (BackupService).

6. **Upstream promotion:** Team↔Project↔Org promotion strategy: store in nexus-plugin-marketplace by preference; create new repo only if marketplace is unavailable. Nexus marketplace is preregistered.

7. **Backlog source:** MVP phase uses GitHub Issues + Azure DevOps work items. Jira integration deferred to v2+.

8. **Phasing:** MVP-first approach; features staged incrementally.

### Verification

PRD document written and committed to `docs/prd/squad-management.md` (Morpheus); epics #212–#215 created with 55 linked sub-issues (SQD-001..055) (Oracle); marketplace research completed (Link).

### Follow-up

Next phase: implementation planning and prototype development.
