import type { ElementType, ReactNode } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  Calendar,
  Layers,
  Square,
  Thermometer,
  Zap,
} from "lucide-react";
import { CONDITION_OPTIONS, HEATING_TYPES } from "@/lib/filterConfig";
import type { ListingWithJoins } from "@/hooks/useListings";

export interface HeroSpecItem {
  key: string;
  label: string;
  value: ReactNode;
  icon: ElementType;
  emphasis?: boolean;
}

const hasVisibleValue = (value: ReactNode) =>
  value !== null && value !== undefined && value !== "";

const formatNumber = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const formatAreaSpec = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${formatNumber(Number(value))} m2`;
};

export const formatFloorSpec = (
  floor: number | null | undefined,
  totalFloors?: number | null,
) => {
  if (floor === null || floor === undefined) return null;
  const base = floor === -1 ? "Basement" : floor === 0 ? "Ground" : String(floor);
  return totalFloors ? `${base} / ${totalFloors}` : base;
};

const getHeatingLabel = (value: string | null | undefined) => {
  if (!value) return null;
  return HEATING_TYPES.find((h) => h.value === value)?.label ?? value.replace(/_/g, " ");
};

const getConditionLabel = (value: string | null | undefined) => {
  if (!value) return null;
  return CONDITION_OPTIONS.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
};

export const buildListingHeroSpecs = (
  db: Partial<ListingWithJoins>,
): HeroSpecItem[] => {
  const floorValue = formatFloorSpec(db.floor, db.total_floors);
  const auctionFloorValue = db.listing_type === "auction"
    ? floorValue ?? "Not provided"
    : floorValue;
  const specs: HeroSpecItem[] = [
    { key: "surface", label: "Surface", value: formatAreaSpec(db.sqm), icon: Square, emphasis: true },
    { key: "bedrooms", label: "Beds", value: db.bedrooms, icon: BedDouble },
    { key: "bathrooms", label: "Baths", value: db.bathrooms, icon: Bath },
    { key: "floor", label: "Floor", value: auctionFloorValue, icon: Layers },
    { key: "built", label: "Built", value: db.year_built, icon: Calendar },
  ].filter((item) => hasVisibleValue(item.value));

  if (db.energy_class && db.energy_class !== "Exempt") {
    specs.push({ key: "energy", label: "Energy", value: db.energy_class, icon: Zap, emphasis: true });
  }

  if (specs.length < 6) {
    const heating = getHeatingLabel(db.heating_system);
    if (heating) specs.push({ key: "heating", label: "Heating", value: heating, icon: Thermometer });
  }

  if (specs.length < 6) {
    const condition = getConditionLabel(db.construction_status);
    if (condition) specs.push({ key: "condition", label: "Condition", value: condition, icon: Building2 });
  }

  return specs;
};

export function PropertyHeroSpecsBar({
  items,
  className = "",
}: {
  items: HeroSpecItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => hasVisibleValue(item.value));
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
