/**
 * Formats a duration in milliseconds the way Azure DevOps does: "8m 28s", "47m 52s", "1h 2m", "26s".
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Duration between two ISO timestamps; falls back to `nowMs` when the run has not finished.
 * Returns undefined when the run has not started.
 */
export function durationBetween(start: string | undefined, finish: string | undefined, nowMs: number): string | undefined {
  if (!start) {
    return undefined;
  }
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) {
    return undefined;
  }
  const endMs = finish ? Date.parse(finish) : nowMs;
  return formatDuration((Number.isNaN(endMs) ? nowMs : endMs) - startMs);
}

/**
 * Short relative time such as "8m ago", "3h ago", "Yesterday" or a locale date for older values.
 */
export function formatRelativeTime(iso: string | undefined, nowMs: number): string {
  if (!iso) {
    return "";
  }
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (diffSeconds < 60) {
    return "just now";
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "Yesterday";
  }
  return new Date(timestamp).toLocaleDateString();
}
