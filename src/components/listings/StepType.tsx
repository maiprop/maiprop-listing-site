import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PROPERTY_TYPES as PROP_TYPES, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { FieldLabel, FormSelect as Select, FormInput as Input } from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";
import { tFallback } from "@/lib/i18nFallback";

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  toggle: (key: string) => void;
  showPreSaleOption: boolean;
}

export function StepType({ form, set, toggle, showPreSaleOption }: Props) {
  const { t } = useTranslation();
  const { listing_type: lt, property_type: pt } = form;
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const propertyTypeLabel = (value: string, fallback: string) => tr(`createListing.propertyTypes.${value}.label`, fallback);
  const propertyTypeDescription = (value: string, fallback: string) => tr(`createListing.propertyTypes.${value}.description`, fallback);
  const subtypeLabel = (value: string, fallback: string) => tr(`createListing.subtypes.${value}.label`, fallback);
  const subtypeDescription = (value: string, fallback: string) => tr(`createListing.subtypes.${value}.description`, fallback);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-semibold">{tr("createListing.type.heading", "What are you listing?")}</h2>

      {/* Listing type */}
      <div>
        <FieldLabel>{tr("createListing.type.listingType", "Listing Type")}</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {([
            { v: "sale", label: tr("createListing.type.sale", "For Sale"), desc: tr("createListing.type.saleDesc", "Sell your property") },
            { v: "rent", label: tr("createListing.type.rent", "For Rent"), desc: tr("createListing.type.rentDesc", "Monthly or long-term") },
            { v: "open_house", label: tr("createListing.type.openHouse", "Open House"), desc: tr("createListing.type.openHouseDesc", "Public viewing event") },
          ] as const).map(({ v, label, desc }) => (
            <button key={v} onClick={() => set("listing_type", v)}
              className={`p-4 rounded-xl border text-left transition-all ${
                lt === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-[11px] mt-0.5 opacity-70">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Pre-sale / Off-market flags */}
      {showPreSaleOption && (lt === "sale" || !lt) && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_pre_sale} onChange={() => toggle("is_pre_sale")} className="rounded border-border" />
            <span className="text-sm font-medium">{tr("createListing.type.preSale", "Pre-sale / Off-plan")}</span>
            <span className="text-xs text-muted-foreground">{tr("createListing.type.preSaleDesc", "New development before completion")}</span>
          </label>

          {form.is_pre_sale && (
            <div className="ml-6 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">{tr("createListing.type.newBuildDetails", "New Build Details")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>{tr("createListing.type.constructionPhase", "Construction Phase")}</FieldLabel>
                  <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                    <option value="">{tr("createListing.type.selectPhase", "Select phase...")}</option>
                    <option value="planning">{tr("createListing.type.phases.planning", "Planning / Permits")}</option>
                    <option value="foundation">{tr("createListing.type.phases.foundation", "Foundation stage")}</option>
                    <option value="under_construction">{tr("createListing.type.phases.underConstruction", "Under construction")}</option>
                    <option value="topping_out">{tr("createListing.type.phases.toppingOut", "Topping out (structure done)")}</option>
                    <option value="shell_complete">{tr("createListing.type.phases.shellComplete", "Shell complete (fitting out)")}</option>
                    <option value="new">{tr("createListing.type.phases.completedNew", "Completed / New")}</option>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tr("createListing.type.progressHint", "Shown on the project page with a progress indicator")}</p>
                </div>
                <div>
                  <FieldLabel>{tr("createListing.type.deliveryYear", "Estimated Delivery Year")}</FieldLabel>
                  <Input
                    type="number"
                    placeholder={String(new Date().getFullYear() + 1)}
                    value={form.year_built}
                    onChange={e => set("year_built", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tr("createListing.type.expectedCompletionHint", "Shown as \"Expected completion\"")}</p>
                </div>
              </div>
              <div className="rounded-lg bg-background/60 border border-border px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>{tr("createListing.type.newBuildNoticeBefore", "Your listing will appear in the")} <strong className="text-foreground">{tr("createListing.type.newBuilds", "New Builds")}</strong> {tr("createListing.type.newBuildNoticeAfter", "section with a dedicated project showcase page.")}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
