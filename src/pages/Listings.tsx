import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, MapPin, LayoutGrid, Map, ChevronDown, X, Gavel, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { mockProperties } from "@/data/mockProperties";

const priceRanges = [
  { label: "Any Price", value: "" },
  { label: "Under €100k", value: "0-100000" },
  { label: "€100k – €300k", value: "100000-300000" },
  { label: "€300k – €600k", value: "300000-600000" },
  { label: "€600k – €1M", value: "600000-1000000" },
  { label: "€1M+", value: "1000000-9999999" },
];

const propertyTypeOptions = [
  { label: "All Types", value: "" },
  { label: "Apartment", value: "apartment" },
  { label: "House / Villa", value: "house" },
  { label: "Commercial", value: "commercial" },
  { label: "Land", value: "land" },
];

const sortOptions = [
  { label: "Most Relevant", value: "relevant" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Newest First", value: "newest" },
  { label: "AI Score", value: "ai-score" },
];

export default function Listings() {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "");
  const [selectedPrice, setSelectedPrice] = useState("");
  const [selectedSort, setSelectedSort] = useState("relevant");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("city") || "");

  const activeFilters = [
    selectedType && propertyTypeOptions.find(o => o.value === selectedType)?.label,
    selectedPrice && priceRanges.find(o => o.value === selectedPrice)?.label,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      <div className="pt-16">
        {/* Search bar */}
        <div className="bg-card border-b border-border sticky top-16 z-40">
          <div className="container py-4">
            <div className="flex gap-3 flex-wrap">
              {/* Main search */}
              <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="City, area, or address..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>

              {/* Type filter */}
              <div className="relative">
                <select
                  value={selectedType}
                  onChange={e => setSelectedType(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-4 py-2.5 pr-8 text-sm text-foreground cursor-pointer"
                >
                  {propertyTypeOptions.map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>

              {/* Price filter */}
              <div className="relative">
                <select
                  value={selectedPrice}
                  onChange={e => setSelectedPrice(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-4 py-2.5 pr-8 text-sm text-foreground cursor-pointer"
                >
                  {priceRanges.map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={selectedSort}
                  onChange={e => setSelectedSort(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-4 py-2.5 pr-8 text-sm text-foreground cursor-pointer"
                >
                  {sortOptions.map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>

              {/* More filters */}
              <Button
                variant="outline"
                className={`border-border gap-2 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilters.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </Button>

              {/* View toggle */}
              <div className="flex rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  <Map className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active filters */}
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-muted-foreground">Active:</span>
                {activeFilters.map(filter => (
                  <span key={filter} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">
                    {filter}
                    <X className="w-3 h-3 cursor-pointer hover:text-foreground" />
                  </span>
                ))}
                <button className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="bg-card border-b border-border">
            <div className="container py-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Bedrooms */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Bedrooms</label>
                  <div className="flex gap-1">
                    {["Any", "1+", "2+", "3+", "4+"].map(val => (
                      <button key={val} className="flex-1 py-1.5 text-xs rounded-lg bg-secondary border border-border hover:border-primary/40 hover:text-primary transition-colors">
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Size */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Min. Size (m²)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                </div>
                {/* Features */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Features</label>
                  <div className="flex gap-2 flex-wrap">
                    {["Pool", "Parking", "Elevator", "Sea View", "Garden", "Smart Home"].map(feat => (
                      <button key={feat} className="px-2.5 py-1 text-xs rounded-full bg-secondary border border-border hover:border-primary/40 hover:text-primary transition-colors">
                        {feat}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Listing type */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Listing Type</label>
                  <div className="flex gap-1 flex-col">
                    {["All", "Standard", "Auction", "Firesale"].map(type => (
                      <button key={type} className="py-1.5 text-xs rounded-lg bg-secondary border border-border hover:border-primary/40 hover:text-primary transition-colors text-left px-2">
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-col justify-end gap-2">
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground">Apply Filters</Button>
                  <Button size="sm" variant="outline" className="border-border" onClick={() => setShowFilters(false)}>Reset</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="container py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="font-display font-semibold">{mockProperties.length} properties</span>
              <span className="text-muted-foreground text-sm ml-1">found</span>
            </div>
            {/* Auction banner */}
            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-gold/10 border border-brand-gold/20">
              <Gavel className="w-4 h-4 text-brand-gold" />
              <span className="text-sm text-brand-gold font-medium">47 auctions this week</span>
              <Button size="sm" variant="ghost" className="text-brand-gold hover:bg-brand-gold/10 ml-1 h-6 px-2 text-xs" asChild>
                <a href="/auctions">View →</a>
              </Button>
            </div>
          </div>

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {mockProperties.map((property, i) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden aspect-[16/7] flex items-center justify-center">
              <div className="text-center">
                <Map className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Interactive map view</p>
                <p className="text-xs text-muted-foreground mt-1">Connect to Mapbox or Google Maps API to enable</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
