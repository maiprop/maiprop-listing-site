import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addRecentSearch } from "@/lib/recentSearches";
import { getProfessionalSearchSuggestions } from "@/lib/professionalServiceCatalog";
import { PropertyTypeDropdown } from "@/components/index/PropertyTypeDropdown";
import { AISearchModal } from "@/components/index/AISearchModal";
import { LocationInput } from "@/components/index/LocationInput";
import { ServiceInput } from "@/components/index/ServiceInput";

const MarketTicker = lazy(() => import("@/components/MarketTicker").then(m => ({ default: m.MarketTicker })));

const PROFESSIONAL_SUGGESTIONS = getProfessionalSearchSuggestions();
const HERO_VIDEO_WEBM_SRC = "/hero-bg.webm";
const HERO_VIDEO_MP4_SRC = "/hero-bg.mp4";

const LISTING_TYPE_MAP: Record<string, string> = {
  Buy: "sale",
  Rent: "rent",
  Auctions: "auction",
};

export function HeroSection() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("Buy");
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [professionalService, setProfessionalService] = useState("");
  const [showAI, setShowAI] = useState(false);
  const [heroVideoReady, setHeroVideoReady] = useState(false);

  // Keep the decorative video just behind first paint, not seconds behind it.
  // The poster protects LCP, while the short idle delay prevents the video from
  // competing with the search UI on the first frame.
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const scheduleIdle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 900));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      idleId = scheduleIdle(() => setHeroVideoReady(true), { timeout: 1200 });
    }, 900);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined) cancelIdle(idleId);
    };
  }, []);

  const handleSearch = () => {
    if (searchType === "Professionals") {
      const q = (professionalService || searchQuery).trim().toLowerCase();
      const params = new URLSearchParams();
      const match = PROFESSIONAL_SUGGESTIONS.find(
        (s) => s.category === q || s.label.toLowerCase() === q || s.category.replace(/_/g, " ") === q,
      );
      if (match) params.set("category", match.category);
      else if (q) params.set("search", q);
      navigate(`/professionals?${params.toString()}`);
      return;
    }
    const lt = LISTING_TYPE_MAP[searchType];
    if (lt === "firesale") { navigate("/firesale"); return; }
    if (lt === "auction") { navigate("/auctions"); return; }
    if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
    const params = new URLSearchParams();
    if (searchQuery) params.set("city", searchQuery);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    if (lt) params.set("listing_type", lt);
    navigate(`/listings?${params.toString()}`);
  };

  const handleProfessionalSearch = (category: string) => {
    setProfessionalService(category);
    navigate(`/professionals?category=${category}`);
  };

  const handleAIFilters = (filters: Record<string, unknown>) => {
    const params = new URLSearchParams();

    // Cap numeric values from the AI response so a malformed/hostile suggestion
    // can never inject garbage or absurd numbers into the listings URL.
    const PRICE_MAX = 1_000_000_000;
    const BEDS_MAX = 100;
    const SQM_MAX = 100_000;

    const clampInt = (v: unknown, lo: number, hi: number): number | null => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(n)) return null;
      return Math.max(lo, Math.min(hi, Math.round(n)));
    };

    const asString = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 80) : null;

    const city = asString(filters.city);
    if (city) params.set("city", city);
    const listingType = asString(filters.listing_type);
    if (listingType) params.set("listing_type", listingType);
    const propertyType = asString(filters.property_type);
    if (propertyType) params.set("type", propertyType);

    const priceMin = clampInt(filters.price_min, 0, PRICE_MAX);
    const priceMax = clampInt(filters.price_max, 0, PRICE_MAX);
    if (priceMin != null || priceMax != null) {
      params.set("price", `${priceMin ?? 0}-${priceMax ?? PRICE_MAX}`);
    }

    const bedsMin = clampInt(filters.beds_min, 0, BEDS_MAX);
    if (bedsMin) params.set("beds_min", String(bedsMin));
    const sqmMin = clampInt(filters.sqm_min, 0, SQM_MAX);
    if (sqmMin) params.set("sqm_min", String(sqmMin));

    if (Array.isArray(filters.features) && filters.features.length) {
      const features = filters.features
        .filter((f): f is string => typeof f === "string")
        .slice(0, 30);
      if (features.length) params.set("features", features.join(","));
    }

    navigate(`/listings?${params.toString()}`);
  };

  const professionalInputValue = searchType === "Professionals" ? searchQuery : "";

  return (
    <>
      {showAI && <AISearchModal onFiltersApplied={handleAIFilters} onClose={() => setShowAI(false)} />}

      <section className="relative min-h-[100svh] flex items-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* Video background */}
          <video
            autoPlay
            muted
            loop
            playsInline
            preload={heroVideoReady ? "metadata" : "none"}
            poster="/hero-poster.jpg"
            aria-hidden="true"
            className="hero-video absolute inset-0 w-full h-full object-cover opacity-100 dark:opacity-70"
            style={{ objectPosition: "center center", backfaceVisibility: "hidden" }}
          >
            {heroVideoReady && (
              <>
                <source src={HERO_VIDEO_WEBM_SRC} type="video/webm" />
                <source src={HERO_VIDEO_MP4_SRC} type="video/mp4" />
              </>
            )}
          </video>
          {/* Strong dark overlay for text readability */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, hsl(25 20% 4% / 0.88) 0%, hsl(25 15% 8% / 0.60) 55%, hsl(30 10% 10% / 0.18) 100%)",
            }}
          />
          {/* Bottom fade into next section */}
          <div className="absolute inset-x-0 bottom-0 h-48 sm:h-56 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 z-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-purple)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-purple)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Glow orb */}
        <div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-10 z-0"
          style={{ background: "radial-gradient(hsl(var(--brand-cyan)), hsl(var(--brand-purple)), transparent 70%)" }}
        />

        <div className="container relative z-10 pt-20 pb-8 sm:pt-28 sm:pb-16 lg:pl-16 xl:pl-24 px-4">
          <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-8 lg:gap-12 items-end">
            {/* ── LEFT: Copy + Search ── */}
            <div className="text-white min-w-0">
              {/* Eyebrow */}
              <div className="relative inline-flex mb-3 sm:mb-7">
                <span
                  className="absolute inset-0 rounded-full animate-pulse"
                  style={{ boxShadow: "0 0 0 4px hsl(var(--brand-cyan) / 0.16), 0 0 18px 4px hsl(var(--brand-purple) / 0.12)" }}
                />
                <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/30 backdrop-blur-sm">
                  <span className="relative flex w-2 h-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "hsl(var(--brand-cyan))" }} />
                    <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: "hsl(var(--brand-cyan))" }} />
                  </span>
                  <span className="text-[11px] sm:text-xs font-semibold text-white">Greece's #1 AI-Powered Property Platform</span>
                </div>
              </div>

              {/* Headline */}
              <h1
                className="font-display font-black leading-[1.1] mb-4 sm:mb-6 text-white break-words"
                style={{ fontSize: "clamp(1.4rem, 6.5vw, 4.5rem)" }}
              >
                Find your perfect<br className="sm:hidden" /> property in Greece
                <div className="mt-1">
                  <span
                    className="bg-gradient-to-r from-white via-brand-cyan to-brand-purple bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(0,0,0,0.65)]"
                    style={{ fontSize: "clamp(1.5rem, 7vw, 4.8rem)" }}
                  >
                    with AI precision
                  </span>
                </div>
              </h1>

              {/* ── Search Card ── */}
              <div>
                <div
                  className="bg-card/90 backdrop-blur-2xl border border-border/70 rounded-2xl shadow-elevated overflow-visible"
                  style={{
                    boxShadow:
                      "0 12px 48px -8px hsl(var(--primary) / 0.2), 0 2px 0 0 hsl(var(--primary) / 0.08), inset 0 1px 0 0 hsl(var(--foreground) / 0.04)",
                  }}
                >
                  {/* Tabs */}
                  <div className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-none">
                    {[
                      { label: "Buy", emoji: "🏠" },
                      { label: "Rent", emoji: "🔑" },
                      { label: "Auctions", emoji: "⚖️" },
                      { label: "Professionals", emoji: "👔" },
                    ].map(({ label, emoji }) => (
                      <button
                        key={label}
                        onClick={() => setSearchType(label)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold font-display transition-all shrink-0 whitespace-nowrap min-h-[36px] ${
                          searchType === label
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                        }`}
                      >
                        <span className="text-sm leading-none">{emoji}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mx-3 mt-1.5 h-px bg-border/50" />

                  {/* Search rows */}
                  <div className="p-2">
                    {/* Location / Service input */}
                    <div className="mb-2 bg-secondary/60 rounded-xl border border-border/50 focus-within:border-primary/50 transition-colors">
                      {searchType === "Professionals" ? (
                        <ServiceInput
                          value={professionalInputValue}
                          onChange={(v) => {
                            setSearchQuery(v);
                            const m = PROFESSIONAL_SUGGESTIONS.find((s) => s.label === v);
                            setProfessionalService(m ? m.category : "");
                          }}
                          onSearch={handleProfessionalSearch}
                        />
                      ) : (
                        <LocationInput value={searchQuery} onChange={setSearchQuery} onSearch={handleSearch} />
                      )}
                    </div>

                    {/* Second row: type dropdown + AI + Search */}
                    <div className="flex gap-1.5 items-stretch">
                      {searchType !== "Professionals" && (
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <PropertyTypeDropdown value={selectedPropertyType} onChange={setSelectedPropertyType} />
                        </div>
                      )}
                      {searchType !== "Professionals" && (
                        <button
                          onClick={() => setShowAI(true)}
                          aria-label="AI-powered search"
                          className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all text-primary hover:bg-primary/10 shrink-0 border border-border min-w-[44px] min-h-[44px]"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="hidden sm:inline" aria-hidden="true">AI</span>
                        </button>
                      )}
                      <Button
                        size="default"
                        onClick={handleSearch}
                        aria-label={searchType === "Professionals" ? "Search professionals" : "Search properties"}
                        className={`bg-primary hover:opacity-90 border-0 text-primary-foreground rounded-xl font-semibold shrink-0 px-4 min-h-[44px] ${searchType === "Professionals" ? "flex-1" : ""}`}
                      >
                        <Search className="w-4 h-4 sm:mr-2" aria-hidden="true" />
                        <span className="hidden sm:inline">Search</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Live Market Ticker Card ── */}
            <div className="hidden lg:block relative">
              <div
                className="absolute -inset-6 rounded-3xl blur-3xl opacity-15"
                style={{ background: "radial-gradient(ellipse, hsl(var(--brand-cyan)), hsl(var(--brand-indigo)), hsl(var(--brand-purple)), transparent 70%)" }}
              />
              <div className="relative">
                <Suspense fallback={<div className="h-12 bg-muted animate-pulse rounded-lg" />}>
                  <MarketTicker />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
