import { SkeletonLine, SkeletonList } from "../atoms/Skeleton";

/**
 * Placeholder for the whole panel (tab bar + content) shown until the extension
 * has sent the initial workspace state. Mirrors the static boot skeleton in
 * index.html so the transition from HTML to Preact is seamless.
 */
export function PanelSkeleton() {
  return (
    <div class="container panel-skeleton">
      <div class="skeleton-tab-bar" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} class="skeleton skeleton-tab" />
        ))}
      </div>
      <SkeletonLine width="100%" size="lg" />
      <SkeletonList label="Loading Nexkit" rows={6} withHeader />
    </div>
  );
}
