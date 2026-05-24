import { Info, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HEATING_TYPES, CONDITION_OPTIONS } from "@/lib/filterConfig";
import {
  FieldLabel, FieldError, SectionTitle,
  FormInput as Input, FormSelect as Select, FormTextarea as Textarea,
} from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";
import { tFallback } from "@/lib/i18nFallback";

const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G", "Exempt"];
const SLOPES = ["flat", "slight", "steep"];
const ZONE_TYPES = ["residential", "agricultural", "tourist", "industrial", "commercial", "mixed"];
const ROAD_TYPES = ["asphalt", "paved", "dirt"];
const COMMERCIAL_SUBTYPES = ["shop", "office", "warehouse", "hotel", "restaurant", "showroom", "clinic", "industrial", "other"];

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  setFieldRef: (key: string) => (el: HTMLElement | null) => void;
  aiDescLoading: boolean;
  handleAiDescription: () => Promise<void>;
}

const isResidential = (t: string) => ["apartment", "house", "villa"].includes(t);
const isLand = (t: string) => t === "land";
const isCommercial = (t: string) => ["commercial", "office"].includes(t);

export function StepDetails({ form, set, errors, setFieldRef, aiDescLoading, handleAiDescription }: Props) {
  const { t } = useTranslation();
  const pt = form.property_type;
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const option = (group: string, value: string) => tr(`createListing.options.${group}.${value}`, value);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">{tr("createListing.details.heading", "Property Details")}</h2>

      <div ref={setFieldRef("title") as React.Ref<HTMLDivElement>}>
        <FieldLabel required>{tr("createListing.details.title", "Title")}</FieldLabel>
        <Input placeholder={tr("createListing.details.titlePlaceholder", "e.g. Modern 2-bed apartment in Kolonaki")} value={form.title} onChange={e => set("title", e.target.value)} hasError={!!errors.title} />
        <FieldError msg={errors.title} />
      </div>

      <div>
        <FieldLabel>{tr("createListing.details.description", "Description")}</FieldLabel>
        <Textarea
          placeholder={tr("createListing.details.descriptionPlaceholder", "Describe the property in detail - highlights, condition, location perks, investment potential...")}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          rows={5}
        />
        <button
          type="button"
          onClick={handleAiDescription}
          disabled={aiDescLoading}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
        >
          {aiDescLoading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {tr("createListing.details.generating", "Generating...")}</>
            : <><Sparkles className="w-3.5 h-3.5" /> {form.description ? tr("createListing.details.regenerateWithAi", "Regenerate with AI") : tr("createListing.details.writeWithAi", "Write with AI")}</>
          }
        </button>
        {!form.sqm && (
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Info className="w-3 h-3 shrink-0" /> {tr("createListing.details.aiAreaHint", "Fill in Area (m²) below for better AI results")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div ref={setFieldRef("sqm") as React.Ref<HTMLDivElement>}>
          <FieldLabel required>{tr("createListing.details.area", "Area (m²)")}</FieldLabel>
          <Input type="number" placeholder="85" value={form.sqm} onChange={e => set("sqm", e.target.value)} hasError={!!errors.sqm} />
          <FieldError msg={errors.sqm} />
        </div>
        <div><FieldLabel>{tr("createListing.details.yearBuilt", "Year Built")}</FieldLabel><Input type="number" placeholder="2010" value={form.year_built} onChange={e => set("year_built", e.target.value)} /></div>
      </div>

      {isResidential(pt) && (
        <>
          <SectionTitle>{tr("createListing.details.rooms", "Rooms")}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <div><FieldLabel>{tr("createListing.details.bedrooms", "Bedrooms")}</FieldLabel><Input type="number" placeholder="2" value={form.bedrooms} onChange={e => set("bedrooms", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.bathrooms", "Bathrooms")}</FieldLabel><Input type="number" placeholder="1" value={form.bathrooms} onChange={e => set("bathrooms", e.target.value)} /></div>
            <div><FieldLabel>WC</FieldLabel><Input type="number" placeholder="1" value={form.wc_count} onChange={e => set("wc_count", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.kitchens", "Kitchens")}</FieldLabel><Input type="number" placeholder="1" value={form.kitchens} onChange={e => set("kitchens", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.livingRooms", "Living Rooms")}</FieldLabel><Input type="number" placeholder="1" value={form.living_rooms} onChange={e => set("living_rooms", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.levels", "Levels")}</FieldLabel><Input type="number" placeholder="1" value={form.levels} onChange={e => set("levels", e.target.value)} /></div>
          </div>
          <SectionTitle>{tr("createListing.details.floorSection", "Floor")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>{tr("createListing.details.floor", "Floor")}</FieldLabel><Input type="number" placeholder="3" value={form.floor} onChange={e => set("floor", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.totalFloorsInBuilding", "Total Floors in Building")}</FieldLabel><Input type="number" placeholder="6" value={form.total_floors} onChange={e => set("total_floors", e.target.value)} /></div>
          </div>
          <SectionTitle>{tr("createListing.details.systemsCondition", "Systems & condition")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{tr("createListing.details.heating", "Heating")}</FieldLabel>
              <Select value={form.heating_system} onChange={e => set("heating_system", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {HEATING_TYPES.map(h => <option key={h.value} value={h.value}>{option("heating", h.value)}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>{tr("createListing.details.condition", "Condition")}</FieldLabel>
              <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {CONDITION_OPTIONS.map(s => <option key={s.value} value={s.value}>{option("condition", s.value)}</option>)}
              </Select>
            </div>
          </div>
        </>
      )}

      {isCommercial(pt) && (
        <>
          <SectionTitle>{tr("createListing.details.commercialDetails", "Commercial Details")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{tr("createListing.details.subtype", "Subtype")}</FieldLabel>
              <Select value={form.commercial_subtype} onChange={e => set("commercial_subtype", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {COMMERCIAL_SUBTYPES.map(s => <option key={s} value={s} className="capitalize">{option("commercialSubtypes", s)}</option>)}
              </Select>
            </div>
            <div><FieldLabel>{tr("createListing.details.plotSurface", "Plot Surface (m²)")}</FieldLabel><Input type="number" placeholder="500" value={form.plot_surface} onChange={e => set("plot_surface", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.floorHeight", "Floor Height (m)")}</FieldLabel><Input type="number" step="0.1" placeholder="3.5" value={form.floor_height} onChange={e => set("floor_height", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.wcCount", "WC Count")}</FieldLabel><Input type="number" placeholder="2" value={form.wc_count} onChange={e => set("wc_count", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.floor", "Floor")}</FieldLabel><Input type="number" placeholder="0" value={form.floor} onChange={e => set("floor", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.totalFloors", "Total Floors")}</FieldLabel><Input type="number" placeholder="4" value={form.total_floors} onChange={e => set("total_floors", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{tr("createListing.details.heating", "Heating")}</FieldLabel>
              <Select value={form.heating_system} onChange={e => set("heating_system", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {HEATING_TYPES.map(h => <option key={h.value} value={h.value}>{option("heating", h.value)}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>{tr("createListing.details.condition", "Condition")}</FieldLabel>
              <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {CONDITION_OPTIONS.map(s => <option key={s.value} value={s.value}>{option("condition", s.value)}</option>)}
              </Select>
            </div>
          </div>
        </>
      )}

      {isLand(pt) && (
        <>
          <SectionTitle>{tr("createListing.details.landDetails", "Land Details")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>{tr("createListing.details.facadeLength", "Facade Length (m)")}</FieldLabel><Input type="number" step="0.1" placeholder="21" value={form.facade_length} onChange={e => set("facade_length", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.plotDepth", "Plot Depth (m)")}</FieldLabel><Input type="number" step="0.1" placeholder="36" value={form.plot_depth} onChange={e => set("plot_depth", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.coverageRatio", "Coverage Ratio (%)")}</FieldLabel><Input type="number" placeholder="50" value={form.coverage_ratio} onChange={e => set("coverage_ratio", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.maxBuildingAllowance", "Max Building Allowance (m²)")}</FieldLabel><Input type="number" placeholder="400" value={form.building_allowance} onChange={e => set("building_allowance", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.distanceFromSea", "Distance from Sea (m)")}</FieldLabel><Input type="number" placeholder="500" value={form.distance_from_sea} onChange={e => set("distance_from_sea", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.details.distanceFromCity", "Distance from City (m)")}</FieldLabel><Input type="number" placeholder="2000" value={form.distance_from_city} onChange={e => set("distance_from_city", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>{tr("createListing.details.slope", "Slope")}</FieldLabel>
              <Select value={form.slope} onChange={e => set("slope", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {SLOPES.map(s => <option key={s} value={s} className="capitalize">{option("slopes", s)}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>{tr("createListing.details.zoneType", "Zone Type")}</FieldLabel>
              <Select value={form.zone_type} onChange={e => set("zone_type", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {ZONE_TYPES.map(z => <option key={z} value={z} className="capitalize">{option("zoneTypes", z)}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>{tr("createListing.details.roadType", "Road Type")}</FieldLabel>
              <Select value={form.road_type} onChange={e => set("road_type", e.target.value)}>
                <option value="">{tr("createListing.options.select", "Select...")}</option>
                {ROAD_TYPES.map(r => <option key={r} value={r} className="capitalize">{option("roadTypes", r)}</option>)}
              </Select>
            </div>
          </div>
        </>
      )}

      {!isLand(pt) && (
        <>
          <SectionTitle>{tr("createListing.details.energy", "Energy")}</SectionTitle>
          <div>
            <FieldLabel>{tr("createListing.details.energyClass", "Energy Class")}</FieldLabel>
            <div className="flex gap-2 flex-wrap">
              {ENERGY_CLASSES.map(c => (
                <button key={c} type="button" onClick={() => set("energy_class", c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    form.energy_class === c ? "bg-primary/20 border border-primary text-primary" : "bg-secondary border border-border text-muted-foreground"
                  }`}>{c}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
