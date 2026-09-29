import { createHash } from "crypto";

/**
 * SHA-256 hex digest of raw Squad file bytes. Used as the version token that
 * the panel echoes back on save so stale edits cannot silently overwrite
 * changes made on disk (SQD-027, FR-024).
 */
export function computeSquadContentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
