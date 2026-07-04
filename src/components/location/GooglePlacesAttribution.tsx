import { cn } from "@/lib/utils";

export function GooglePlacesAttribution({ className }: { className?: string }) {
  return (
    <div
      aria-label="Powered by Google"
      className={cn(
        "flex items-center justify-end gap-1 border-t border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span>Powered by</span>
      <span className="font-semibold text-foreground">Google</span>
    </div>
  );
}
