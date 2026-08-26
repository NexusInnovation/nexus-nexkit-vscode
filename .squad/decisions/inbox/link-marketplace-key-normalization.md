### 2026-08-26: Marketplace identifier normalized, legacy suffix deduped
**By:** Link
**What:** `OFFICIAL_PLUGIN_MARKETPLACE` in `recommendedSettingsConfigDeployer.ts` changed from `NexusInnovation/nexus-plugin-marketplace#main` to the bare `NexusInnovation/nexus-plugin-marketplace`. The `chat.plugins.marketplaces` ensure-first logic now normalizes on a `#ref`-stripped key, so any existing `#main`-suffixed entry is recognized as the same marketplace, deduped against the bare key, and rewritten to the bare key (first in the list). The "skip write if unchanged" optimization still applies.
**Why:** The `#main` suffix was unnecessary and caused a mismatch between the constant and a bare-key entry a user might already have, risking duplicate marketplace entries.
