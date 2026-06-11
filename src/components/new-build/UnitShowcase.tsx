import { SquareStack, Maximize2, BedDouble, Bath, Layers } from "lucide-react";
import { formatNewBuildPrice } from "@/lib/newBuildConfig";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UnitShowcase({ listing, onContact }: { listing: any; onContact: () => void }) {
  const price = Number(listing.price);
  const sqm = listing.sqm != null ? Number(listing.sqm) : null;
  const beds = listing.bedrooms != null ? Number(listing.bedrooms) : null;
  const baths = listing.bathrooms != null ? Number(listing.bathrooms) : null;
  const floors = listing.total_floors != null ? Number(listing.total_floors) : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <SquareStack className="w-4 h-4 text-primary" /> Units & Availability
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Project specifications — contact developer for full unit schedule</p>
        </div>
        <button
          onClick={onContact}
          className="shrink-0 text-xs font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
        >
          Request units →
        </button>
      </div>

      <div className="p-5">
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Starting price</p>
              <p className="font-display text-2xl font-black text-primary">{formatNewBuildPrice(price)}</p>
              {listing.price_per_sqm != null && (
                <p className="text-xs text-muted-foreground mt-0.5">{formatNewBuildPrice(Number(listing.price_per_sqm))} / m²</p>
              )}
            </div>
            {listing.listing_type === "new_build" && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
                New build
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sqm != null && (
              <div className="rounded-lg bg-background/70 border border-border p-3 text-center">
                <Maximize2 className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="font-bold text-base">{sqm} m²</p>
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
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3">
          <SquareStack className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Additional configurations available — studios, 1–4 bed units, penthouses
          </p>
          <button onClick={onContact} className="text-xs font-semibold text-primary shrink-0 hover:underline">
            Ask developer
          </button>
        </div>
      </div>
    </div>
  );
}
