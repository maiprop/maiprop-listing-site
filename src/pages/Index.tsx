import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, ChevronDown, Users, ArrowRight, Gavel, Flame, ExternalLink, BarChart2, Globe, Maximize2, ListFilter, CalendarCheck, HandshakeIcon, Sparkles, Check, X, Loader2, Lightbulb, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { mockProperties } from "@/data/mockProperties";
import { PROPERTY_TYPES, PROPERTY_GROUPS, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import heroBg from "@/assets/hero-bg.jpg";

const RECENT_SEARCHES_KEY = "maiprop_recent_searches";
const MAX_RECENT = 6;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentSearch(query: string) {
  if (!query.trim()) return;
  const existing = getRecentSearches().filter(s => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([query, ...existing].slice(0, MAX_RECENT)));
}

function removeRecentSearch(query: string) {
  const existing = getRecentSearches().filter(s => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(existing));
}

const stats = [
  { value: "47,000+", label: "Active Listings" },
  { value: "€2.4B", label: "Properties Sold" },
  { value: "12,500+", label: "Verified Agents" },
  { value: "3,200+", label: "Monthly Auctions" },
];

const PROPERTY_TYPE_COUNTS: Record<string, number> = {
  apartment: 18420,
  house: 9240,
  villa: 3150,
  commercial: 4180,
  land: 6350,
  office: 1820,
};

const howItWorks = [
  {
    step: "1", icon: ListFilter, title: "Tell us what you're looking for",
    desc: "Search by location, budget, or property type — or let our AI suggest options based on your lifestyle and goals.",
    color: "text-primary", bg: "bg-primary/10",
  },
  {
    step: "2", icon: CalendarCheck, title: "Explore & schedule viewings",
    desc: "Browse verified listings with photos, maps, and AI-powered insights. Book in-person or online viewings in seconds.",
    color: "text-brand-emerald", bg: "bg-brand-emerald/10",
  },
  {
    step: "3", icon: HandshakeIcon, title: "Move in with confidence",
    desc: "Connect with trusted lawyers, notaries, and agents. We guide you every step of the way — no surprises.",
    color: "text-accent", bg: "bg-accent/10",
  },
];

const popularCities = [
  { name: "Athens", listings: 24860, trend: "+1.2%", image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80" },
  { name: "Thessaloniki", listings: 8240, trend: "+0.8%", image: "https://images.unsplash.com/photo-1570939274717-7eda259b50ed?w=600&q=80" },
  { name: "Mykonos", listings: 1820, trend: "+2.3%", image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=600&q=80" },
  { name: "Santorini", listings: 1240, trend: "+1.9%", image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80" },
];

const AI_SUGGESTIONS = [
  "Quiet apartment near metro in Athens under 200k",
  "3 bed villa with pool for rent in Mykonos",
  "Studio with parking in Thessaloniki under 80k",
  "New build energy A+ apartment in Athens",
];

// ── Property Type Dropdown ─────────────────────────────────────────────────────
function PropertyTypeDropdown({
  value, onChange,
}: {
  value: string;
  onChange: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const commercialType = PROPERTY_TYPE_MAP["commercial"];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentType = value ? PROPERTY_TYPE_MAP[value as PropertyTypeKey] : null;
  const label = currentType ? `${currentType.emoji} ${currentType.label}` : "Property type";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 h-full cursor-pointer hover:bg-muted transition-colors whitespace-nowrap ${value ? "text-primary" : "text-muted-foreground"}`}
      >
        <span className="text-sm">{label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[220px] max-h-[400px] overflow-y-auto">
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${!value ? "text-primary bg-primary/10" : "text-foreground"}`}
          >
            <span>🏘️</span><span className="font-medium">All Types</span>
            {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <div className="h-px bg-border mx-2" />

          {PROPERTY_GROUPS.map((group, gi) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <span className="text-xs">{group.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
              </div>
              {group.id === "commercial" ? (
                commercialType.subtypes.map(st => (
                  <button
                    key={st.value}
                    onClick={() => { onChange("commercial"); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 pl-6 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === "commercial" ? "text-primary bg-primary/10" : "text-foreground"}`}
                  >
                    <span className="text-base">🏪</span>
                    <span>{st.label}</span>
                    {value === "commercial" && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                )).slice(0, 1).concat(
                  <button
                    key="commercial-all"
                    onClick={() => { onChange("commercial"); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 pl-6 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === "commercial" ? "text-primary bg-primary/10" : "text-foreground"}`}
                  >
                    <span className="text-base">🏪</span>
                    <span className="font-medium">All Commercial</span>
                    {value === "commercial" && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ).slice(-1)
              ) : (
                group.types.map(typeKey => {
                  const pt = PROPERTY_TYPE_MAP[typeKey];
                  return (
                    <button
                      key={pt.value}
                      onClick={() => { onChange(pt.value); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 pl-6 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === pt.value ? "text-primary bg-primary/10" : "text-foreground"}`}
                    >
                      <span>{pt.emoji}</span>
                      <span className="font-medium">{pt.label}</span>
                      {value === pt.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })
              )}
              {gi < PROPERTY_GROUPS.length - 1 && <div className="h-px bg-border mx-2 mt-1.5" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Search Modal ────────────────────────────────────────────────────────────
function AISearchModal({ onFiltersApplied, onClose }: {
  onFiltersApplied: (filters: Record<string, any>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const handleSearch = async (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", { body: { query: searchQuery } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      onFiltersApplied(data);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "AI search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 px-4 bg-background/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-elevated overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-primary/5">
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="font-display font-semibold text-sm">AI Property Search</p>
            <p className="text-[11px] text-muted-foreground">Describe what you're looking for in plain language</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 border border-border focus-within:border-primary transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") onClose(); }}
              placeholder="e.g. quiet apartment near metro in Athens under 200k..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              disabled={loading}
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-opacity"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-medium">Try these examples</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); handleSearch(s); }}
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recent-search-aware location input ─────────────────────────────────────────
function LocationInput({ value, onChange, onSearch }: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setRecents(getRecentSearches()), []);

  useEffect(() => {
    refresh();
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refresh]);

  const showDropdown = focused && recents.length > 0 && !value;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 relative">
      <div className="flex items-center gap-2 px-4 py-2.5 h-full min-h-[44px]">
        <MapPin className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          placeholder="City, area, or neighbourhood..."
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { refresh(); setFocused(true); }}
          onKeyDown={e => { if (e.key === "Enter") { setFocused(false); onSearch(); } if (e.key === "Escape") setFocused(false); }}
          className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none min-w-0"
        />
        {value && (
          <button onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-card border border-border rounded-2xl shadow-elevated overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Searches</span>
          </div>
          {recents.map(r => (
            <div key={r} className="flex items-center group px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(r); setFocused(false); onSearch(); }}>
              <Clock className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
              <span className="flex-1 text-sm text-foreground truncate">{r}</span>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={ev => { ev.stopPropagation(); removeRecentSearch(r); refresh(); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-border transition-all text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Index() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("Buy");
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [showAI, setShowAI] = useState(false);

  const listingTypeMap: Record<string, string> = {
    "Buy": "sale",
    "Rent": "rent",
    "Auctions": "auction",
    "Quick Sale": "firesale",
  };

  const handleSearch = () => {
    const lt = listingTypeMap[searchType];
    if (lt === "firesale") { navigate("/firesale"); return; }
    if (lt === "auction") { navigate("/auctions"); return; }
    if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
    const params = new URLSearchParams();
    if (searchQuery) params.set("city", searchQuery);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    if (lt) params.set("listing_type", lt);
    navigate(`/listings?${params.toString()}`);
  };

  const handleAIFilters = (filters: Record<string, any>) => {
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.listing_type) params.set("listing_type", filters.listing_type);
    if (filters.property_type) params.set("type", filters.property_type);
    if (filters.price_min != null || filters.price_max != null) params.set("price", `${filters.price_min ?? 0}-${filters.price_max ?? 9999999}`);
    if (filters.beds_min) params.set("beds_min", String(filters.beds_min));
    if (filters.sqm_min) params.set("sqm_min", String(filters.sqm_min));
    if (filters.features?.length) params.set("features", filters.features.join(","));
    navigate(`/listings?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      {showAI && <AISearchModal onFiltersApplied={handleAIFilters} onClose={() => setShowAI(false)} />}
      <CookieConsentBanner />

      {/* Hero */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Athens at night" className="w-full h-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(hsl(192 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(192 100% 50%) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="container relative z-10 py-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/12 border border-primary/25 mb-6 animate-fade-in">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-primary">Trusted by 12,500+ Greeks across Europe</span>
            </div>

            <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight mb-5 animate-fade-in-up">
              Your next home<br />
              is waiting for you<br />
              <span className="gradient-text-primary">in Greece</span>
            </h1>

            <p className="text-xl text-foreground/75 mb-3 max-w-xl animate-fade-in-up font-medium" style={{ animationDelay: "0.05s" }}>
              Buy, rent, or sell — simply and with confidence.
            </p>
            <p className="text-base text-muted-foreground mb-9 max-w-xl animate-fade-in-up leading-relaxed" style={{ animationDelay: "0.1s" }}>
              From family apartments to holiday villas, we make finding the right property in Greece easy, transparent, and stress-free.
            </p>

            {/* Search bar */}
            <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              {/* Frosted card */}
              <div className="relative bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-elevated overflow-visible"
                style={{ boxShadow: "0 8px 40px -8px hsl(var(--primary) / 0.15), 0 2px 0 0 hsl(var(--primary) / 0.08)" }}>

                {/* Type tabs */}
                <div className="flex gap-0.5 px-2 pt-2">
                  {[
                    { label: "Buy", emoji: "🏠" },
                    { label: "Rent", emoji: "🔑" },
                    { label: "Auctions", emoji: "⚖️" },
                    { label: "Quick Sale", emoji: "⚡" },
                  ].map(({ label, emoji }) => (
                    <button
                      key={label}
                      onClick={() => setSearchType(label)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        searchType === label
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <span className="text-base leading-none">{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="mx-3 mt-2 h-px bg-border/60" />

                {/* Search row */}
                <div className="flex gap-0 p-2">
                  {/* Location with recent searches */}
                  <div className="flex-1 min-w-0">
                    <LocationInput value={searchQuery} onChange={setSearchQuery} onSearch={handleSearch} />
                  </div>

                  {/* Vertical divider */}
                  <div className="w-px bg-border/60 mx-1 self-stretch my-1" />

                  {/* Property type */}
                  <PropertyTypeDropdown value={selectedPropertyType} onChange={setSelectedPropertyType} />

                  {/* Vertical divider */}
                  <div className="w-px bg-border/60 mx-1 self-stretch my-1" />

                  {/* AI Search */}
                  <button
                    onClick={() => setShowAI(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-primary hover:bg-primary/10 shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden lg:inline">AI Search</span>
                  </button>

                  {/* Search button */}
                  <Button
                    size="lg"
                    className="bg-primary hover:opacity-90 border-0 text-primary-foreground rounded-xl px-6 font-semibold shrink-0 ml-1"
                    onClick={handleSearch}
                  >
                    <Search className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Search</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Trust stats */}
            <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-7 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              {stats.map(stat => (
                <div key={stat.label} className="flex items-baseline gap-1.5">
                  <div className="font-display font-bold text-lg gradient-text-primary">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Price Index Strip */}
            <div className="mt-6 animate-fade-in-up" style={{ animationDelay: "0.35s" }}>
              <div className="inline-flex items-center gap-0.5 rounded-2xl bg-card/60 backdrop-blur border border-border/60 px-1 py-1 shadow-card overflow-x-auto">
                <div className="px-3 py-1 flex items-center gap-1.5 shrink-0">
                  <BarChart2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg €/m²</span>
                </div>
                <div className="w-px h-5 bg-border/60 shrink-0" />
                {[
                  { city: "Athens", sale: 2180, rent: 11.4, trend: "+4.2%", up: true },
                  { city: "Thessaloniki", sale: 1640, rent: 8.9, trend: "+2.8%", up: true },
                  { city: "Mykonos", sale: 6200, rent: 42, trend: "+7.1%", up: true },
                  { city: "Santorini", sale: 5100, rent: 36, trend: "+5.3%", up: true },
                  { city: "Crete", sale: 1890, rent: 9.2, trend: "+1.4%", up: true },
                ].map((item, i) => (
                  <div key={item.city} className="flex items-center gap-0 shrink-0">
                    {i > 0 && <div className="w-px h-5 bg-border/40 mx-0.5 shrink-0" />}
                    <Link to={`/listings?city=${item.city}`}
                      className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-secondary/80 transition-colors group">
                      <span className="text-xs font-semibold text-foreground/80 group-hover:text-foreground">{item.city}</span>
                      <div className="text-right">
                        <span className="text-xs font-bold text-foreground">€{item.sale.toLocaleString()}</span>
                        <span className={`ml-1.5 text-[10px] font-semibold ${item.up ? "text-brand-emerald" : "text-destructive"}`}>{item.trend}</span>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 ml-2">Sale price per m² · Updated monthly</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-card/40 border-y border-border">
        <div className="container">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl font-bold">How it works</h2>
            <p className="text-muted-foreground mt-2">From search to keys — three simple steps</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-primary/40 via-brand-emerald/40 to-accent/40" style={{ top: "2rem" }} />
            {howItWorks.map(step => (
              <div key={step.step} className="relative flex flex-col items-center text-center gap-4 p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all group">
                <div className="relative">
                  <div className={`w-14 h-14 rounded-2xl ${step.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <step.icon className={`w-6 h-6 ${step.color}`} />
                  </div>
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {step.step}
                  </div>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Browse by Type */}
      <section className="py-14 container">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            All listings <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {PROPERTY_TYPES.filter(t => t.value !== "office").map(type => (
            <Link key={type.value} to={`/listings?type=${type.value}`}>
              <div className="glass-card rounded-xl p-4 flex flex-col items-center text-center hover:border-primary/40 hover:bg-primary/5 transition-all group gap-2">
                <div className={`w-12 h-12 rounded-xl ${type.bgClass} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                  {type.emoji}
                </div>
                <div className="font-display font-semibold text-xs group-hover:text-primary transition-colors">{type.label}</div>
                <div className="text-[10px] text-muted-foreground">{(PROPERTY_TYPE_COUNTS[type.value] ?? 0).toLocaleString()}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured listings */}
      <section className="py-16 bg-card/30">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold">Featured Properties</h2>
              <p className="text-sm text-muted-foreground mt-1">Premium & verified listings</p>
            </div>
            <Button variant="outline" className="border-border" asChild>
              <Link to="/listings">View All</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mockProperties.filter(p => p.isFeatured || p.isPremium).slice(0, 4).map(property => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </div>
      </section>

      {/* Auctions spotlight */}
      <section className="py-16 container">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gavel className="w-5 h-5 text-brand-gold" />
              <span className="text-xs font-semibold text-brand-gold uppercase tracking-widest">Greek Auctions</span>
            </div>
            <h2 className="font-display text-2xl font-bold">This Week's Auctions</h2>
            <p className="text-sm text-muted-foreground mt-1">Judicial & bank repo auctions — live from Greek courts</p>
          </div>
          <Button variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10" asChild>
            <Link to="/auctions">All Auctions <ArrowRight className="w-3 h-3 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockProperties.filter(p => p.listingType === "auction").map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      {/* Firesale CTA */}
      <section className="py-16 container">
        <div className="relative rounded-3xl overflow-hidden bg-card border border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-transparent to-transparent" />
          <div className="absolute right-0 top-0 w-1/2 h-full opacity-10"
            style={{ background: "radial-gradient(circle at top right, hsl(0 72% 55%), transparent 60%)" }}
          />
          <div className="relative p-10 md:p-16 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-5 h-5 text-destructive" />
                <span className="text-xs font-bold text-destructive uppercase tracking-widest">Firesale™ Instant Offer</span>
              </div>
              <h2 className="font-display text-4xl font-bold mb-4">
                Sell Your Property <br />
                <span className="gradient-text-primary">in 48 Hours</span>
              </h2>
              <p className="text-muted-foreground mb-6">
                Get a guaranteed cash offer for your property powered by our AI valuation engine. No agents, no waiting, no stress.
              </p>
              <Button size="lg" className="bg-gradient-primary border-0 text-primary-foreground" asChild>
                <Link to="/firesale">Get Instant Offer <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "48h", label: "Average Closing" },
                { value: "100%", label: "Cash Offers" },
                { value: "€0", label: "Agent Fees" },
                { value: "AI", label: "Valuation Engine" },
              ].map(item => (
                <div key={item.label} className="glass-card rounded-xl p-4 text-center">
                  <div className="font-display text-2xl font-bold gradient-text-cyan">{item.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Popular cities */}
      <section className="py-16 container">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Popular Locations</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            Explore All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {popularCities.map(city => (
            <Link key={city.name} to={`/listings?city=${city.name}`}>
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] group">
                <img src={city.image} alt={city.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="font-display font-bold text-lg">{city.name}</div>
                  <div className="text-xs text-muted-foreground">{city.listings.toLocaleString()} listings</div>
                  <div className="text-xs text-brand-emerald font-semibold">{city.trend}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pro directory CTA — immersive */}
      <section className="py-20 container">
        <div className="relative rounded-3xl overflow-hidden border border-accent/20"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 6%), hsl(265 40% 10%), hsl(183 100% 5%))" }}>
          <div className="absolute top-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-25"
            style={{ background: "radial-gradient(hsl(265 80% 60%), transparent 70%)" }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-20"
            style={{ background: "radial-gradient(hsl(183 100% 42%), transparent 70%)" }} />

          <div className="relative p-10 md:p-14 lg:p-16">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: copy */}
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/20 border border-accent/40 mb-6">
                  <Users className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs font-bold text-accent uppercase tracking-widest">Pro Network</span>
                </div>
                <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight mb-4 text-foreground">
                  The right expert,<br />
                  <span className="gradient-text-cyan">one click away</span>
                </h2>
                <p className="text-foreground/70 text-lg leading-relaxed mb-8">
                  Every transaction needs a team. Architects, lawyers, notaries, engineers, contractors — all vetted, verified, and rated by real clients.
                </p>
                <Button size="lg" className="bg-gradient-accent border-0 text-accent-foreground font-semibold px-8 gap-2" asChild>
                  <Link to="/professionals">Explore Directory <ArrowRight className="w-4 h-4" /></Link>
                </Button>
              </div>

              {/* Right: profession cards grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { emoji: "🏛️", title: "Architects", count: "340+", color: "text-primary", border: "border-primary/30", bg: "bg-primary/15" },
                  { emoji: "⚖️", title: "Lawyers", count: "180+", color: "text-brand-gold", border: "border-brand-gold/30", bg: "bg-brand-gold/15" },
                  { emoji: "📋", title: "Notaries", count: "95+", color: "text-brand-emerald", border: "border-brand-emerald/30", bg: "bg-brand-emerald/15" },
                  { emoji: "🔧", title: "Engineers", count: "520+", color: "text-accent", border: "border-accent/30", bg: "bg-accent/15" },
                  { emoji: "🏗️", title: "Contractors", count: "410+", color: "text-brand-purple", border: "border-brand-purple/30", bg: "bg-brand-purple/15" },
                  { emoji: "🏡", title: "Property Mgrs", count: "230+", color: "text-brand-sky", border: "border-brand-sky/30", bg: "bg-brand-sky/15" },
                ].map(pro => (
                  <Link key={pro.title} to={`/professionals`}>
                    <div className={`group flex items-center gap-3 p-4 rounded-2xl bg-card border ${pro.border} hover:bg-card/80 transition-all`}>
                      <div className={`w-10 h-10 rounded-xl ${pro.bg} flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform`}>
                        {pro.emoji}
                      </div>
                      <div>
                        <div className={`font-bold text-sm ${pro.color}`}>{pro.title}</div>
                        <div className="text-xs text-foreground/60">{pro.count} verified</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── mAI Prop OS ── */}
      <section className="py-20 bg-card/30 overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-5">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Powered by mAI Prop OS</span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Greece's Real Estate <br />
                <span className="gradient-text-primary">Data Gateway</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Every listing on maiProp is powered by mAI Prop OS — our proprietary data platform aggregating Greek cadastre records, judicial auctions, price indices, and predictive analytics into one live dashboard.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Real-time €/m² indices for every Greek region",
                  "3,200+ monthly judicial & bank auctions",
                  "AI-powered investment scoring & portfolio tools",
                  "Automated property reports in minutes",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2 glow-cyan" asChild>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                    Open mAI Prop OS <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="border-border gap-2" asChild>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">Learn More</a>
                </Button>
              </div>
            </div>

            {/* Live iframe preview */}
            <div className="relative">
              <div className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(183 100% 42%), transparent 70%)" }} />
              <div className="relative rounded-2xl overflow-hidden border border-primary/30 shadow-elevated glow-cyan group">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">os.maiprop.co</span>
                  </div>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer"
                    className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                    <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </div>
                {/* Live iframe — scaled down to fit, cookie banners blocked via sandbox */}
                <div className="relative aspect-[16/10] bg-background overflow-hidden">
                  <iframe
                    src="https://os.maiprop.co"
                    title="mAI Prop OS"
                    className="absolute top-0 left-0 w-[200%] h-[200%] origin-top-left pointer-events-none"
                    style={{ transform: "scale(0.5)" }}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                  />
                  {/* Clickable overlay */}
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer"
                    className="absolute inset-0 flex items-end justify-end p-4">
                    <span className="flex items-center gap-2 bg-primary/90 backdrop-blur text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <ExternalLink className="w-3.5 h-3.5" /> Open mAI Prop OS
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Greek Golden Visa ── */}
      <section className="py-20 overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Live iframe preview */}
            <div className="relative order-last lg:order-first">
              <div className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(42 95% 55%), transparent 70%)" }} />
              <div className="relative rounded-2xl overflow-hidden border border-brand-gold/30 shadow-elevated group"
                style={{ boxShadow: "0 0 30px -5px hsl(42 95% 55% / 0.3)" }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">properties.maiprop.co</span>
                  </div>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer"
                    className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                    <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </div>
                {/* Live iframe */}
                <div className="relative aspect-[16/10] bg-background overflow-hidden">
                  <iframe
                    src="https://properties.maiprop.co"
                    title="maiProp Properties"
                    className="absolute top-0 left-0 w-[200%] h-[200%] origin-top-left pointer-events-none"
                    style={{ transform: "scale(0.5)" }}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                  />
                  {/* Clickable overlay */}
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer"
                    className="absolute inset-0 flex items-end justify-end p-4">
                    <span className="flex items-center gap-2 bg-brand-gold/90 backdrop-blur text-background text-xs font-semibold px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <ExternalLink className="w-3.5 h-3.5" /> Open Properties Portal
                    </span>
                  </a>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/20 mb-5">
                <span className="text-xs font-semibold text-brand-gold uppercase tracking-wide">Greek Golden Visa</span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Secure EU Residency <br />
                <span className="gradient-text-gold">Through Greek Property</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Our dedicated investment properties portal showcases curated €250K+ properties eligible for the Greek Golden Visa program — your gateway to EU residency, freedom of movement, and long-term capital growth.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Minimum €250K investment for EU residency",
                  "6–9 months to visa approval",
                  "Access for family including spouse & children",
                  "Strongest real estate yields in Southern Europe",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" asChild>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Explore Properties <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10" asChild>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Golden Visa Guide
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
