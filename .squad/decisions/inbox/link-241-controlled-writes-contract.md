# Link Decision Inbox — SQD-026 controlled writes contract

## Context

SQD-026 (#241, PR #305) added direct editing for Squad charters and prepared governance-document writes for later UI work.

## Decision

- Keep write operations in `src/features/squad/services/squadFileWriteService.ts`, separate from read-only `SquadFileService`.
- Public write entry points are `saveCharter`, `saveMarkdownDoc`, and the reusable `saveControlledFile` allowlist contract.
- Every controlled write invokes `GitHubTemplateBackupService.backupSquadArtifacts()` before writing; backup failure returns `backup-failed` and aborts without writing.
- The host handles `saveSquadCharter` and `saveSquadDoc` by emitting explicit success messages (`squadCharterSaved`, `squadDocSaved`) or `squadError`; there is no success-shaped fallback.
- Webview success summaries intentionally expose only relative path, created flag, backup-created boolean, and byte count; absolute backup paths remain host-side.

## Follow-up guidance

#242 (decisions/routing edit) and #243 (model-config edit) should add new allowlisted targets to this service instead of creating parallel write paths.
