/** Animated skeleton placeholder shown while property listings are loading. */
export function PropertyCardSkeleton() {
  return (
    <div className="grid h-[360px] grid-rows-[150px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card" aria-hidden="true">
      <div className="h-[150px] w-full animate-pulse bg-muted" />
      <div className="grid min-h-0 grid-rows-[4.25rem_1.625rem_minmax(0,1fr)_2.75rem] gap-2 p-3">
        <div className="min-h-0 space-y-2 overflow-hidden">
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
          <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="flex h-[1.625rem] gap-1.5 overflow-hidden">
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
        </div>
        <div />
        <div className="flex min-h-[2.75rem] max-h-[2.75rem] items-center justify-between gap-2 border-t border-border/50 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-muted animate-pulse rounded-xl" />
            <div className="h-8 w-8 bg-muted animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
