/**
 * Skeleton placeholders displayed while panel data loads in the background.
 * Purely presentational; the shimmer animation is disabled for users who
 * prefer reduced motion (see `.skeleton` in styles.css).
 */

interface SkeletonLineProps {
  /** CSS width of the line, e.g. "60%". */
  width?: string;
  /** Visual size of the line. */
  size?: "sm" | "md" | "lg";
}

export function SkeletonLine({ width = "100%", size = "md" }: SkeletonLineProps) {
  return <div class={`skeleton skeleton-line skeleton-line-${size}`} style={{ width }} aria-hidden="true" />;
}

interface SkeletonListProps {
  /** Accessible description announced to screen readers, e.g. "Loading templates". */
  label: string;
  /** Number of placeholder rows to render. */
  rows?: number;
  /** Render a placeholder section header above the rows. */
  withHeader?: boolean;
}

const ROW_WIDTHS = ["85%", "65%", "75%", "55%", "80%", "60%"];

/**
 * A list of placeholder rows (icon + text) mimicking template/profile items.
 */
export function SkeletonList({ label, rows = 4, withHeader = false }: SkeletonListProps) {
  return (
    <div class="skeleton-list" role="status" aria-busy="true">
      {withHeader && <SkeletonLine width="40%" size="lg" />}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} class="skeleton-row" aria-hidden="true">
          <div class="skeleton skeleton-icon" />
          <SkeletonLine width={ROW_WIDTHS[index % ROW_WIDTHS.length]} />
        </div>
      ))}
      <span class="skeleton-sr-only">{label}…</span>
    </div>
  );
}
