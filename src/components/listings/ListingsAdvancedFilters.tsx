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
import { ENERGY_CLASS_BUTTON_COLORS } from "@/lib/statusColors";

interface Props {
  filteredCount: number;
  onClose: () => void;
}

const ui = (isGreek: boolean, en: string, el: string) => (isGreek ? el : en);

const SMART_LABELS_EL: Record<string, string> = {
  "Size (m²)": "Εμβαδόν (τ.μ.)",
  "Plot Size (m²)": "Εμβαδόν οικοπέδου (τ.μ.)",
  "Plot Area (m²)": "Εμβαδόν οικοπέδου (τ.μ.)",
  "Land Area (m²)": "Εμβαδόν γης (τ.μ.)",
  "Coastal Plot (m²)": "Παραθαλάσσιο οικόπεδο (τ.μ.)",
  "Usable Area (m²)": "Ωφέλιμη επιφάνεια (τ.μ.)",
  "Storage Area (m²)": "Εμβαδόν αποθήκης (τ.μ.)",
  "Industrial Area (m²)": "Βιομηχανική επιφάνεια (τ.μ.)",
  "Workshop Area (m²)": "Εμβαδόν βιοτεχνικού χώρου (τ.μ.)",
  "Shop Area (m²)": "Εμβαδόν καταστήματος (τ.μ.)",
  "Total Area (m²)": "Συνολικό εμβαδόν (τ.μ.)",
  "Building Area (m²)": "Εμβαδόν κτιρίου (τ.μ.)",
  "Hall Area (m²)": "Εμβαδόν αίθουσας (τ.μ.)",
  "Showroom Area (m²)": "Εμβαδόν εκθεσιακού χώρου (τ.μ.)",
  "Premises Area (m²)": "Εμβαδόν επαγγελματικού χώρου (τ.μ.)",
  "Clinical Area (m²)": "Εμβαδόν ιατρείου (τ.μ.)",
  "Office Area (m²)": "Εμβαδόν γραφείου (τ.μ.)",
  "Desk / Area (m²)": "Θέση / εμβαδόν (τ.μ.)",
  Bedrooms: "Υπνοδωμάτια",
  Rooms: "Δωμάτια",
};

const OPTION_LABELS_EL: Record<string, string> = {
  autonomous_oil: "Αυτόνομη θέρμανση (πετρέλαιο)",
  autonomous_gas: "Αυτόνομη θέρμανση (φυσικό αέριο)",
  autonomous: "Αυτόνομη θέρμανση",
  central_oil: "Κεντρική θέρμανση (πετρέλαιο)",
  central_gas: "Κεντρική θέρμανση (φυσικό αέριο)",
  central: "Κεντρική θέρμανση",
  floor: "Ενδοδαπέδια",
  none: "Χωρίς θέρμανση",
  other: "Άλλο",
  new: "Νεόδμητο",
  under_construction: "Υπό κατασκευή",
  renovated: "Ανακαινισμένο",
  needs_renovation: "Χρήζει ανακαίνισης",
  unfinished: "Ημιτελές",
  preserved: "Διατηρητέο",
  neoclassical: "Νεοκλασικό",
  main: "Κεντρικός δρόμος",
  secondary: "Δευτερεύων δρόμος",
  pedestrian: "Πεζόδρομος",
  corner: "Γωνιακό οικόπεδο",
  flat: "Επίπεδο",
  slight: "Ήπια κλίση",
  steep: "Έντονη κλίση",
  penthouse: "Ρετιρέ",
  loft: "Loft / διώροφο",
  maisonette: "Μεζονέτα",
  traditional: "Παραδοσιακό",
  seafront: "Παραθαλάσσιο",
  hilltop: "Σε ύψωμα / με θέα",
  countryside: "Εξοχικό",
  island: "Νησιωτική βίλα",
  gated: "Συγκρότημα με ελεγχόμενη πρόσβαση",
  golden_visa: "Golden Visa",
};

