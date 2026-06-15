/** Animated skeleton placeholder shown while property listings are loading. */
export function PropertyCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden h-full min-h-[34rem]" aria-hidden="true">
      {/* Image */}
      <div className="w-full aspect-[4/3] sm:aspect-[3/2] bg-muted animate-pulse" />
      <div className="p-4 flex min-h-[19rem] flex-col gap-3">
        {/* Price */}
        <div className="h-5 w-28 bg-muted animate-pulse rounded-xl" />
        {/* Title */}
        <div className="min-h-[5.25rem] space-y-1.5">
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
        </div>
        {/* Spec chips */}
        <div className="flex min-h-[4.75rem] max-h-[4.75rem] gap-2 overflow-hidden flex-wrap">
          <div className="h-6 w-14 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-16 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="min-h-[3.25rem]" />
        <div className="min-h-[1.75rem] max-h-[1.75rem]" />
        {/* Footer */}
        <div className="mt-auto flex min-h-[5.75rem] flex-col justify-between gap-2.5 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          </div>
          <div className="ml-auto h-9 w-20 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    </div>
  );
}
