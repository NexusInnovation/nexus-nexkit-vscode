### 2026-07-24: Repository Sync Lot 3 conflict-action model and diagnostics
**By:** Eric De Carufel (via Copilot/Link)
**What:** Standardized conflict-risk outcomes to include explicit action metadata by conflict group (`workspace-conflict` vs `external-conflict`) and implemented host-side action execution paths (SCM open, external repo open in new window, retry-specific, retry-failed-only), with a dedicated repository sync output channel and run-end guidance block including command IDs.
**Why:** Keeps sync behavior non-destructive and silent-success by default while making conflict intervention deterministic, discoverable, and actionable for users.
