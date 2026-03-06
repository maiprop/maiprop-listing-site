import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, SlidersHorizontal, MapPin, LayoutGrid, Map, ChevronDown,
  X, Gavel, ArrowUpDown, Loader2, Building2, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { mockProperties } from "@/data/mockProperties";
import { useListings } from "@/hooks/useListings";

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
  { label: "House", value: "house" },
  { label: "Villa", value: "villa" },
  { label: "Commercial", value: "commercial" },
  { label: "Land", value: "land" },
  { label: "Office", value: "office" },
];

const listingTypeOptions = [
  { label: "All", value: "" },
  { label: "For Sale", value: "sale" },
  { label: "For Rent", value: "rent" },
  { label: "Auction", value: "auction" },
];

const sortOptions = [
  { label: "Most Relevant", value: "relevant" },
  { label: "Price: Low → High", value: "price-asc" },
  { label: "Price: High → Low", value: "price-desc" },
  { label: "Newest First", value: "newest" },
  { label: "AI Score", value: "ai-score" },
  { label: "Most Viewed", value: "views" },
];

function dbListingToCard(l: any) {
  return {
    id: l.id,
    title: l.title,
    address: l.address || l.city,
    city: l.city,
    price: Number(l.price),
    pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
    bedrooms: l.bedrooms ?? undefined,
    bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm),
    floor: l.floor ?? undefined,
    totalFloors: l.total_floors ?? undefined,
    yearBuilt: l.year_built ?? undefined,
    energyClass: l.energy_class ?? undefined,
    images: [
      ...(l.cover_image_url ? [l.cover_image_url] : []),
      ...(l.listing_images?.map((img: any) => img.url) || []),
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=60",
    ].filter(Boolean).slice(0, 3),
    type: l.property_type as any,
    listingType: l.listing_type as any,
    auctionDate: l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
    auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
    aiScore: l.ai_score ?? undefined,
    views: l.views_count ?? undefined,
    agent: l.profiles ? {
      name: l.profiles.display_name || "Owner",
      verified: l.profiles.verified || false,
      avatar: l.profiles.avatar_url,
    } : undefined,
    tags: l.tags || [
      l.has_parking && "Parking",
      l.has_pool && "Pool",
      l.has_elevator && "Elevator",
      l.has_garden && "Garden",
      l.has_smart_home && "Smart Home",
    ].filter(Boolean) as string[],
    hasVideo: l.has_video_tour,
    hasVirtualTour: l.has_virtual_tour,
  };
}