const FEATURE_LABELS_EL: Record<string, string> = {
  has_parking: "Στάθμευση",
  has_elevator: "Ασανσέρ",
  has_balcony: "Μπαλκόνι",
  has_pool: "Πισίνα",
  pets_allowed: "Επιτρέπονται κατοικίδια",
  has_furnished: "Επιπλωμένο",
  has_garden: "Κήπος",
  has_ac: "Κλιματισμός",
  has_fireplace: "Τζάκι",
  has_storage: "Αποθήκη",
  has_view: "Θέα",
  has_smart_home: "Έξυπνο σπίτι",
  has_attic: "Σοφίτα",
  has_double_glazing: "Διπλά τζάμια",
  has_secure_door: "Πόρτα ασφαλείας",
  has_alarm: "Συναγερμός",
  has_loading_dock: "Ράμπα φόρτωσης",
  has_three_phase_power: "Τριφασικό ρεύμα",
  has_cctv: "CCTV",
  has_disability_access: "Προσβασιμότητα",
  has_structured_cabling: "Δομημένη καλωδίωση",
  has_facade: "Πρόσοψη καταστήματος",
  has_night_power: "Νυχτερινό ρεύμα",
  has_electricity_supply: "Παροχή ρεύματος",
  has_water_supply: "Παροχή νερού",
  is_buildable: "Οικοδομήσιμο",
  within_city_plan: "Εντός σχεδίου πόλης",
  within_settlement: "Εντός οικισμού",
  has_land_concession: "Παραχώρηση γης",
};

const labelOption = (isGreek: boolean, option: { value: string; label: string }) => {
  if (!isGreek) return option.label;
  const prefix = option.label.match(/^\p{Emoji_Presentation}|\p{Extended_Pictographic}/u)?.[0];
  const label = OPTION_LABELS_EL[option.value] ?? FEATURE_LABELS_EL[option.value] ?? option.label;
  return prefix && !label.startsWith(prefix) ? `${prefix} ${label}` : label;
};

const smartLabel = (isGreek: boolean, label?: string) => {
  if (!label) return label;
  return isGreek ? (SMART_LABELS_EL[label] ?? label) : label;
};

const floorLabel = (isGreek: boolean, label: string) => {
  if (!isGreek) return label;
  if (label === "Basement") return "Υπόγειο";
  if (label === "Ground") return "Ισόγειο";
  return label;
};

