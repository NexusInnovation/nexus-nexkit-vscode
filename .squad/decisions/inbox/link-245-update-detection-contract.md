# Decision: Squad update detection contract (SQD-030 / #245)

Date: 2026-09-28

## Summary

Implemented update detection as a reusable service/contract layer, not as upgrade execution.

## Details

- Added `SquadUpdateService` under `src/features/squad/services/`.
- Added serializable update models in `src/features/squad/models/squadUpdates.ts`.
- `checkUpdates()` fetches latest Squad package version from npm, enriches detection freshness, and returns CLI/project update candidates.
- CLI update candidate maps to `upgrade-self`, requires confirmation, and does not require a workspace backup.
- Project update candidate maps to `upgrade`, requires confirmation, and requires a backup.
- `0.0.0-source` project versions remain non-comparable/unknown.
- Host/webview message contract: `checkSquadUpdates` -> `squadUpdatesUpdate`.
- Follow-up SQD-031/SQD-032 should consume this contract and perform confirmation/backup/execution there.
