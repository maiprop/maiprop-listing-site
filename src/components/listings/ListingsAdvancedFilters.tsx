/**
 * Advanced Filters Panel for the Listings page.
 * Reads and writes all filter state via URL params through useListingsFilters().
 * Props are minimal — only filteredCount (for "Show X Results") and onClose.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SlidersHorizontal, X, Sparkles, ChevronDown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/listings/FilterChip";
import { useListingsFilters } from "@/hooks/useListingsFilters";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import {
  TYPE_STYLE_FILTERS, getTypeLabel, getSubtypeLabel,
  type PropertyTypeKey,
} from "@/lib/propertyTypes";
import {
  HEATING_TYPES, CONSTRUCTION_STATUSES, ROAD_TYPES, SLOPE_TYPES,
} from "@/lib/filterConfig";
import {
  bathsOpts, floorOpts, yearOpts,
} from "@/lib/listingsConfig";

interface Props {
  filteredCount: number;
  onClose: () => void;
}

export function ListingsAdvancedFilters({ filteredCount, onClose }: Props) {
  const { t } = useTranslation();
  const {
    selectedListingType, selectedType, selectedSubtype,
    offMarketOnly, preSaleOnly,
    minSqm, maxSqm, bedsRange, bathsRange, floorRange, yearRange,
    selectedEnergyClasses, selectedFeatures, selectedHeating, selectedConstruction,
    hasVideoViewing, hasVirtualTour, hasMessaging,
    minAiScore, minWalkability, proFilterCount,
    isRent, setParam, toggleMulti, clearAllFilters, getParam, getMulti,
  } = useListingsFilters();

  const { config: aiFilterConfig, loading: aiFiltersLoading } = useSmartFilters(
    selectedType, selectedSubtype, selectedListingType
  );

  const bedsOpts = useMemo(
    () => isRent
      ? [{ label: "Studio", value: "0" }, ...["1", "2", "3", "4", "5"].map(v => ({ label: `${v} bed`, value: v }))]
      : ["1", "2", "3", "4", "5", "6"].map(v => ({ label: v, value: v })),
    [isRent]
  );

  return (
    <div className="bg-card/95 backdrop-blur-sm border-b border-border shadow-lg">
      <div className="container py-7">
        {/* Listing status quick toggles */}
        {(selectedListingType === "sale" || !selectedListingType) && (
          <div className="mb-6 pb-5 border-b border-border">
            <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">Listing Status</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={offMarketOnly}
                  onChange={e => setParam("off_market", e.target.checked ? "1" : "")}
                  className="rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">🔒 Off-market only</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">Exclusive, not publicly advertised</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preSaleOnly}
                  onChange={e => setParam("pre_sale", e.target.checked ? "1" : "")}
                  className="rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">🏗️ Pre-sale only</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">New developments before completion</span>
              </label>
            </div>
          </div>
        )}

        {/* Panel header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="font-display font-semibold text-sm">
                {selectedType
                  ? `${getSubtypeLabel(selectedType, selectedSubtype) || getTypeLabel(selectedType)} Filters`
                  : "Advanced Filters"}
              </span>
              {!aiFiltersLoading && selectedType && (
                <span className="flex items-center gap-1 text-[10px] text-primary/70 mt-0.5">
                  <Sparkles className="w-2.5 h-2.5" />AI-curated for this property type
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {aiFiltersLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-secondary/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Size */}
              {aiFilterConfig.sections.includes("size") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    {aiFilterConfig.sizeLabel}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                    <input type="number" placeholder="Min m²" value={minSqm} onChange={e => setParam("sqm_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <input type="number" placeholder="Max m²" value={maxSqm} onChange={e => setParam("sqm_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                  </div>
                </div>
              )}
              {/* Bedrooms */}
              {aiFilterConfig.sections.includes("bedrooms") && aiFilterConfig.bedsLabel && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    {aiFilterConfig.bedsLabel}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={bedsRange[0]} onChange={e => setParam("beds_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Min</option>
                      {bedsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={bedsRange[1]} onChange={e => setParam("beds_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Max</option>
                      {bedsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {/* Bathrooms */}
              {aiFilterConfig.sections.includes("bathrooms") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Bathrooms
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={bathsRange[0]} onChange={e => setParam("baths_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Min</option>
                      {bathsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={bathsRange[1]} onChange={e => setParam("baths_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Max</option>
                      {bathsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {/* Floor */}
              {aiFilterConfig.sections.includes("floor") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Floor
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={floorRange[0]} onChange={e => setParam("floor_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Min</option>
                      {floorOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={floorRange[1]} onChange={e => setParam("floor_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">Max</option>
                      {floorOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {/* Year Built */}
              {aiFilterConfig.sections.includes("year_built") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Year Built
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={yearRange[0]} onChange={e => setParam("year_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">From</option>
                      {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={yearRange[1]} onChange={e => setParam("year_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">To</option>
                      {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {/* Heating */}
              {aiFilterConfig.sections.includes("heating") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Heating
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {HEATING_TYPES.map(h => (
                      <button key={h.value} onClick={() => setParam("heating", selectedHeating === h.value ? "" : h.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedHeating === h.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}>{h.label}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Condition */}
              {aiFilterConfig.sections.includes("construction_status") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Condition
                  </label>
                  <div className="relative">
                    <select value={selectedConstruction} onChange={e => setParam("construction", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                      <option value="">Any condition</option>
                      {CONSTRUCTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
              {/* Land details */}
              {aiFilterConfig.sections.includes("land_details") && (
                <>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      Road Type
                    </label>
                    <div className="relative">
                      <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                        <option value="">Any</option>
                        {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      Slope
                    </label>
                    <div className="flex gap-1.5">
                      {SLOPE_TYPES.map(s => (
                        <button key={s.value} onClick={() => setParam("slope", getParam("slope") === s.value ? "" : s.value)}
                          className={`flex-1 px-2 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            getParam("slope") === s.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                          }`}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {/* Commercial details */}
              {aiFilterConfig.sections.includes("commercial_details") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Road Frontage
                  </label>
                  <div className="relative">
                    <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                      <option value="">Any</option>
                      {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
              {/* Rental extras */}
              {aiFilterConfig.sections.includes("rental_extras") && selectedListingType === "rent" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Min Rental Period
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[{v:"1",l:"1 mo"},{v:"3",l:"3 mo"},{v:"6",l:"6 mo"},{v:"12",l:"1 yr"}].map(o => (
                      <button key={o.v} onClick={() => setParam("min_rental", getParam("min_rental") === o.v ? "" : o.v)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          getParam("min_rental") === o.v
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                        }`}>{o.l}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Energy Class */}
            {aiFilterConfig.sections.includes("energy_class") && (
              <div className="mt-6 pt-5 border-t border-border/60">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald inline-block" />
                  Energy Rating
                  {selectedEnergyClasses.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-[10px] font-bold">
                      {selectedEnergyClasses.join(", ")}
                    </span>
                  )}
                </label>
                <div className="flex items-stretch gap-1 rounded-xl overflow-hidden border border-border p-1 bg-secondary/50">
                  {[
                    { ec: "A+", color: "bg-[#00a550]", text: "text-white", badge: "A+" },
                    { ec: "A",  color: "bg-[#50b848]", text: "text-white", badge: "A" },
                    { ec: "B+", color: "bg-[#8dc63f]", text: "text-white", badge: "B+" },
                    { ec: "B",  color: "bg-[#c3d600]", text: "text-black", badge: "B" },
                    { ec: "C",  color: "bg-[#ffcc00]", text: "text-black", badge: "C" },
                    { ec: "D",  color: "bg-[#f7941e]", text: "text-white", badge: "D" },
                    { ec: "E",  color: "bg-[#f15a22]", text: "text-white", badge: "E" },
                    { ec: "F",  color: "bg-[#ed1c24]", text: "text-white", badge: "F" },
                    { ec: "G",  color: "bg-[#be1e2d]", text: "text-white", badge: "G" },
                  ].map(({ ec, color, text, badge }) => {
                    const active = selectedEnergyClasses.includes(ec);
                    return (
                      <button
                        key={ec}
                        onClick={() => toggleMulti("energy", ec)}
                        title={`Energy class ${ec}`}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg transition-all relative group ${
                          active
                            ? `${color} ${text} shadow-md scale-105 z-10 ring-2 ring-white/30`
                            : `${color} ${text} opacity-40 hover:opacity-80 hover:scale-102`
                        }`}
                      >
                        <span className="font-black text-[11px] leading-none">{badge}</span>
                        {active && (
                          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow">
                            <Check className="w-2 h-2 text-black" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 px-1">
                  <span className="text-[10px] text-brand-emerald font-semibold">Most efficient</span>
                  <span className="text-[10px] text-muted-foreground">Least efficient</span>
                </div>
              </div>
            )}

            {/* Property Style chips */}
            {(() => {
              const styleFilters = TYPE_STYLE_FILTERS[selectedType as PropertyTypeKey];
              if (!styleFilters?.length) return null;
              const selectedStyles = getMulti("style");
              return (
                <div className="mt-5 pt-5 border-t border-border/60">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                    Property Style
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {styleFilters.map(s => (
                      <FilterChip key={s.value} active={selectedStyles.includes(s.value)}
                        onClick={() => toggleMulti("style", s.value)}>
                        {s.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* AI-curated feature chips */}
            {aiFilterConfig.features.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border/60">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  {aiFilterConfig.featuresLabel}
                </label>
                <div className="flex flex-wrap gap-2">
                  {aiFilterConfig.features.map(feat => (
                    <FilterChip key={feat.key} active={selectedFeatures.includes(feat.key)}
                      onClick={() => toggleMulti("features", feat.key)}>
                      {feat.label}
                    </FilterChip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Pro / listing-feature filters */}
        <div className="mt-6 pt-5 border-t border-border">
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
            Listing Features
            {proFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent text-[10px] font-bold ml-1">{proFilterCount} active</span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { param: "video_viewing", active: hasVideoViewing, label: "🎥 Video Viewing", desc: "Supports video call viewings" },
              { param: "virtual_tour", active: hasVirtualTour, label: "🔮 Virtual Tour", desc: "360° walkthrough available" },
              { param: "messaging", active: hasMessaging, label: "💬 Messaging", desc: "Direct messaging with owner" },
            ].map(({ param, active, label, desc }) => (
              <button
                key={param}
                title={desc}
                onClick={() => setParam(param, active ? "" : "1")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  active
                    ? "bg-accent/15 border-accent/50 text-accent"
                    : "bg-secondary border-border text-muted-foreground hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {label}
                {active && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>

          {/* Minimum AI Score */}
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">🤖 Minimum AI Score</label>
            <div className="flex flex-wrap gap-2">
              {[0, 60, 70, 75, 80, 85, 90].map(score => (
                <button
                  key={score}
                  onClick={() => setParam("min_ai_score", score > 0 ? String(score) : "")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    minAiScore === score
                      ? "bg-accent/15 border-accent/50 text-accent"
                      : "bg-secondary border-border text-muted-foreground hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  {score === 0 ? "Any" : `${score}+`}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum Walkability Score */}
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">🚶 Minimum Walkability</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 0,  label: "Any" },
                { value: 50, label: "50+ Somewhat" },
                { value: 70, label: "70+ Very" },
                { value: 90, label: "90+ Paradise" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setParam("min_walkability", value > 0 ? String(value) : "")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    minWalkability === value
                      ? "bg-accent/15 border-accent/50 text-accent"
                      : "bg-secondary border-border text-muted-foreground hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Only shows listings where a neighbourhood report has been generated</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
          <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-2 px-5" onClick={onClose}>
            <Check className="w-3.5 h-3.5" />
            Show {filteredCount} Results
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground gap-1" onClick={clearAllFilters}>
            <X className="w-3 h-3" />
            {t("listings.filters.reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}
