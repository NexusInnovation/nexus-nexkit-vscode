/**
 * Pure formatting helpers for the read-only Squad views (SQD-012/013/014).
 *
 * Kept free of Preact and `vscode` imports so they are trivially unit-testable
 * and safe to import from both the webview bundle and the extension-host test
 * runner.
 */

/**
 * Format a byte count as a compact, human-readable size (e.g. `256 KB`).
 * Returns `"unknown size"` when the count is missing or not a finite number.
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return "unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

/**
 * Derive the bare file name from a workspace-root-relative POSIX/Windows path.
 * Falls back to the whole path when no separator is present.
 */
export function baseName(relativePath: string): string {
  if (!relativePath) {
    return "";
  }
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : relativePath;
}

/**
 * Build the user-facing notice shown when a log/history file was truncated to
 * the read cap (FR-025). Returns `null` when the document was not truncated.
 */
export function truncationNotice(truncated: boolean | undefined, sizeBytes: number | undefined): string | null {
  if (!truncated) {
    return null;
  }
  return `This file is large (${formatBytes(sizeBytes)}) and has been truncated for display. Open the file directly to read it in full.`;
}
