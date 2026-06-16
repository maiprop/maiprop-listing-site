/** Animated skeleton placeholder shown while property listings are loading. */
export function PropertyCardSkeleton() {
  return (
    <div className="grid h-[332px] grid-rows-[132px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card" aria-hidden="true">
      <div className="h-[132px] w-full animate-pulse bg-muted" />
      <div className="grid min-h-0 grid-rows-[3.5rem_1.5rem_minmax(0,1fr)_2.5rem] gap-1.5 p-3">
        <div className="min-h-0 space-y-2 overflow-hidden">
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid h-[1.5rem] grid-cols-3 gap-1 overflow-hidden">
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
          <div className="h-6 w-14 shrink-0 bg-muted animate-pulse rounded-lg" />
        </div>
        <div />
        <div className="flex min-h-[2.5rem] max-h-[2.5rem] items-center justify-between gap-2 border-t border-border/50 pt-2">
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
