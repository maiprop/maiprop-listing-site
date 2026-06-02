import { ActiveFilterChip } from "@/components/listings/ListingsUiPrimitives";
import { useListingsFilters } from "@/hooks/useListingsFilters";
import { getFeatureFilterLabel, getPriceRangeLabel, type SmartFilterFeature } from "@/lib/listingsFilterHelpers";
import { PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { translateCondition, translateHeating, translatePropertyType, translateSubtype } from "./ListingsFilterLabels";

type ListingsFilterSetParam = ReturnType<typeof useListingsFilters>["setParam"];
type ListingsFilterToggleMulti = ReturnType<typeof useListingsFilters>["toggleMulti"];

export const DesktopActiveFilterChips = ({ // skipcq: JS-R1005 - Active chips map independent URL filters into removable controls.
  selectedType,
  selectedSubtype,
  selectedPrice,
  bedsRange,
  selectedEnergyClasses,
  selectedFeatures,
  selectedHeating,
  selectedConstruction,
  preSaleOnly,
  hasVideoViewing,
  hasVirtualTour,
  hasMessaging,
  minAiScore,
  minWalkability,
  smartFeatures,
  setParam,
  toggleMulti,
  clearAllFilters,
  isGreek,
}: {
  selectedType: string;
  selectedSubtype: string;
  selectedPrice: string;
  bedsRange: string[];
  selectedEnergyClasses: string[];
  selectedFeatures: string[];
  selectedHeating: string;
  selectedConstruction: string;
  preSaleOnly: boolean;
  hasVideoViewing: boolean;
  hasVirtualTour: boolean;
  hasMessaging: boolean;
  minAiScore: number;
  minWalkability: number;
  smartFeatures: SmartFilterFeature[];
  setParam: ListingsFilterSetParam;
  toggleMulti: ListingsFilterToggleMulti;
  clearAllFilters: () => void;
  isGreek: boolean;
}) => (
  <div className="hidden sm:flex w-full items-center gap-2 min-h-9 flex-wrap overflow-hidden rounded-xl border border-border bg-card/70 px-3 py-2 shadow-sm [&>button]:inline-flex [&>button]:min-h-7 [&>button]:items-center [&>button]:leading-none [&>button]:max-w-full [&>button]:min-w-0 [&>button]:whitespace-nowrap">
    <span className="flex h-7 items-center text-xs font-medium text-muted-foreground shrink-0">{isGreek ? "Ενεργά φίλτρα:" : "Active filters:"}</span>
    {selectedType && (
      <ActiveFilterChip onClick={() => { setParam("type", ""); setParam("subtype", ""); }}>
        {PROPERTY_TYPE_MAP[selectedType as PropertyTypeKey]?.emoji} {translatePropertyType(selectedType, isGreek)}
      </ActiveFilterChip>
    )}
    {selectedSubtype && selectedType && (
      <ActiveFilterChip onClick={() => setParam("subtype", "")}>{translateSubtype(selectedType, selectedSubtype, isGreek)}</ActiveFilterChip>
    )}
    {selectedPrice && (
      <ActiveFilterChip onClick={() => setParam("price", "")}>{getPriceRangeLabel(selectedPrice)}</ActiveFilterChip>
    )}
    {bedsRange[0] && <ActiveFilterChip onClick={() => setParam("beds_min", "")}>{bedsRange[0]}+ {isGreek ? "υπνοδωμάτια" : "beds"}</ActiveFilterChip>}
    {selectedEnergyClasses.map((energyClass) => (
      <ActiveFilterChip key={energyClass} onClick={() => toggleMulti("energy", energyClass)}>{isGreek ? "Ενεργειακή κλάση" : "Energy"} {energyClass}</ActiveFilterChip>
    ))}
    {selectedFeatures.map((feature) => (
      <ActiveFilterChip key={feature} onClick={() => toggleMulti("features", feature)}>
        {getFeatureFilterLabel(smartFeatures, feature)}
      </ActiveFilterChip>
    ))}
    {selectedHeating && (
      <ActiveFilterChip onClick={() => setParam("heating", "")}>
        {isGreek ? "Θέρμανση:" : "Heating:"} {translateHeating(selectedHeating, isGreek)}
      </ActiveFilterChip>
    )}
    {selectedConstruction && (
      <ActiveFilterChip onClick={() => setParam("construction", "")}>
        {translateCondition(selectedConstruction, isGreek)}
      </ActiveFilterChip>
    )}
    {preSaleOnly && <ActiveFilterChip onClick={() => setParam("pre_sale", "")}>{isGreek ? "Προπώληση" : "Pre-sale"}</ActiveFilterChip>}
    {hasVideoViewing && <ActiveFilterChip accent onClick={() => setParam("video_viewing", "")}>{isGreek ? "Βιντεοκλήση" : "Video Viewing"}</ActiveFilterChip>}
    {hasVirtualTour && <ActiveFilterChip accent onClick={() => setParam("virtual_tour", "")}>{isGreek ? "Εικονική περιήγηση" : "Virtual Tour"}</ActiveFilterChip>}
    {hasMessaging && <ActiveFilterChip accent onClick={() => setParam("messaging", "")}>{isGreek ? "Μηνύματα" : "Messaging"}</ActiveFilterChip>}
    {minAiScore > 0 && <ActiveFilterChip accent onClick={() => setParam("min_ai_score", "")}>{isGreek ? "AI βαθμός" : "AI score"} {minAiScore}+</ActiveFilterChip>}
    {minWalkability > 0 && <ActiveFilterChip accent onClick={() => setParam("min_walkability", "")}>{isGreek ? "Περπατησιμότητα" : "Walk"} {minWalkability}+</ActiveFilterChip>}
    <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1 shrink-0">{isGreek ? "Καθαρισμός όλων" : "Clear all"}</button>
  </div>
);