export function ListingsAdvancedFilters({ filteredCount, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const {
    selectedListingType, selectedType, selectedSubtype,
    preSaleOnly,
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
      ? [{ label: "Studio", value: "0" }, ...["1", "2", "3", "4", "5"].map(v => ({ label: ui(isGreek, `${v} bed`, `${v} υπν.`), value: v }))]
      : ["1", "2", "3", "4", "5", "6"].map(v => ({ label: v, value: v })),
    [isRent, isGreek]
  );
  const panelTypeLabel = selectedType
    ? `${getSubtypeLabel(selectedType, selectedSubtype) || getTypeLabel(selectedType)} ${ui(isGreek, "Filters", "φίλτρα")}`
    : ui(isGreek, "Advanced Filters", "Σύνθετα φίλτρα");

  return (
    <div className="bg-card/95 backdrop-blur-sm border-b border-border shadow-lg">
      <div className="container py-7">
        {/* Listing status quick toggles */}
        {(selectedListingType === "sale" || !selectedListingType) && (
          <div className="mb-6 pb-5 border-b border-border">
            <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">{ui(isGreek, "Listing Status", "Κατάσταση αγγελίας")}</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preSaleOnly}
                  onChange={e => setParam("pre_sale", e.target.checked ? "1" : "")}
                  className="rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">🏗️ {ui(isGreek, "Pre-sale only", "Μόνο προπώληση")}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">{ui(isGreek, "New developments before completion", "Νέα έργα πριν από την ολοκλήρωση")}</span>
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
                {panelTypeLabel}
              </span>
              {!aiFiltersLoading && selectedType && (
                <span className="flex items-center gap-1 text-[10px] text-primary/70 mt-0.5">
                  <Sparkles className="w-2.5 h-2.5" />{ui(isGreek, "AI-curated for this property type", "AI επιλεγμένα για αυτόν τον τύπο ακινήτου")}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" aria-label={ui(isGreek, "Close filters", "Κλείσιμο φίλτρων")}>
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
                    {smartLabel(isGreek, aiFilterConfig.sizeLabel)}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                    <input type="number" placeholder={ui(isGreek, "Min m²", "Ελάχ. τ.μ.")} value={minSqm} onChange={e => setParam("sqm_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <input type="number" placeholder={ui(isGreek, "Max m²", "Μέγ. τ.μ.")} value={maxSqm} onChange={e => setParam("sqm_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                  </div>
                </div>
              )}
              {/* Bedrooms */}
              {aiFilterConfig.sections.includes("bedrooms") && aiFilterConfig.bedsLabel && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    {smartLabel(isGreek, aiFilterConfig.bedsLabel)}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={bedsRange[0]} onChange={e => setParam("beds_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Min", "Ελάχιστο")}</option>
                      {bedsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={bedsRange[1]} onChange={e => setParam("beds_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Max", "Μέγιστο")}</option>
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
                    {ui(isGreek, "Bathrooms", "Μπάνια")}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={bathsRange[0]} onChange={e => setParam("baths_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Min", "Ελάχιστο")}</option>
                      {bathsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={bathsRange[1]} onChange={e => setParam("baths_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Max", "Μέγιστο")}</option>
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
                    {ui(isGreek, "Floor", "Όροφος")}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={floorRange[0]} onChange={e => setParam("floor_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Min", "Ελάχιστο")}</option>
                      {floorOpts.map(o => <option key={o.value} value={o.value}>{floorLabel(isGreek, o.label)}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={floorRange[1]} onChange={e => setParam("floor_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Max", "Μέγιστο")}</option>
                      {floorOpts.map(o => <option key={o.value} value={o.value}>{floorLabel(isGreek, o.label)}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {/* Year Built */}
              {aiFilterConfig.sections.includes("year_built") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    {ui(isGreek, "Year Built", "Έτος κατασκευής")}
                  </label>
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                    <select value={yearRange[0]} onChange={e => setParam("year_min", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "From", "Από")}</option>
                      {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs font-medium">—</span>
                    <select value={yearRange[1]} onChange={e => setParam("year_max", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "To", "Έως")}</option>
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
                    {ui(isGreek, "Heating", "Θέρμανση")}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {HEATING_TYPES.map(h => (
                      <button key={h.value} onClick={() => setParam("heating", selectedHeating === h.value ? "" : h.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedHeating === h.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}>{labelOption(isGreek, h)}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Condition */}
              {aiFilterConfig.sections.includes("construction_status") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    {ui(isGreek, "Condition", "Κατάσταση")}
                  </label>
                  <div className="relative">
                    <select value={selectedConstruction} onChange={e => setParam("construction", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Any condition", "Οποιαδήποτε κατάσταση")}</option>
                      {CONSTRUCTION_STATUSES.map(s => <option key={s.value} value={s.value}>{labelOption(isGreek, s)}</option>)}
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
                      {ui(isGreek, "Road Type", "Τύπος δρόμου")}
                    </label>
                    <div className="relative">
                      <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                        <option value="">{ui(isGreek, "Any", "Οποιοσδήποτε")}</option>
                        {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{labelOption(isGreek, r)}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      {ui(isGreek, "Slope", "Κλίση")}
                    </label>
                    <div className="flex gap-1.5">
                      {SLOPE_TYPES.map(s => (
                        <button key={s.value} onClick={() => setParam("slope", getParam("slope") === s.value ? "" : s.value)}
                          className={`flex-1 px-2 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            getParam("slope") === s.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                          }`}>{labelOption(isGreek, s)}</button>
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
                    {ui(isGreek, "Road Frontage", "Πρόσοψη σε δρόμο")}
                  </label>
                  <div className="relative">
                    <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                      <option value="">{ui(isGreek, "Any", "Οποιαδήποτε")}</option>
                      {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{labelOption(isGreek, r)}</option>)}
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
                    {ui(isGreek, "Min Rental Period", "Ελάχιστη διάρκεια μίσθωσης")}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[{v:"1",l:ui(isGreek, "1 mo", "1 μήνας")},{v:"3",l:ui(isGreek, "3 mo", "3 μήνες")},{v:"6",l:ui(isGreek, "6 mo", "6 μήνες")},{v:"12",l:ui(isGreek, "1 yr", "1 έτος")}].map(o => (
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
                  {ui(isGreek, "Energy Rating", "Ενεργειακή κλάση")}
                  {selectedEnergyClasses.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-[10px] font-bold">
                      {selectedEnergyClasses.join(", ")}
                    </span>
                  )}
                </label>
                <div className="flex items-stretch gap-1 rounded-xl overflow-hidden border border-border p-1 bg-secondary/50">
                  {(["A+","A","B+","B","C","D","E","F","G"] as const).map((ec) => {
                    const { bg: color, text } = ENERGY_CLASS_BUTTON_COLORS[ec];
                    const badge = ec;
                    const active = selectedEnergyClasses.includes(ec);
                    return (
                      <button
                        key={ec}
                        onClick={() => toggleMulti("energy", ec)}
                        title={ui(isGreek, `Energy class ${ec}`, `Ενεργειακή κλάση ${ec}`)}
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
                  <span className="text-[10px] text-brand-emerald font-semibold">{ui(isGreek, "Most efficient", "Πιο αποδοτικό")}</span>
                  <span className="text-[10px] text-muted-foreground">{ui(isGreek, "Least efficient", "Λιγότερο αποδοτικό")}</span>
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
                    {ui(isGreek, "Property Style", "Στυλ ακινήτου")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {styleFilters.map(s => (
                      <FilterChip key={s.value} active={selectedStyles.includes(s.value)}
                        onClick={() => toggleMulti("style", s.value)}>
                        {labelOption(isGreek, s)}
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
                  {isGreek ? "Χαρακτηριστικά ακινήτου" : aiFilterConfig.featuresLabel}
                </label>
                <div className="flex flex-wrap gap-2">
                  {aiFilterConfig.features.map(feat => (
                    <FilterChip key={feat.key} active={selectedFeatures.includes(feat.key)}
                      onClick={() => toggleMulti("features", feat.key)}>
                      {labelOption(isGreek, { value: feat.key, label: feat.label })}
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
            {ui(isGreek, "Listing Features", "Λειτουργίες αγγελίας")}
            {proFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent text-[10px] font-bold ml-1">{proFilterCount} {ui(isGreek, "active", "ενεργά")}</span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { param: "video_viewing", active: hasVideoViewing, label: ui(isGreek, "🎥 Video Viewing", "🎥 Επίσκεψη με βιντεοκλήση"), desc: ui(isGreek, "Supports video call viewings", "Υποστηρίζει επίσκεψη μέσω βιντεοκλήσης") },
              { param: "virtual_tour", active: hasVirtualTour, label: ui(isGreek, "🔮 Virtual Tour", "🔮 Εικονική περιήγηση"), desc: ui(isGreek, "360° walkthrough available", "Διαθέσιμη περιήγηση 360°") },
              { param: "messaging", active: hasMessaging, label: ui(isGreek, "💬 Messaging", "💬 Μηνύματα"), desc: ui(isGreek, "Direct messaging with owner", "Άμεση επικοινωνία με τον ιδιοκτήτη") },
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
            <label className="text-xs font-medium text-muted-foreground mb-2 block">🤖 {ui(isGreek, "Minimum AI Score", "Ελάχιστη βαθμολογία AI")}</label>
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
                  {score === 0 ? ui(isGreek, "Any", "Οποιαδήποτε") : `${score}+`}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum Walkability Score */}
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">🚶 {ui(isGreek, "Minimum Walkability", "Ελάχιστη βαδισιμότητα")}</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 0,  label: ui(isGreek, "Any", "Οποιαδήποτε") },
                { value: 50, label: ui(isGreek, "50+ Somewhat", "50+ Μέτρια") },
                { value: 70, label: ui(isGreek, "70+ Very", "70+ Πολύ καλή") },
                { value: 90, label: ui(isGreek, "90+ Paradise", "90+ Εξαιρετική") },
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
            <p className="text-[10px] text-muted-foreground mt-1.5">{ui(isGreek, "Only shows listings where a neighbourhood report has been generated", "Εμφανίζει μόνο αγγελίες για τις οποίες έχει δημιουργηθεί αναφορά περιοχής")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
          <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-2 px-5" onClick={onClose}>
            <Check className="w-3.5 h-3.5" />
            {ui(isGreek, `Show ${filteredCount} Results`, `Εμφάνιση ${filteredCount} αποτελεσμάτων`)}
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
