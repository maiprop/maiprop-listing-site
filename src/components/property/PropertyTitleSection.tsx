import {
  MapPin, Bed, Bath, Square, Calendar,
  Zap, Thermometer, Building2, Tag, Layers, LayoutGrid,
} from "lucide-react";
import { getSubtypeLabel } from "@/lib/propertyTypes";
import { HEATING_TYPES, CONDITION_OPTIONS } from "@/lib/filterConfig";
import { ENERGY_COLORS } from "@/types";
import type { ListingWithJoins } from "@/hooks/useListings";

interface Props {
  db: ListingWithJoins;
  isAuction: boolean;
  ownershipDisplay: { label: string; cls: string } | null;
  ownershipPct: number | null;
  ownershipStatus: string | null;
}

export function PropertyTitleSection({ db, isAuction, ownershipDisplay, ownershipPct, ownershipStatus }: Props) {
  const title = db.title;
  const city = db.city;
  const address = db.address ?? city;
  const price = Number(db.price);
  const sqm = Number(db.sqm);
  const bedrooms = db.bedrooms;
  const bathrooms = db.bathrooms;
  const listingType = db.listing_type;
  const propertyType = db.property_type;
  const subtype = db.commercial_subtype;
  const energyClass = db.energy_class;
  const pricePerSqm = db.price_per_sqm;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border capitalize">
              {propertyType}
            </span>
            {subtype && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/30 capitalize flex items-center gap-1">
                <LayoutGrid className="w-2.5 h-2.5" />
                {getSubtypeLabel(propertyType, subtype)}
              </span>
            )}
            {listingType && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 capitalize">
                For {listingType}
              </span>
            )}
            {energyClass && energyClass !== "Exempt" && energyClass in ENERGY_COLORS && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ENERGY_COLORS[energyClass as import("@/types").EnergyClass] || "bg-secondary"}`}>
                <Zap className="w-2.5 h-2.5 inline mr-0.5" />{energyClass}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight line-clamp-3 sm:line-clamp-none pr-2">
            {title}
          </h1>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>
              {address && address !== city ? `${address}, ${city}` : city}
              {db.region ? ` · ${db.region}` : ""}
            </span>
            {isAuction && !!pricePerSqm && (
              <span className="ml-2 text-xs font-semibold text-muted-foreground border-l border-border pl-2">
                €{Number(pricePerSqm).toLocaleString()}/m²
              </span>
            )}
          </div>
        </div>

        {!isAuction && (
          <div className="text-right shrink-0">
            <div className="font-display text-3xl font-black text-foreground">
              €{price.toLocaleString()}
              {listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
            </div>
            {!!pricePerSqm && (
              <div className="text-xs text-muted-foreground mt-0.5">
                €{Number(pricePerSqm).toLocaleString()} per m²
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key stats bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {bedrooms != null && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Bed className="w-3.5 h-3.5 text-primary" />{bedrooms} bed
          </div>
        )}
        {bathrooms != null && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Bath className="w-3.5 h-3.5 text-primary" />{bathrooms} bath
          </div>
        )}
        {db?.wc_count != null && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Building2 className="w-3.5 h-3.5 text-primary" />{db.wc_count} WC
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
          <Square className="w-3.5 h-3.5 text-primary" />{sqm} m²
        </div>
        {db.floor != null && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Layers className="w-3.5 h-3.5 text-primary" />
            {db.floor === -1 ? "Basement" : db.floor === 0 ? "Ground floor" : `${db.floor}${["st", "nd", "rd"][db.floor - 1] || "th"} floor`}
            {db.total_floors ? ` / ${db.total_floors}` : ""}
          </div>
        )}
        {db.year_built != null && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Calendar className="w-3.5 h-3.5 text-primary" />Construction year {db.year_built}
          </div>
        )}
        {db?.heating_system && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Thermometer className="w-3.5 h-3.5 text-primary" />
            {HEATING_TYPES.find((h) => h.value === db.heating_system)?.label ?? db.heating_system.replace(/_/g, " ")}
          </div>
        )}
        {db?.construction_status && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            {CONDITION_OPTIONS.find((c) => c.value === db.construction_status)?.label ?? db.construction_status.replace(/_/g, " ")}
          </div>
        )}
        {ownershipDisplay && (
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${ownershipDisplay.cls}`}>
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            {ownershipDisplay.label}
          </div>
        )}
        {ownershipPct != null && ownershipStatus !== "full" && (
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
            <Tag className="w-3.5 h-3.5 text-primary" />{ownershipPct}%
          </div>
        )}
      </div>

      {/* Rent extras */}
      {listingType === "rent" && (
        <div className="flex flex-wrap gap-2">
          {db?.deposit_months && (
            <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
              🔐 {db.deposit_months}mo deposit
            </span>
          )}
          {db?.monthly_expenses && (
            <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
              💡 €{db.monthly_expenses}/mo expenses
            </span>
          )}
          {db?.pets_allowed && (
            <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">🐾 Pets OK</span>
          )}
          {db?.agent_fee_included && (
            <span className="px-2.5 py-1 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-xs font-medium text-brand-emerald">✓ No Agent Fee</span>
          )}
          {db?.short_term_rental && (
            <span className="px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-xs font-medium text-brand-gold">📅 Short-term OK</span>
          )}
        </div>
      )}
    </div>
  );
}
