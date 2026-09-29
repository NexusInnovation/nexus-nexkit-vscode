# Decision — Governance-doc saves use content-hash optimistic concurrency (SQD-027)

**Date:** 2026-09-28
**Agent:** Link
**PR:** #306 (merged into `feature/squad-support`), closes #242

## Decision
- `SquadMarkdownDoc` carries optional `contentHash` (SHA-256 hex of full on-disk bytes; `null` when absent) and `truncated`.
- `saveSquadDoc` accepts optional `baseContentHash`. `SquadFileWriteService.saveMarkdownDoc` rejects mismatches with the new `write-conflict` error code **before** backup/write (string = must match, `null` = must still be absent, omitted = force overwrite).
- Docs (on disk or new content) larger than `SQUAD_MAX_READ_BYTES` (256 KB) are not writable from the panel — remediation points to the VS Code editor.
- Existing CRLF line endings are preserved on save.

## Why
decisions.md/routing.md are appended concurrently by Squad agents (Scribe); a panel save from a stale or truncated view would silently drop their content.

## For Ghost (#244)
Capture `doc.contentHash` when editing starts and pass it to `saveDoc(kind, content, hash)`; disable editing when `doc.truncated`; on `write-conflict`, keep the draft and offer refresh.