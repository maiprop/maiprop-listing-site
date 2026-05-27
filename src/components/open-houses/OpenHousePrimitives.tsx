/* eslint-disable react-refresh/only-export-components */
import { cn } from "@/lib/utils";
import { PropertyCard } from "@/components/PropertyCard";

export { fmtDate, fmtTime } from "@/lib/format";

export const OPEN_HOUSE_CARD_LAYOUT_CLASS =
  "h-full [&_.property-card]:h-full [&_.property-card]:min-h-[33rem] sm:[&_.property-card]:min-h-[34rem] lg:[&_.property-card]:min-h-[33rem]";

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
  label, minVal, maxVal, onMinChange, onMaxChange, prefix, locale = "en",
}: {
  label: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  prefix?: string;
  locale?: string;
}) {
  const isGreek = locale.toLowerCase().startsWith("el");
  const minLabel = isGreek ? "Ελάχιστο" : "Min";
  const maxLabel = isGreek ? "Μέγιστο" : "Max";
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          aria-label={`${label} ${isGreek ? "ελάχιστο" : "minimum"}${prefix ? ` (${prefix})` : ""}`}
          placeholder={`${minLabel}${prefix ? " " + prefix : ""}`}
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="number"
          aria-label={`${label} ${isGreek ? "μέγιστο" : "maximum"}${prefix ? ` (${prefix})` : ""}`}
          placeholder={`${maxLabel}${prefix ? " " + prefix : ""}`}
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
  return (
    <div className={OPEN_HOUSE_CARD_LAYOUT_CLASS}>
      <PropertyCard property={card} testId="open-house-card" />
    </div>
  );
}
