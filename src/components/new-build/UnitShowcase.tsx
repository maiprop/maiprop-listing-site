import {
  Bath,
  BedDouble,
  CheckCircle2,
  Euro,
  Layers,
  Maximize2,
  Receipt,
  SquareStack,
} from "lucide-react";
import type { ElementType } from "react";
import { formatNewBuildPrice } from "@/lib/newBuildConfig";

type ProjectUnit = {
  id: string;
  unit_id?: string | null;
  unit_number?: string | null;
  floor?: number | null;
  availability_status?: string | null;
  internal_sqm?: number | null;
  balcony_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price?: number | null;
  price_per_sqm?: number | null;
  vat_included?: boolean | null;
  energy_class?: string | null;
};

const activeStatuses = new Set(["available", "reserved", "under_offer"]);

const statusCopy: Record<string, { label: string; className: string }> = {
  available: {
    label: "Available",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  },
  reserved: {
    label: "Reserved",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/25",
  },
  under_offer: {
    label: "Under offer",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/25",
  },
  sold: {
    label: "Sold",
    className: "bg-muted text-muted-foreground border-border",
  },
};

const formatStatus = (status: string | null | undefined) => {
  const key = status ?? "available";
  return statusCopy[key] ?? {
    label: key.replace(/_/g, " "),
    className: "bg-secondary text-muted-foreground border-border",
  };
};

const getStartingPrice = (listing: Record<string, unknown>, units: ProjectUnit[]) => {
  const unitPrices = units
    .map((unit) => Number(unit.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (unitPrices.length > 0) return Math.min(...unitPrices);
  return Number(listing.price);
};

const formatOptionalPrice = (value: number | null | undefined) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? formatNewBuildPrice(price) : "On request";
};

const getUnitPricePerSqm = (unit: ProjectUnit): number | null => {
  const stored = Number(unit.price_per_sqm);
  const price = Number(unit.price);
  const sqm = Number(unit.internal_sqm);
  const computed = Number.isFinite(price) && price > 0 && Number.isFinite(sqm) && sqm > 0
    ? price / sqm
    : null;

  if (!computed) return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : null;
  if (!Number.isFinite(stored) || stored <= 0) return Math.round(computed);

  const ratio = stored / computed;
  return Math.round(ratio < 0.5 || ratio > 1.5 ? computed : stored);
};

const formatUnitName = (unit: ProjectUnit) => {
  const raw = unit.unit_number ?? unit.unit_id;
  return raw ? `Unit ${raw}` : "Unit";
};

const unitSpecs = (unit: ProjectUnit) => [
  unit.internal_sqm != null && {
    icon: Maximize2,
    label: "Internal",
    value: `${unit.internal_sqm} m²`,
  },
  unit.balcony_sqm != null && {
    icon: SquareStack,
    label: "Balcony",
    value: `${unit.balcony_sqm} m²`,
  },
  unit.floor != null && {
    icon: Layers,
    label: "Floor",
    value: String(unit.floor),
  },
  (unit.bedrooms != null || unit.bathrooms != null) && {
    icon: BedDouble,
    label: "Layout",
    value: [unit.bedrooms != null ? `${unit.bedrooms} bed` : null, unit.bathrooms != null ? `${unit.bathrooms} bath` : null]
      .filter(Boolean)
      .join(" · "),
  },
  unit.energy_class && {
    icon: CheckCircle2,
    label: "Energy",
    value: unit.energy_class,
  },
  unit.vat_included != null && {
    icon: Receipt,
    label: "VAT",
    value: unit.vat_included ? "Included" : "Not included",
  },
].filter(Boolean) as Array<{ icon: ElementType; label: string; value: string }>;

export function UnitShowcase({
  listing,
  units = [],
  onContact,
}: {
  listing: Record<string, unknown>;
  units?: ProjectUnit[];
  onContact: () => void;
}) {
  const visibleUnits = units.filter((unit) => activeStatuses.has(unit.availability_status ?? "available"));
  const displayUnits = visibleUnits.length > 0 ? visibleUnits : units;
  const sqm = listing.sqm != null ? Number(listing.sqm) : null;
  const beds = listing.bedrooms != null ? Number(listing.bedrooms) : null;
  const baths = listing.bathrooms != null ? Number(listing.bathrooms) : null;
  const floors = listing.total_floors != null ? Number(listing.total_floors) : null;
  const startingPrice = getStartingPrice(listing, displayUnits);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <SquareStack className="h-4 w-4 text-primary" />
            Units & Availability
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {displayUnits.length > 0
              ? `${displayUnits.length} active unit${displayUnits.length === 1 ? "" : "s"} in the project schedule`
              : "Project-level guide. Ask the developer for the current unit schedule."}
          </p>
        </div>
        <button
          onClick={onContact}
          className="min-h-[40px] shrink-0 rounded-lg border border-primary/30 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          Request schedule
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Starting price</p>
              <p className="mt-1 font-display text-2xl font-black text-primary">{formatOptionalPrice(startingPrice)}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-base font-bold">{displayUnits.length || "—"}</p>
                <p className="text-[10px] text-muted-foreground">Units</p>
              </div>
              <div>
                <p className="text-base font-bold">{sqm != null ? `${sqm}` : "—"}</p>
                <p className="text-[10px] text-muted-foreground">m² from</p>
              </div>
              <div>
                <p className="text-base font-bold">{beds != null ? beds : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Beds from</p>
              </div>
            </div>
          </div>
        </div>

        {displayUnits.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {displayUnits.slice(0, 6).map((rawUnit) => {
              const unit = { ...rawUnit, price_per_sqm: getUnitPricePerSqm(rawUnit) };
              const status = formatStatus(unit.availability_status);
              const specs = unitSpecs(unit);
              const unitPricePerSqm = getUnitPricePerSqm(unit);
              return (
                <article key={unit.id} className="rounded-xl border border-border bg-background/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold">{formatUnitName(unit)}</h3>
                      <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-black text-primary">{formatOptionalPrice(unit.price)}</p>
                      {unitPricePerSqm != null && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatNewBuildPrice(unitPricePerSqm)}/m²</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {specs.map(({ icon: Icon, label, value }) => (
                      <div key={`${unit.id}-${label}`} className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                          {label}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sqm != null && (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-center">
                <Maximize2 className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-base font-bold">{sqm} m²</p>
                <p className="text-[10px] text-muted-foreground">From</p>
              </div>
            )}
            {beds != null && (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-center">
                <BedDouble className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-base font-bold">{beds}</p>
                <p className="text-[10px] text-muted-foreground">Bedrooms</p>
              </div>
            )}
            {baths != null && (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-center">
                <Bath className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-base font-bold">{baths}</p>
                <p className="text-[10px] text-muted-foreground">Bathrooms</p>
              </div>
            )}
            {floors != null && (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-center">
                <Layers className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-base font-bold">{floors}</p>
                <p className="text-[10px] text-muted-foreground">Floors</p>
              </div>
            )}
          </div>
        )}

        {displayUnits.length > 6 && (
          <p className="text-xs text-muted-foreground">+{displayUnits.length - 6} more units available on request</p>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3">
          <Euro className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Prices, VAT treatment, and availability can change by unit. Request the current schedule before making a decision.
          </p>
          <button onClick={onContact} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Ask developer
          </button>
        </div>
      </div>
    </section>
  );
}
