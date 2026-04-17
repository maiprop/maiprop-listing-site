/** Animated skeleton placeholder shown while property listings are loading. */
export function PropertyCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" aria-hidden="true">
      {/* Image */}
      <div className="w-full aspect-[4/3] sm:aspect-[3/2] bg-muted animate-pulse" />
      <div className="p-4 space-y-3">
        {/* Price */}
        <div className="h-5 w-28 bg-muted animate-pulse rounded-xl" />
        {/* Title */}
        <div className="space-y-1.5">
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
        </div>
        {/* Spec chips */}
        <div className="flex gap-2 flex-wrap">
          <div className="h-6 w-14 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-16 bg-muted animate-pulse rounded-lg" />
        </div>
        {/* Footer */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <div className="w-6 h-6 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          <div className="ml-auto h-8 w-28 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    </div>
  );
}
