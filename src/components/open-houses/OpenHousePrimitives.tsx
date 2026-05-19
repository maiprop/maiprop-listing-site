/* eslint-disable react-refresh/only-export-components */
import { cn } from "@/lib/utils";
import { PropertyCard } from "@/components/PropertyCard";

export { fmtDate, fmtTime } from "@/lib/format";

export function Pill({
  active, children, onClick,
}: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RangeInput({
  label, minVal, maxVal, onMinChange, onMaxChange, prefix,
}: {
  label: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  prefix?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          aria-label={`${label} minimum${prefix ? ` (${prefix})` : ""}`}
          placeholder={`Min${prefix ? " " + prefix : ""}`}
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="number"
          aria-label={`${label} maximum${prefix ? ` (${prefix})` : ""}`}
          placeholder={`Max${prefix ? " " + prefix : ""}`}
          value={maxVal}
          onChange={(e) => onMaxChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OpenHouseCard({ card }: { listing: any; card: any }) {
  return <PropertyCard property={card} testId="open-house-card" />;
}