export default function Listings() {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "");
  const [selectedListingType, setSelectedListingType] = useState("");
  const [selectedPrice, setSelectedPrice] = useState("");
  const [selectedSort, setSelectedSort] = useState("relevant");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("city") || "");
  const [minBeds, setMinBeds] = useState("");
  const [minSqm, setMinSqm] = useState("");

  const { data: dbListings = [], isLoading } = useListings({
    city: searchQuery || undefined,
    listing_type: selectedListingType || undefined,
    property_type: selectedType || undefined,
  });

  // Use DB data if available, else mock
  const sourceListings = dbListings.length > 0
    ? dbListings.map(dbListingToCard)
    : mockProperties;

  // Client-side filter & sort
  let filtered = sourceListings.filter(p => {
    if (selectedPrice) {
      const [min, max] = selectedPrice.split("-").map(Number);
      if (p.price < min || p.price > max) return false;
    }
    if (minBeds && p.bedrooms != null && p.bedrooms < Number(minBeds)) return false;
    if (minSqm && p.sqm < Number(minSqm)) return false;
    return true;
  });

  if (selectedSort === "price-asc") filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (selectedSort === "price-desc") filtered = [...filtered].sort((a, b) => b.price - a.price);
  if (selectedSort === "ai-score") filtered = [...filtered].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  if (selectedSort === "views") filtered = [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0));

  const activeFilters = [
    selectedType && propertyTypeOptions.find(o => o.value === selectedType)?.label,
    selectedListingType && listingTypeOptions.find(o => o.value === selectedListingType)?.label,
    selectedPrice && priceRanges.find(o => o.value === selectedPrice)?.label,
    minBeds && `${minBeds}+ beds`,
    minSqm && `${minSqm}m²+`,
  ].filter(Boolean) as string[];

  const clearFilter = (label: string) => {
    if (propertyTypeOptions.find(o => o.label === label)) setSelectedType("");
    if (listingTypeOptions.find(o => o.label === label)) setSelectedListingType("");
    if (priceRanges.find(o => o.label === label)) setSelectedPrice("");
    if (label.includes("beds")) setMinBeds("");
    if (label.includes("m²")) setMinSqm("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      <div className="pt-16">
        {/* Sticky search bar */}
        <div className="bg-card border-b border-border sticky top-16 z-40">
          <div className="container py-4">
            <div className="flex gap-2 flex-wrap items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="City, area, address..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                )}
              </div>

              {/* Listing type */}
              <div className="relative">
                <select value={selectedListingType} onChange={e => setSelectedListingType(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {listingTypeOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* Property type */}
              <div className="relative">
                <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {propertyTypeOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* Price */}
              <div className="relative">
                <select value={selectedPrice} onChange={e => setSelectedPrice(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {priceRanges.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select value={selectedSort} onChange={e => setSelectedSort(e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {sortOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* More filters */}
              <Button variant="outline"
                className={`border-border gap-2 shrink-0 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" /> Filters
                {activeFilters.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilters.length}</span>
                )}
              </Button>

              {/* View toggle */}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button onClick={() => setViewMode("grid")}
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")}
                  className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Map className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Active:</span>
                {activeFilters.map(filter => (
                  <button key={filter} onClick={() => clearFilter(filter)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">
                    {filter} <X className="w-3 h-3" />
                  </button>
                ))}
                <button onClick={() => { setSelectedType(""); setSelectedListingType(""); setSelectedPrice(""); setMinBeds(""); setMinSqm(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="bg-card border-b border-border">
            <div className="container py-5">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Min. Bedrooms</label>
                  <div className="flex gap-1">
                    {["", "1", "2", "3", "4"].map(val => (
                      <button key={val} onClick={() => setMinBeds(val)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${minBeds === val ? "bg-primary/10 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground hover:border-primary/40"}`}>
                        {val || "Any"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Min. Size (m²)</label>
                  <input type="number" placeholder="e.g. 50" value={minSqm} onChange={e => setMinSqm(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
                </div>
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
                <div className="flex flex-col justify-end gap-2 col-span-2 md:col-span-1">
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => setShowFilters(false)}>
                    Apply Filters
                  </Button>
                  <Button size="sm" variant="outline" className="border-border"
                    onClick={() => { setSelectedType(""); setSelectedListingType(""); setSelectedPrice(""); setMinBeds(""); setMinSqm(""); setShowFilters(false); }}>
                    Reset All
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="container py-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="font-display font-semibold">{filtered.length} properties</span>
              )}
              <span className="text-muted-foreground text-sm">
                {dbListings.length > 0 ? "from database" : "· showing demo listings"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-gold/10 border border-brand-gold/20">
                <Gavel className="w-4 h-4 text-brand-gold" />
                <span className="text-sm text-brand-gold font-medium">47 auctions this week</span>
                <Button size="sm" variant="ghost" className="text-brand-gold hover:bg-brand-gold/10 h-6 px-2 text-xs" asChild>
                  <Link to="/auctions">View →</Link>
                </Button>
              </div>
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-1.5" asChild>
                <Link to="/listings/new"><Building2 className="w-3.5 h-3.5" /> Post Listing</Link>
              </Button>
            </div>
          </div>

          {viewMode === "grid" ? (
            isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass-card rounded-xl p-16 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No properties found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((property) => (
                  <PropertyCard key={property.id} property={property as any} />
                ))}
              </div>
            )
          ) : (
            <div className="glass-card rounded-xl overflow-hidden aspect-[16/7] flex items-center justify-center">
              <div className="text-center">
                <Map className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Interactive map view</p>
                <p className="text-xs text-muted-foreground mt-1">Connect Mapbox or Google Maps to enable</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
