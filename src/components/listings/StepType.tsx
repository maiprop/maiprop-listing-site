import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PROPERTY_TYPES as PROP_TYPES, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { FieldLabel } from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";
import { tFallback } from "@/lib/i18nFallback";

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  toggle: (key: string) => void;
}

export function StepType({ form, set, toggle }: Props) {
  const { t } = useTranslation();
  const { listing_type: lt, property_type: pt } = form;
  const isOpenHouse = lt === "open_house";
  const openHouseTransactionType = form.open_house_transaction_type === "rent" ? "rent" : "sale";
  const selectedListingIntent = isOpenHouse ? openHouseTransactionType : lt;
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const propertyTypeLabel = (value: string, fallback: string) => tr(`createListing.propertyTypes.${value}.label`, fallback);
  const propertyTypeDescription = (value: string, fallback: string) => tr(`createListing.propertyTypes.${value}.description`, fallback);
  const subtypeLabel = (value: string, fallback: string) => tr(`createListing.subtypes.${value}.label`, fallback);
  const subtypeDescription = (value: string, fallback: string) => tr(`createListing.subtypes.${value}.description`, fallback);
  const setListingIntent = (value: "sale" | "rent") => {
    if (isOpenHouse) set("open_house_transaction_type", value);
    else set("listing_type", value);
  };
  const toggleOpenHouse = () => {
    if (isOpenHouse) {
      set("listing_type", openHouseTransactionType);
      return;
    }
    set("open_house_transaction_type", lt === "rent" ? "rent" : "sale");
    set("listing_type", "open_house");
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-semibold">{tr("createListing.type.heading", "What are you listing?")}</h2>

      {/* Listing type */}
      <div>
        <FieldLabel>{tr("createListing.type.listingType", "Listing Type")}</FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          {([
            { v: "sale", label: tr("createListing.type.sale", "For Sale"), desc: tr("createListing.type.saleDesc", "Sell your property") },
            { v: "rent", label: tr("createListing.type.rent", "For Rent"), desc: tr("createListing.type.rentDesc", "Monthly or long-term") },
          ] as const).map(({ v, label, desc }) => (
            <button key={v} onClick={() => setListingIntent(v)}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedListingIntent === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-[11px] mt-0.5 opacity-70">{desc}</div>
            </button>
          ))}
        </div>
        <label className={`mt-3 flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
          isOpenHouse ? "border-primary/40 bg-primary/10" : "border-border bg-secondary hover:border-primary/40"
        }`}>
          <input
            type="checkbox"
            checked={isOpenHouse}
            onChange={toggleOpenHouse}
            className="mt-0.5 rounded border-border"
          />
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${isOpenHouse ? "text-primary" : "text-foreground"}`}>
              {tr("createListing.type.openHouseViewing", "Open house viewing")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {selectedListingIntent === "rent"
                ? tr("createListing.type.openHouseRentDesc", "Schedule a public viewing for this rental listing.")
                : tr("createListing.type.openHouseSaleDesc", "Schedule a public viewing for this sale listing.")}
            </span>
          </span>
        </label>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_off_market} onChange={() => toggle("is_off_market")} className="rounded border-border" />
        <span className="text-sm font-medium">{tr("createListing.type.offMarket", "Off-market")}</span>
        <span className="text-xs text-muted-foreground">{tr("createListing.type.offMarketDesc", "Exclusive - not publicly advertised")}</span>
      </label>

      {/* Property type cards */}
      <div>
        <FieldLabel>{tr("createListing.type.propertyType", "Property Type")}</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PROP_TYPES.map(typeConfig => (
            <button key={typeConfig.value} onClick={() => { set("property_type", typeConfig.value); set("commercial_subtype", ""); }}
              className={`p-4 rounded-xl border text-left transition-all group ${
                pt === typeConfig.value ? "border-primary bg-primary/10" : "border-border bg-secondary hover:border-primary/50"
              }`}>
              <div className="text-xl mb-2">{typeConfig.emoji}</div>
              <div className={`text-sm font-semibold mb-0.5 ${pt === typeConfig.value ? "text-primary" : "text-foreground"}`}>
                {propertyTypeLabel(typeConfig.value, typeConfig.label)}
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">{propertyTypeDescription(typeConfig.value, typeConfig.description)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Subtype */}
      {pt && PROPERTY_TYPE_MAP[pt as PropertyTypeKey] && (
        <div>
          <FieldLabel>
            {propertyTypeLabel(pt, PROPERTY_TYPE_MAP[pt as PropertyTypeKey].label)} {tr("createListing.type.subtype", "Subtype")}
            <span className="ml-1 text-muted-foreground font-normal">{tr("createListing.type.optional", "(optional)")}</span>
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPE_MAP[pt as PropertyTypeKey].subtypes.map(sub => (
              <button key={sub.value} type="button" title={subtypeDescription(sub.value, sub.description)}
                onClick={() => set("commercial_subtype", form.commercial_subtype === sub.value ? "" : sub.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  form.commercial_subtype === sub.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}>
                {subtypeLabel(sub.value, sub.label)}
              </button>
            ))}
          </div>
          {form.commercial_subtype && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              {(() => {
                const subtype = PROPERTY_TYPE_MAP[pt as PropertyTypeKey].subtypes.find(s => s.value === form.commercial_subtype);
                return subtype ? subtypeDescription(subtype.value, subtype.description) : null;
              })()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
