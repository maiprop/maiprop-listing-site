import { SlidersHorizontal, X, Lock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PremiumBadge } from "@/components/auctions/AuctionCard";
import {
  PROPERTY_TYPES,
  BID_RANGES,
  YEAR_RANGES,
  OWNERSHIP_STATUSES,
} from "@/lib/auctionUtils";

interface AuctionFiltersPanelProps {
  showFilters: boolean;
  selectedCity: string;
  setSelectedCity: (v: string) => void;
  cityOptions: string[];
  filterType: string;
  setFilterType: (v: string) => void;
  filterBidRange: string;
  setFilterBidRange: (v: string) => void;
  filterYearRange: string;
  setFilterYearRange: (v: string) => void;
  filterOwnership: string;
  setFilterOwnership: (v: string) => void;
  filterRound: string;
  setFilterRound: (v: string) => void;
  filterYield: string;
  setFilterYield: (v: string) => void;
  roundOptions: { value: string; label: string }[];
  isPro: boolean;
  isMaiPropOsUser: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
}

type SelectOption = { value: string; label: string };

const YIELD_OPTIONS: SelectOption[] = [
  { value: "", label: "Any Yield" },
  { value: "low", label: "Under 3% — Low yield" },
  { value: "medium", label: "3% – 6% — Average" },
  { value: "high", label: "6% – 9% — Good" },
  { value: "very_high", label: "9%+ — High yield opportunity" },
];

const AUCTION_OPTION_EL: Record<string, string> = {
  "All Types": "Όλοι οι τύποι",
  Apartment: "Διαμέρισμα",
  House: "Μονοκατοικία",
  Villa: "Βίλα",
  "Land / Plot (any)": "Οικόπεδο / Αγροτεμάχιο",
  "Land (no building)": "Γη χωρίς κτίσμα",
  "Land with building": "Αγροτεμάχιο με κτίσμα",
  "Agricultural land": "Αγροτεμάχιο",
  "Plot with building": "Οικόπεδο με κτίσμα",
  "Commercial (any)": "Επαγγελματικό ακίνητο",
  "Store / Retail": "Κατάστημα",
  Warehouse: "Αποθήκη",
  Industrial: "Βιομηχανικός χώρος",
  Storeroom: "Αποθηκευτικός χώρος",
  Parking: "Θέση στάθμευσης",
  Hotel: "Ξενοδοχείο",
  "Other business space": "Λοιπός επαγγελματικός χώρος",
  Office: "Γραφείο",
  "Any First Offer Price": "Οποιαδήποτε τιμή πρώτης προσφοράς",
  "Under €20k": "Κάτω από €20k",
  "€20k – €50k": "€20k – €50k",
  "€50k – €100k": "€50k – €100k",
  "€100k – €200k": "€100k – €200k",
  "€200k – €500k": "€200k – €500k",
  "€500k+": "€500k+",
  "Any Year": "Οποιοδήποτε έτος",
  "Pre-1980": "Πριν το 1980",
  "Post-2020": "Μετά το 2020",
  "Any Status": "Οποιοδήποτε καθεστώς",
  Full: "Πλήρης κυριότητα",
  Bare: "Ψιλή κυριότητα",
  Common: "Εξ αδιαιρέτου ποσοστό",
  Usufruct: "Επικαρπία",
  Vertical: "Κάθετη ιδιοκτησία",
  Horizontal: "Οριζόντια ιδιοκτησία",
  "Any Yield": "Οποιαδήποτε απόδοση",
  "Under 3% — Low yield": "Κάτω από 3% — Χαμηλή απόδοση",
  "3% – 6% — Average": "3% – 6% — Μέση απόδοση",
  "6% – 9% — Good": "6% – 9% — Καλή απόδοση",
  "9%+ — High yield opportunity": "9%+ — Υψηλή δυνητική απόδοση",
};

const translateOption = (option: SelectOption, isGreek: boolean): SelectOption => ({
  ...option,
  label: isGreek ? AUCTION_OPTION_EL[option.label] ?? option.label : option.label,
});

const translateOptions = (options: SelectOption[], isGreek: boolean): SelectOption[] =>
  options.map((option) => translateOption(option, isGreek));

/**
 * Shared wrapper: chevron indicator + a11y label association.
 * Accepts `options` as a prop (not children) to keep JSX nesting depth ≤ 4.
 */
