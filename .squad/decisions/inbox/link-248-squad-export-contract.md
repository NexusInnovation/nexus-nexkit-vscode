# Link decision inbox — SQD-033 Squad export contract

Date: 2026-09-28
Issue: #248
PR: #303

## Decision

Squad export uses a reusable transfer contract in `src/features/squad/models/squadTransfer.ts`:

- `SquadTransferTargetKind.File` with serialisable `file:` URI strings.
- `SquadTransferTargetKind.GitHub` with `owner/repo`, optional `ref`, optional `path`.
- `SquadExportRequest` and `SquadExportOutcome` cross the webview boundary through `exportSquad` and `squadExportResult`.

The host service (`SquadExportService`) owns file-picker prompting and all CLI execution through the allowlisted `SquadCliService`; errors stay as `SquadResult` failures and route to visible `squadError`.

## Follow-up guidance

SQD-034 import should reuse the same transfer target shape for import sources, then add preview/backup/confirmation semantics on top rather than inventing a separate file/GitHub addressing model.
