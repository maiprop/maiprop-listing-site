import { Info } from "lucide-react";
import { PROPERTY_TYPES as PROP_TYPES, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { FieldLabel, FormSelect as Select, FormInput as Input } from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  toggle: (key: string) => void;
  showPreSaleOption: boolean;
}

export function StepType({ form, set, toggle, showPreSaleOption }: Props) {
  const { listing_type: lt, property_type: pt } = form;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-semibold">What are you listing?</h2>

      {/* Listing type */}
      <div>
        <FieldLabel>Listing Type</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {([
            { v: "sale", label: "🏷️ For Sale", desc: "Sell your property" },
            { v: "rent", label: "🔑 For Rent", desc: "Monthly or long-term" },
            { v: "open_house", label: "🏠 Open House", desc: "Public viewing event" },
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
            <span className="text-sm font-medium">🏗️ Pre-sale / Off-plan</span>
            <span className="text-xs text-muted-foreground">New development before completion</span>
          </label>

          {form.is_pre_sale && (
            <div className="ml-6 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Build Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Construction Phase</FieldLabel>
                  <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                    <option value="">Select phase…</option>
                    <option value="planning">📋 Planning / Permits</option>
                    <option value="foundation">🏗️ Foundation stage</option>
                    <option value="under_construction">🧱 Under construction</option>
                    <option value="topping_out">🏛️ Topping out (structure done)</option>
                    <option value="shell_complete">🪟 Shell complete (fitting out)</option>
                    <option value="new">✅ Completed / New</option>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Shown on the project page with a progress indicator</p>
                </div>
                <div>
                  <FieldLabel>Estimated Delivery Year</FieldLabel>
                  <Input
                    type="number"
                    placeholder={String(new Date().getFullYear() + 1)}
                    value={form.year_built}
                    onChange={e => set("year_built", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Shown as "Expected completion"</p>
                </div>
              </div>
              <div className="rounded-lg bg-background/60 border border-border px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>Your listing will appear in the <strong className="text-foreground">New Builds</strong> section with a dedicated project showcase page.</span>
              </div>
            </div>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_off_market} onChange={() => toggle("is_off_market")} className="rounded border-border" />
        <span className="text-sm font-medium">🔒 Off-market</span>
        <span className="text-xs text-muted-foreground">Exclusive — not publicly advertised</span>
      </label>

      {/* Property type cards */}
      <div>
        <FieldLabel>Property Type</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PROP_TYPES.map(typeConfig => (
            <button key={typeConfig.value} onClick={() => { set("property_type", typeConfig.value); set("commercial_subtype", ""); }}
              className={`p-4 rounded-xl border text-left transition-all group ${
                pt === typeConfig.value ? "border-primary bg-primary/10" : "border-border bg-secondary hover:border-primary/50"
              }`}>
              <div className="text-xl mb-2">{typeConfig.emoji}</div>
              <div className={`text-sm font-semibold mb-0.5 ${pt === typeConfig.value ? "text-primary" : "text-foreground"}`}>
                {typeConfig.label}
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">{typeConfig.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Subtype */}
      {pt && PROPERTY_TYPE_MAP[pt as PropertyTypeKey] && (
        <div>
          <FieldLabel>
            {PROPERTY_TYPE_MAP[pt as PropertyTypeKey].label} Subtype
            <span className="ml-1 text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPE_MAP[pt as PropertyTypeKey].subtypes.map(sub => (
              <button key={sub.value} type="button" title={sub.description}
                onClick={() => set("commercial_subtype", form.commercial_subtype === sub.value ? "" : sub.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  form.commercial_subtype === sub.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}>
                {sub.label}
              </button>
            ))}
          </div>
          {form.commercial_subtype && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              {PROPERTY_TYPE_MAP[pt as PropertyTypeKey].subtypes.find(s => s.value === form.commercial_subtype)?.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
