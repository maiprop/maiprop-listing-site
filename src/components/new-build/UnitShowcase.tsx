import { SquareStack, Maximize2, BedDouble, Bath, Layers } from "lucide-react";
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

const availableStatuses = new Set(["available", "reserved", "under_offer"]);

const formatStatus = (status: string | null | undefined) =>
  status ? status.replace(/_/g, " ") : "available";

const getStartingPrice = (listing: Record<string, unknown>, units: ProjectUnit[]) => {
  const unitPrices = units
    .map((unit) => Number(unit.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (unitPrices.length > 0) return Math.min(...unitPrices);
  return Number(listing.price);
};

export function UnitShowcase({
  listing,
  units = [],
  onContact,
}: {
  listing: Record<string, unknown>;
  units?: ProjectUnit[];
  onContact: () => void;
}) {
  const visibleUnits = units.filter((unit) => availableStatuses.has(unit.availability_status ?? "available"));
  const displayUnits = visibleUnits.length > 0 ? visibleUnits : units;
  const sqm = listing.sqm != null ? Number(listing.sqm) : null;
  const beds = listing.bedrooms != null ? Number(listing.bedrooms) : null;
  const baths = listing.bathrooms != null ? Number(listing.bathrooms) : null;
  const floors = listing.total_floors != null ? Number(listing.total_floors) : null;
  const startingPrice = getStartingPrice(listing, displayUnits);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <SquareStack className="w-4 h-4 text-primary" /> Units & Availability
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {displayUnits.length > 0
              ? `${displayUnits.length} unit${displayUnits.length === 1 ? "" : "s"} from the project inventory`
              : "Project specifications - contact developer for full unit schedule"}
          </p>
        </div>
        <button
          onClick={onContact}
          className="shrink-0 text-xs font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
        >
          Request units
        </button>
      </div>

      <div className="p-5">
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Starting price</p>
              <p className="font-display text-2xl font-black text-primary">{formatNewBuildPrice(startingPrice)}</p>
              {listing.price_per_sqm != null && displayUnits.length === 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{formatNewBuildPrice(Number(listing.price_per_sqm))} / m2</p>
              )}
            </div>
            {listing.listing_type === "new_build" && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
                New Building
              </span>
            )}
          </div>

          {displayUnits.length > 0 ? (
            <div className="space-y-2">
              {displayUnits.slice(0, 5).map((unit) => (
                <div key={unit.id} className="rounded-lg bg-background/80 border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{unit.unit_number ?? unit.unit_id ?? "Unit"}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{formatStatus(unit.availability_status)}</p>
                    </div>
                    {unit.price != null && (
                      <p className="font-display text-base font-black text-primary">{formatNewBuildPrice(Number(unit.price))}</p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {unit.internal_sqm != null && <span>{unit.internal_sqm} m2 internal</span>}
                    {unit.balcony_sqm != null && <span>{unit.balcony_sqm} m2 balcony</span>}
                    {unit.floor != null && <span>Floor {unit.floor}</span>}
                    {unit.bedrooms != null && <span>{unit.bedrooms} bed</span>}
                    {unit.bathrooms != null && <span>{unit.bathrooms} bath</span>}
                    {unit.energy_class && <span>Energy {unit.energy_class}</span>}
                    {unit.vat_included != null && <span>{unit.vat_included ? "VAT included" : "VAT not included"}</span>}
                  </div>
                </div>
              ))}
              {displayUnits.length > 5 && (
                <p className="text-xs text-muted-foreground">+{displayUnits.length - 5} more units available on request</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sqm != null && (
                <div className="rounded-lg bg-background/70 border border-border p-3 text-center">
                  <Maximize2 className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-bold text-base">{sqm} m2</p>
                  <p className="text-[10px] text-muted-foreground">From</p>
                </div>
              )}
              {beds != null && (
                <div className="rounded-lg bg-background/70 border border-border p-3 text-center">
                  <BedDouble className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-bold text-base">{beds}</p>
                  <p className="text-[10px] text-muted-foreground">Bedrooms</p>
                </div>
              )}
              {baths != null && (
                <div className="rounded-lg bg-background/70 border border-border p-3 text-center">
                  <Bath className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-bold text-base">{baths}</p>
                  <p className="text-[10px] text-muted-foreground">Bathrooms</p>
                </div>
              )}
              {floors != null && (
                <div className="rounded-lg bg-background/70 border border-border p-3 text-center">
                  <Layers className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-bold text-base">{floors}</p>
                  <p className="text-[10px] text-muted-foreground">Floors</p>
                </div>
              )}
            </div>
          )}
        </div>

        {displayUnits.length === 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3">
            <SquareStack className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground flex-1">
              Additional configurations may be available. Ask the developer for the current schedule.
            </p>
            <button onClick={onContact} className="text-xs font-semibold text-primary shrink-0 hover:underline">
              Ask developer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
