import {
  hasVisibleHeroSpecValue,
  type HeroSpecItem,
} from "@/components/property/propertyHeroSpecs";

export function PropertyHeroSpecsBar({
  items,
  className = "",
}: {
  items: HeroSpecItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => hasVisibleHeroSpecValue(item.value));
  if (!visibleItems.length) return null;

  return (
    <dl className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 ${className}`}>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const title = typeof item.value === "string" || typeof item.value === "number"
          ? String(item.value)
          : undefined;

        return (
          <div
            key={item.key}
            className={`min-w-0 rounded-lg border px-3 py-3 ${
              item.emphasis
                ? "border-primary/25 bg-primary/5"
                : "border-border bg-secondary/45"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                item.emphasis ? "bg-primary/10 text-primary" : "bg-background text-primary"
              }`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <dt className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-semibold text-foreground" title={title}>
                  {item.value}
                </dd>
              </div>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