const FilterSelect = ({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) => (
  <div>
    <label htmlFor={id} className="text-xs text-muted-foreground font-medium block mb-1.5">
      {label}
    </label>
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary cursor-pointer pr-8"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
    </div>
  </div>
);

/** Unlocked premium filter selects (ownership, round, yield) shown to Pro/OS users. */
const PremiumFiltersGrid = ({
  filterOwnership, setFilterOwnership,
  filterRound, setFilterRound, roundOptions,
  filterYield, setFilterYield,
  isGreek,
}: {
  filterOwnership: string; setFilterOwnership: (v: string) => void;
  filterRound: string; setFilterRound: (v: string) => void;
  roundOptions: SelectOption[];
  filterYield: string; setFilterYield: (v: string) => void;
  isGreek: boolean;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <FilterSelect
      id="filter-ownership"
      label={isGreek ? "Καθεστώς κυριότητας" : "Ownership Status"}
      value={filterOwnership}
      onChange={setFilterOwnership}
      options={translateOptions(OWNERSHIP_STATUSES, isGreek)}
    />
    <FilterSelect
      id="filter-round"
      label={isGreek ? "Γύρος πλειστηριασμού" : "Auction Round"}
      value={filterRound}
      onChange={setFilterRound}
      options={roundOptions}
    />
    <FilterSelect
      id="filter-yield"
      label={<>{isGreek ? "Εκτ. μισθωτική απόδοση" : "Est. Rental Yield"} <span className="ml-1.5 text-[10px] text-muted-foreground/60">{isGreek ? "(δείκτης πόλης × τ.μ. / τιμή)" : "(city benchmark × sqm / bid)"}</span></>}
      value={filterYield}
      onChange={setFilterYield}
      options={translateOptions(YIELD_OPTIONS, isGreek)}
    />
  </div>
);

/** Chip row shown beneath the toolbar when the panel is closed and filters are active. */
const ActiveFilterChips = ({
  filterType, setFilterType,
  filterBidRange, setFilterBidRange,
  filterYearRange, setFilterYearRange,
  filterOwnership, setFilterOwnership,
  filterRound, setFilterRound,
  filterYield, setFilterYield,
  roundOptions,
  isPro, isMaiPropOsUser,
  clearFilters,
  isGreek,
}: {
  filterType: string; setFilterType: (v: string) => void;
  filterBidRange: string; setFilterBidRange: (v: string) => void;
  filterYearRange: string; setFilterYearRange: (v: string) => void;
  filterOwnership: string; setFilterOwnership: (v: string) => void;
  filterRound: string; setFilterRound: (v: string) => void;
  filterYield: string; setFilterYield: (v: string) => void;
  roundOptions: { value: string; label: string }[];
  isPro: boolean; isMaiPropOsUser: boolean;
  clearFilters: () => void;
  isGreek: boolean;
}) => (
  <div className="flex items-center gap-2 mt-3 flex-wrap">
    <span className="text-xs text-muted-foreground">{isGreek ? "Ενεργά:" : "Active:"}</span>
    {filterType && (
      <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors capitalize">
        {translateOption(PROPERTY_TYPES.find((option) => option.value === filterType) ?? { value: filterType, label: filterType }, isGreek).label} <X className="w-3 h-3" />
      </button>
    )}
    {filterBidRange && (
      <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
        {translateOption(BID_RANGES.find((r) => r.value === filterBidRange) ?? { value: filterBidRange, label: filterBidRange }, isGreek).label} <X className="w-3 h-3" />
      </button>
    )}
    {filterYearRange && (
      <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
        {translateOption(YEAR_RANGES.find((r) => r.value === filterYearRange) ?? { value: filterYearRange, label: filterYearRange }, isGreek).label} <X className="w-3 h-3" />
      </button>
    )}
    {(isPro || isMaiPropOsUser) && filterOwnership && (
      <button onClick={() => setFilterOwnership("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors">
        {translateOption(OWNERSHIP_STATUSES.find((s) => s.value === filterOwnership) ?? { value: filterOwnership, label: filterOwnership }, isGreek).label} <X className="w-3 h-3" />
      </button>
    )}
    {(isPro || isMaiPropOsUser) && filterRound && (
      <button onClick={() => setFilterRound("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
        {roundOptions.find((o) => o.value === filterRound)?.label || (isGreek ? `Γύρος ${filterRound}` : `Round ${filterRound}`)} <X className="w-3 h-3" />
      </button>
    )}
    {(isPro || isMaiPropOsUser) && filterYield && (
      <button onClick={() => setFilterYield("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
        {translateOption(YIELD_OPTIONS.find((option) => option.value === filterYield) ?? { value: filterYield, label: filterYield }, isGreek).label} <X className="w-3 h-3" />
      </button>
    )}
    <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">{isGreek ? "Εκκαθάριση" : "Clear all"}</button>
  </div>
);

/**
 * Desktop advanced filters panel (shown when showFilters=true) plus the
 * active-filter chips row shown beneath the toolbar when filters are active.
 */
export const AuctionFiltersPanel = ({ // skipcq: JS-W1044
  showFilters,
  selectedCity,
  setSelectedCity,
  cityOptions,
  filterType,
  setFilterType,
  filterBidRange,
  setFilterBidRange,
  filterYearRange,
  setFilterYearRange,
  filterOwnership,
  setFilterOwnership,
  filterRound,
  setFilterRound,
  filterYield,
  setFilterYield,
  roundOptions,
  isPro,
  isMaiPropOsUser,
  activeFilterCount,
  clearFilters,
}: AuctionFiltersPanelProps) => {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const localizedRoundOptions = roundOptions.map((option) => {
    if (!isGreek) return option;
    if (!option.value) return { ...option, label: "Όλοι οι γύροι" };
    return { ...option, label: option.label.replace("Auction", "πλειστηριασμός").replace("Round", "Γύρος") };
  });

  return (
  <>
    {showFilters && (
      <div id="desktop-auction-filters" className="mt-4 p-5 bg-card/95 border border-border rounded-2xl space-y-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" /> {isGreek ? "Φίλτρα πλειστηριασμών" : "Auction Filters"}
          </span>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" /> {isGreek ? "Εκκαθάριση" : "Clear all"}
            </button>
          )}
        </div>

        {/* Standard filters */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{isGreek ? "Βασικά φίλτρα" : "Standard Filters"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FilterSelect
              id="filter-city"
              label={isGreek ? "Πόλη" : "City"}
              value={selectedCity}
              onChange={setSelectedCity}
              options={cityOptions.map((c) => ({ value: c, label: c }))}
            />
            <FilterSelect
              id="filter-type"
              label={isGreek ? "Τύπος ακινήτου" : "Property Type"}
              value={filterType}
              onChange={setFilterType}
              options={translateOptions(PROPERTY_TYPES, isGreek)}
            />
            <FilterSelect
              id="filter-bid"
              label={isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price"}
              value={filterBidRange}
              onChange={setFilterBidRange}
              options={translateOptions(BID_RANGES, isGreek)}
            />
            <FilterSelect
              id="filter-year"
              label={isGreek ? "Έτος κατασκευής" : "Construction Year"}
              value={filterYearRange}
              onChange={setFilterYearRange}
              options={translateOptions(YEAR_RANGES, isGreek)}
            />
          </div>
        </div>

        {/* Premium filters: Ownership, Round, Yield */}
        <div className="pt-4 border-t border-border -mx-5 px-5 pb-1 rounded-b-2xl">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            {isGreek ? "Περισσότερα φίλτρα" : "More Filters"}
            {!isPro && !isMaiPropOsUser && <PremiumBadge />}
          </p>
          {isPro || isMaiPropOsUser ? (
            <PremiumFiltersGrid
              filterOwnership={filterOwnership}
              setFilterOwnership={setFilterOwnership}
              filterRound={filterRound}
              setFilterRound={setFilterRound}
              roundOptions={localizedRoundOptions}
              filterYield={filterYield}
              setFilterYield={setFilterYield}
              isGreek={isGreek}
            />
          ) : (
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-secondary/50 border border-border sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    {isGreek ? "Καθεστώς κυριότητας, γύρος πλειστηριασμού & εκτ. μισθωτική απόδοση" : "Ownership Status, Auction Round & Est. Rental Yield"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {isGreek ? "Αναβαθμίστε σε Pro για να ξεκλειδώσετε αυτά τα φίλτρα." : "Upgrade to Pro to unlock these filters."}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full border-primary/40 text-primary hover:bg-primary/10 sm:w-auto sm:shrink-0" asChild>
                <Link to="/pricing">{isGreek ? "Αναβάθμιση σε Pro" : "Upgrade to Pro"}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Active filter chips — shown when panel is closed */}
    {activeFilterCount > 0 && !showFilters && (
      <ActiveFilterChips
        filterType={filterType} setFilterType={setFilterType}
        filterBidRange={filterBidRange} setFilterBidRange={setFilterBidRange}
        filterYearRange={filterYearRange} setFilterYearRange={setFilterYearRange}
        filterOwnership={filterOwnership} setFilterOwnership={setFilterOwnership}
        filterRound={filterRound} setFilterRound={setFilterRound}
        filterYield={filterYield} setFilterYield={setFilterYield}
        roundOptions={localizedRoundOptions}
        isPro={isPro} isMaiPropOsUser={isMaiPropOsUser}
        clearFilters={clearFilters}
        isGreek={isGreek}
      />
    )}
  </>
  );
};
