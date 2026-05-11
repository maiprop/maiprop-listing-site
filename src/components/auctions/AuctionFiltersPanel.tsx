import { SlidersHorizontal, X, Lock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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

/** Shared wrapper that gives every select the same chevron indicator + a11y association. */
const FilterSelect = ({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
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
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
    </div>
  </div>
);

/**
 * Desktop advanced filters panel (shown when showFilters=true) plus the
 * active-filter chips row shown beneath the toolbar when filters are active.
 */
export function AuctionFiltersPanel({
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
}: AuctionFiltersPanelProps) {
  return (
    <>
      {showFilters && (
        <div className="mt-4 p-5 bg-card/95 border border-border rounded-2xl space-y-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-primary" /> Auction Filters
            </span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          {/* Standard filters */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Standard Filters</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FilterSelect id="filter-city" label="City" value={selectedCity} onChange={setSelectedCity}>
                {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>

              <FilterSelect id="filter-type" label="Property Type" value={filterType} onChange={setFilterType}>
                {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </FilterSelect>

              <FilterSelect id="filter-bid" label="Starting Bid" value={filterBidRange} onChange={setFilterBidRange}>
                {BID_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </FilterSelect>

              <FilterSelect id="filter-year" label="Construction Year" value={filterYearRange} onChange={setFilterYearRange}>
                {YEAR_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </FilterSelect>
            </div>
          </div>

          {/* Premium filters: Ownership, Round, Yield */}
          <div className="pt-4 border-t border-border -mx-5 px-5 pb-1 rounded-b-2xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              More Filters
              {!isPro && !isMaiPropOsUser && <PremiumBadge />}
            </p>
            {isPro || isMaiPropOsUser ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FilterSelect id="filter-ownership" label="Ownership Status" value={filterOwnership} onChange={setFilterOwnership}>
                  {OWNERSHIP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </FilterSelect>

                <FilterSelect id="filter-round" label="Auction Round" value={filterRound} onChange={setFilterRound}>
                  {roundOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>

                <FilterSelect
                  id="filter-yield"
                  label={<>Est. Rental Yield <span className="ml-1.5 text-[10px] text-muted-foreground/60">(city benchmark × sqm / bid)</span></>}
                  value={filterYield}
                  onChange={setFilterYield}
                >
                  <option value="">Any Yield</option>
                  <option value="low">Under 3% — Low yield</option>
                  <option value="medium">3% – 6% — Average</option>
                  <option value="high">6% – 9% — Good</option>
                  <option value="very_high">9%+ — High yield opportunity</option>
                </FilterSelect>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Ownership Status, Auction Round &amp; Est. Rental Yield</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Upgrade to Pro to unlock these filters.</p>
                </div>
                <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 shrink-0" asChild>
                  <Link to="/pricing">Upgrade to Pro</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active filter chips — shown when panel is closed */}
      {activeFilterCount > 0 && !showFilters && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Active:</span>
          {filterType && (
            <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors capitalize">
              {filterType} <X className="w-3 h-3" />
            </button>
          )}
          {filterBidRange && (
            <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
              {BID_RANGES.find((r) => r.value === filterBidRange)?.label} <X className="w-3 h-3" />
            </button>
          )}
          {filterYearRange && (
            <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
              {YEAR_RANGES.find((r) => r.value === filterYearRange)?.label} <X className="w-3 h-3" />
            </button>
          )}
          {(isPro || isMaiPropOsUser) && filterOwnership && (
            <button onClick={() => setFilterOwnership("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors">
              {OWNERSHIP_STATUSES.find((s) => s.value === filterOwnership)?.label} <X className="w-3 h-3" />
            </button>
          )}
          {(isPro || isMaiPropOsUser) && filterRound && (
            <button onClick={() => setFilterRound("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
              {roundOptions.find((o) => o.value === filterRound)?.label || `Round ${filterRound}`} <X className="w-3 h-3" />
            </button>
          )}
          {(isPro || isMaiPropOsUser) && filterYield && (
            <button onClick={() => setFilterYield("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
              Yield: {filterYield.replace("_", " ")} <X className="w-3 h-3" />
            </button>
          )}
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
        </div>
      )}
    </>
  );
}
