# Link decision — SQD-035 upstream.json display

**Date:** 2026-09-28  
**Issue:** NexusInnovation/nexus-nexkit-vscode#250  
**PR:** NexusInnovation/nexus-nexkit-vscode#301  
**Classification:** Project-specific — Squad upstream read/display

## Decision

NexKit reads `.squad/upstream.json` through `SquadFileService.readUpstreams()` and displays upstream ids, source types, references and last sync timestamps in a dedicated read-only Squad panel section. The status header keeps only the upstream count.

## Error handling

Missing `.squad/upstream.json` is a valid empty upstream list because upstream inheritance is optional. If the manifest exists, invalid JSON, unsupported root shapes, non-object entries, missing id/reference fields, or unsupported source kinds return a structured `parse-failed` `SquadError`; the host forwards that error with `squadError` so the UI never treats a bad manifest as an empty success.

## Follow-up compatibility

SQD-036/SQD-037 actions can build on the same normalized `SquadUpstreamSource[]` contract and should preserve this distinction between absent optional config and present-but-invalid config.
