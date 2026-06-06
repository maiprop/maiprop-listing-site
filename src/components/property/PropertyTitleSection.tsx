import { LayoutGrid, MapPin, Zap } from "lucide-react";
import { getSubtypeLabel } from "@/lib/propertyTypes";
import { ENERGY_COLORS } from "@/types";
import type { ListingWithJoins } from "@/hooks/useListings";
import { PropertyHeroSpecsBar } from "@/components/property/PropertyHeroSpecsBar";
import { buildListingHeroSpecs } from "@/components/property/propertyHeroSpecs";

interface Props {
  db: ListingWithJoins;
  isAuction: boolean;
}

const getListingLabel = (listingType: string | null | undefined) => {
  if (!listingType) return null;
  if (listingType === "sale") return "For sale";
  if (listingType === "rent") return "For rent";
  if (listingType === "auction") return "For auction";
  if (listingType === "open_house") return "Open house";
  return `For ${listingType.replace(/_/g, " ")}`;
};

export function PropertyTitleSection({ db, isAuction }: Props) {
  const title = db.title;
  const city = db.city;
  const address = db.address ?? city;
  const price = Number(db.price);
  const listingType = db.listing_type;
  const propertyType = db.property_type;
  const subtype = db.commercial_subtype;
  const energyClass = db.energy_class;
  const pricePerSqm = db.price_per_sqm;
  const heroSpecs = buildListingHeroSpecs(db);
  const listingLabel = getListingLabel(listingType);

  const rentExtras = [
    db.deposit_months ? `${db.deposit_months}mo deposit` : null,
    db.monthly_expenses ? `\u20ac${db.monthly_expenses}/mo expenses` : null,
    db.pets_allowed ? "Pets OK" : null,
    db.agent_fee_included ? "No agent fee" : null,
    db.short_term_rental ? "Short-term OK" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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
            {listingLabel && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 capitalize">
                {listingLabel}
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
          <div className="flex items-start gap-1.5 mt-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="min-w-0 break-words leading-snug">
              {address && address !== city ? `${address}, ${city}` : city}
              {db.region ? ` - ${db.region}` : ""}
            </span>
            {isAuction && !!pricePerSqm && (
              <span className="ml-2 text-xs font-semibold text-muted-foreground border-l border-border pl-2">
                {"\u20ac"}{Number(pricePerSqm).toLocaleString()}/m2
              </span>
            )}
          </div>
        </div>

        {!isAuction && (
          <div className="w-full shrink-0 text-left sm:w-auto sm:text-right">
            <div className="font-display text-3xl font-black text-foreground">
              {"\u20ac"}{price.toLocaleString()}
              {listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
            </div>
            {!!pricePerSqm && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {"\u20ac"}{Number(pricePerSqm).toLocaleString()} per m2
              </div>
            )}
          </div>
        )}
      </div>

      <PropertyHeroSpecsBar items={heroSpecs} />

      {listingType === "rent" && rentExtras.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rentExtras.map((extra) => (
            <span key={extra} className="px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs font-medium">
              {extra}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
