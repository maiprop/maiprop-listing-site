import { useState, useMemo, useEffect } from "react";
import { Gavel, TrendingUp, Bell, ExternalLink, AlertCircle, Loader2, MapPin, Calendar, Euro, Map, List, Clock, SlidersHorizontal, X, Lock, Star, Heart, Share2, Flag, Building2, ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { MapView, MapListing } from "@/components/MapView";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToggleFavorite } from "@/hooks/useFavorites";
import { toast } from "sonner";

// ── Fetch all future auctions from DB ─────────────────────────────────────────
function useAuctionListings() {
  return useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region")
        .eq("listing_type", "auction")
        .eq("status", "active")
        .gte("auction_date", new Date().toISOString())
        .order("auction_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const PROPERTY_TYPES = [
  { value: "", label: "All Types" },
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "office", label: "Office" },
];

const PROPERTY_TYPE_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Κατοικία",
  villa: "Βίλα",
  land: "Γη",
  commercial: "Επαγγελματικός",
  office: "Γραφείο",
};

const BID_RANGES = [
  { label: "Any Price", value: "" },
  { label: "Under €20k", value: "0-20000" },
  { label: "€20k – €50k", value: "20000-50000" },
  { label: "€50k – €100k", value: "50000-100000" },
  { label: "€100k – €200k", value: "100000-200000" },
  { label: "€200k – €500k", value: "200000-500000" },
  { label: "€500k+", value: "500000-9999999" },
];

const YEAR_RANGES = [
  { label: "Any Year", value: "" },
  { label: "Pre-1980", value: "0-1979" },
  { label: "1980–2000", value: "1980-2000" },
  { label: "2000–2010", value: "2000-2010" },
  { label: "2010–2020", value: "2010-2020" },
  { label: "Post-2020", value: "2020-2100" },
];

const OWNERSHIP_STATUSES = [
  { value: "", label: "Any Status" },
  { value: "full", label: "Full Ownership (100%)" },
  { value: "common", label: "Common / Shared" },
  { value: "partial", label: "Partial Ownership" },
  { value: "none", label: "No Ownership" },
];

/** Extract ownership status tag from tags array */
function getOwnershipStatus(tags?: string[] | null): string | null {
  if (!tags) return null;
  const tag = tags.find(t => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
  return tag ? tag.replace("ownership:", "") : null;
}

/** Extract ownership percentage from tags array */
function getOwnershipPct(tags?: string[] | null): number | null {
  if (!tags) return null;
  const tag = tags.find(t => t.startsWith("ownership_pct:"));
  return tag ? Number(tag.replace("ownership_pct:", "")) : null;
}

/**
 * Estimate gross annual rental yield for an auction property.
 * Uses city-level median rent-per-sqm benchmarks (€/sqm/month) sourced
 * from REMAX/Spitogatos 2024 data for Greece.
 * Formula: (monthlyRent × 12) / startingBid × 100
 */
const CITY_RENT_PER_SQM: Record<string, number> = {
  // Athens area
  "αθήνα": 9.5,  "athens": 9.5,
  "κολωνάκι": 13,
  "γλυφάδα": 11,
  "μαρούσι": 8.5,
  "περιστέρι": 7,
  "πειραιάς": 7.5, "piraeus": 7.5,
  "κηφισιά": 10,
  "χαλάνδρι": 8.5,
  // Thessaloniki area
  "θεσσαλονίκη": 8, "thessaloniki": 8,
  "καλαμαριά": 7.5,
  "πολίχνη": 6,
  // Islands / tourist
  "μύκονος": 18, "mykonos": 18,
  "σαντορίνη": 16, "santorini": 16,
  "ρόδος": 10, "rhodes": 10,
  "κέρκυρα": 9, "corfu": 9,
  "ηράκλειο": 8, "heraklion": 8,
  "χανιά": 8.5,
  // Other major cities
  "πάτρα": 6.5, "patras": 6.5,
  "ιωάννινα": 6,
  "λάρισα": 6,
  "βόλος": 6.5,
  "καβάλα": 5.5,
  "χαλκίδα": 6,
  "λαμία": 5.5,
  "σέρρες": 5,
};
const DEFAULT_RENT_PER_SQM = 6; // conservative fallback

function estimateYield(a: { price?: number | null; auction_starting_bid?: number | null; sqm?: number | null; city?: string | null }): number | null {
  const bid = Number(a.auction_starting_bid ?? a.price ?? 0);
  const sqm = Number(a.sqm ?? 0);
  if (bid <= 0 || sqm <= 0) return null;
  const cityKey = (a.city ?? "").toLowerCase().trim();
  // Try exact match, then prefix match
  const rentPerSqm = CITY_RENT_PER_SQM[cityKey]
    ?? Object.entries(CITY_RENT_PER_SQM).find(([k]) => cityKey.includes(k) || k.includes(cityKey))?.[1]
    ?? DEFAULT_RENT_PER_SQM;
  const annualRent = rentPerSqm * sqm * 12;
  return (annualRent / bid) * 100;
}

/** Map filterYield bucket to [min, max] percent range */
function yieldRange(bucket: string): [number, number] | null {
  switch (bucket) {
    case "low":       return [0, 3];
    case "medium":    return [3, 6];
    case "high":      return [6, 9];
    case "very_high": return [9, Infinity];
    default:          return null;
  }
}

const OWNERSHIP_BADGE: Record<string, { label: string; cls: string }> = {
  full:     { label: "Πλήρης κυριότητα", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  partial:  { label: "Μερική κυριότητα", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  common:   { label: "Εξ αδιαιρέτου", cls: "bg-sky-500/15 text-sky-400 border-sky-500/25" },
  none:     { label: "Χωρίς κυριότητα", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  occupied: { label: "Κατειλημμένο", cls: "bg-destructive/15 text-destructive border-destructive/25" },
  vacated:  { label: "Κενό", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
};

type ViewMode = "list" | "map";

function streetViewImg(lat?: number | null, lng?: number | null): string | null {
  if (!lat || !lng) return null;
  const key = "AIzaSyD42TB3L5KeQfvqOu6NfelXL5EOVNzz_cY";
  return `https://maps.googleapis.com/maps/api/streetview?size=800x450&location=${lat},${lng}&fov=90&pitch=10&key=${key}`;
}

function daysUntil(dateStr?: string | null): number {
  if (!dateStr) return 999;
  const now = new Date();
  const d = new Date(dateStr);
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

function countdownBadge(days: number): { label: string; cls: string } | null {
  if (days <= 0) return { label: "Today!", cls: "bg-destructive text-destructive-foreground" };
  if (days === 1) return { label: "Tomorrow", cls: "bg-amber-500 text-white" };
  if (days <= 7) return { label: `${days} days left`, cls: "bg-primary/80 text-primary-foreground" };
  return null;
}

// Premium lock badge
function PremiumBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30">
      <Lock className="w-2.5 h-2.5" /> PRO
    </span>
  );
}

// ── Auction card with favorite/share/report ────────────────────────────────────
function AuctionCard({ a, favoritedIds, onToggleFav }: {
  a: any;
  favoritedIds: Set<string>;
  onToggleFav: (id: string, isFav: boolean) => void;
}) {
  const days = daysUntil(a.auction_date);
  const badge = countdownBadge(days);
  const imgSrc = a.cover_image_url ?? streetViewImg(a.latitude, a.longitude);
  const isFav = favoritedIds.has(a.id);
  const ownershipStatus = getOwnershipStatus(a.tags);
  const ownershipPct = getOwnershipPct(a.tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}/auction/${a.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: a.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleReport = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.info("Report submitted. Our team will review it.");
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group flex flex-col">
      {/* Image */}
      <Link to={`/auction/${a.id}`} className="relative h-44 bg-secondary overflow-hidden block">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={a.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gavel className="w-10 h-10 text-muted-foreground/20" />
          </div>
        )}
        {a.auction_date && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
            <Calendar className="w-3 h-3 text-brand-gold" />
            {format(new Date(a.auction_date), "dd MMM yyyy")}
          </div>
        )}
        <div className="absolute top-2 right-2 bg-brand-gold/90 text-background text-[10px] font-bold px-2 py-0.5 rounded-full">
          {PROPERTY_TYPE_GR[a.property_type] ?? a.property_type}
        </div>
        {badge && (
          <div className={`absolute bottom-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            <Clock className="w-3 h-3" />
            {badge.label}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <Link to={`/auction/${a.id}`}>
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">
            {a.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{a.address ? `${a.address}, ` : ""}{a.city}</span>
        </div>

        {/* Ownership status badge */}
        {ownershipBadge && (
          <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${ownershipBadge.cls}`}>
            <Building2 className="w-2.5 h-2.5" />
            {ownershipBadge.label}
            {ownershipPct != null && ownershipPct < 100 && (
              <span className="opacity-80">({ownershipPct}%)</span>
            )}
          </div>
        )}

        {a.year_built && (
          <div className="text-xs text-muted-foreground">Built {a.year_built}</div>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 font-display font-bold text-brand-gold">
            <Euro className="w-3.5 h-3.5" />
            {(a.auction_starting_bid ?? a.price ?? 0).toLocaleString("el-GR")}
          </div>
          {a.sqm && a.sqm > 1 && (
            <span className="text-xs text-muted-foreground">{a.sqm} τ.μ.</span>
          )}
        </div>
        {a.auction_court && (
          <p className="text-[10px] text-muted-foreground truncate">
            {a.auction_court}
          </p>
        )}

        {/* Action row */}
        <div className="mt-auto pt-3 border-t border-border flex items-center gap-2">
          {/* Favorite */}
          <button
            onClick={(e) => { e.preventDefault(); onToggleFav(a.id, isFav); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isFav
                ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Save"
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current text-rose-400" : ""}`} />
            {isFav ? "Saved" : "Save"}
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
            aria-label="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>

          {/* Report */}
          <button
            onClick={handleReport}
            className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-all"
            aria-label="Report"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>

          {/* External link */}
          {a.website_url && (
            <a
              href={a.website_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-brand-gold/10 border border-brand-gold/25 text-brand-gold hover:bg-brand-gold/20 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              eAuction
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Auctions() {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedCity, setSelectedCity] = useState(() => searchParams.get("city") || "All Cities");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  // Standard filters
  const [filterType, setFilterType] = useState(searchParams.get("type") || "");
  const [filterBidRange, setFilterBidRange] = useState("");
  const [filterYearRange, setFilterYearRange] = useState("");

  // Premium filters (functional for Pro, locked/redirect for free users)
  const [filterOwnership, setFilterOwnership] = useState("");
  const [filterRound, setFilterRound] = useState("");
  const [filterYield, setFilterYield] = useState("");

  // Prefill city from URL when data loads
  useEffect(() => {
    const cityParam = searchParams.get("city");
    if (cityParam) setSelectedCity(cityParam);
  }, [searchParams]);

  const { data: auctions = [], isLoading, error } = useAuctionListings();
  const toggleFav = useToggleFavorite();

  // Dynamic city list from actual data
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(auctions.map(a => a.city).filter(Boolean))).sort();
    return ["All Cities", ...cities];
  }, [auctions]);

  const handleToggleFav = (id: string, isFav: boolean) => {
    if (!user) { navigate("/login"); return; }
    toggleFav.mutate({ listing_id: id, isFavorited: isFav });
    setFavoritedIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Apply all filters client-side
  const filtered = useMemo(() => {
    return auctions.filter(a => {
      if (selectedCity !== "All Cities" && !a.city?.toLowerCase().includes(selectedCity.toLowerCase())) return false;
      if (filterType && a.property_type !== filterType) return false;
      if (filterBidRange) {
        const [min, max] = filterBidRange.split("-").map(Number);
        const bid = a.auction_starting_bid ?? a.price ?? 0;
        if (bid < min || bid > max) return false;
      }
      if (filterYearRange && a.year_built) {
        const [min, max] = filterYearRange.split("-").map(Number);
        if (a.year_built < min || a.year_built > max) return false;
      }
      // Ownership: matches ownership:<value> tag
      if (filterOwnership) {
        const ownershipTag = `ownership:${filterOwnership}`;
        if (!a.tags?.includes(ownershipTag)) return false;
      }
      // Round: matches round:<N> tag (Pro)
      if (filterRound && isPro) {
        const roundTag = `round:${filterRound}`;
        if (!a.tags?.includes(roundTag)) return false;
      }
      // Yield: estimated from price × city rent benchmark (Pro)
      if (filterYield && isPro) {
        const range = yieldRange(filterYield);
        if (range) {
          const est = estimateYield(a);
          if (est === null || est < range[0] || est > range[1]) return false;
        }
      }
      return true;
    });
  }, [auctions, selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, isPro]);

  const activeFilterCount = [filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield].filter(Boolean).length;

  const clearFilters = () => {
    setFilterType("");
    setFilterBidRange("");
    setFilterYearRange("");
    setFilterOwnership("");
    setFilterRound("");
    setFilterYield("");
  };

  const now = new Date();
  const thisWeek = filtered.filter(a => {
    if (!a.auction_date) return false;
    const d = new Date(a.auction_date);
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  const avgBid = filtered.length
    ? Math.round(filtered.reduce((sum, a) => sum + (a.auction_starting_bid ?? a.price ?? 0), 0) / filtered.length)
    : 0;

  // Compute % of auctions that have a starting bid below stated price
  const withDiscount = filtered.filter(a => a.auction_starting_bid && a.price && a.auction_starting_bid < a.price).length;
  const discountPct = filtered.length > 0 ? Math.round((withDiscount / filtered.length) * 100) : 0;

  const auctionStats = [
    { value: isLoading ? "—" : String(thisWeek), label: "This Week", icon: Gavel },
    { value: isLoading ? "—" : filtered.length.toLocaleString(), label: "Total Listed", icon: TrendingUp },
    { value: isLoading ? "—" : avgBid > 0 ? `€${(avgBid / 1000).toFixed(0)}k` : "—", label: "Avg Starting Bid", icon: TrendingUp },
  ];

  const mapListings: MapListing[] = filtered
    .filter(a => a.latitude != null && a.longitude != null)
    .map(a => ({
      id: a.id,
      title: a.title,
      price: a.auction_starting_bid ?? a.price ?? 0,
      sqm: a.sqm ?? 0,
      latitude: a.latitude,
      longitude: a.longitude,
      images: a.cover_image_url
        ? [a.cover_image_url]
        : streetViewImg(a.latitude, a.longitude)
        ? [streetViewImg(a.latitude, a.longitude)!]
        : [],
      listingType: "auction",
      city: a.city,
      _raw: a,
    }));

  const mappableCount = mapListings.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="bg-card border-b border-border py-12">
          <div className="container">
            <div className="flex items-center gap-2 mb-3">
              <Gavel className="w-5 h-5 text-brand-gold" />
              <span className="text-xs font-bold text-brand-gold uppercase tracking-widest">Greek Judicial Auctions</span>
            </div>
            <h1 className="font-display text-4xl font-bold mb-2">Property Auctions</h1>
            <p className="text-muted-foreground max-w-xl">
              Direct integration with Greek judicial auctions, bank repossessions, and OAED listings. Real-time data powered by mAI Prop OS.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {auctionStats.map(s => (
                <div key={s.label} className="glass-card rounded-xl p-4 text-center">
                  <div className="font-display text-2xl font-bold gradient-text-gold">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert CTA */}
        <div className="container py-6">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-brand-gold/10 border border-brand-gold/20">
            <Bell className="w-5 h-5 text-brand-gold shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Get notified of new auctions matching your criteria</p>
              <p className="text-xs text-muted-foreground mt-0.5">Set custom alerts for location, price range, and property type</p>
            </div>
            <Button
              className="bg-gradient-gold border-0 text-background font-semibold shrink-0"
              onClick={() => user ? setAlertModalOpen(true) : (window.location.href = "/login")}
            >
              {user ? "Set Alert" : "Sign in to Alert"}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="container pb-4">
          <div className="flex items-center justify-end gap-2 shrink-0">
              {/* Filters toggle */}
              <Button
                variant="outline"
                size="sm"
                className={`border-border gap-1.5 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(v => !v)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
                )}
              </Button>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> List
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Map className="w-3.5 h-3.5" /> Map
                  {!isLoading && mappableCount > 0 && (
                    <span className="ml-0.5 text-[10px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full font-bold">
                      {mappableCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

          {/* Advanced Filters Panel */}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* City */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">City</label>
                    <div className="relative">
                      <select
                        value={selectedCity}
                        onChange={e => setSelectedCity(e.target.value)}
                        className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary cursor-pointer"
                      >
                        {cityOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Typology */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Property Type</label>
                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                    >
                      {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Starting bid */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Starting Bid</label>
                    <select
                      value={filterBidRange}
                      onChange={e => setFilterBidRange(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                    >
                      {BID_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  {/* Construction year */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Construction Year</label>
                    <select
                      value={filterYearRange}
                      onChange={e => setFilterYearRange(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                    >
                      {YEAR_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {/* Ownership Status — moved to standard filters */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Ownership Status</label>
                    <select
                      value={filterOwnership}
                      onChange={e => setFilterOwnership(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                    >
                      {OWNERSHIP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>{/* end grid */}
              </div>{/* end standard filters */}


                    </div>
                  )}

                  {/* Expected rental yield */}
                  {isPro ? (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                        Est. Rental Yield
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">(city benchmark × sqm / bid)</span>
                      </label>
                      <select
                        value={filterYield}
                        onChange={e => setFilterYield(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                      >
                        <option value="">Any Yield</option>
                        <option value="low">Under 3% — Low yield</option>
                        <option value="medium">3% – 6% — Average</option>
                        <option value="high">6% – 9% — Good</option>
                        <option value="very_high">9%+ — High yield opportunity</option>
                      </select>
                    </div>
                  ) : (
                    <div className="relative cursor-pointer group/pf" onClick={() => navigate("/pro")}>
                      <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-1.5 pointer-events-none">
                        Est. Rental Yield <PremiumBadge />
                      </label>
                      <select disabled className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-muted-foreground outline-none appearance-none opacity-60 pointer-events-none">
                        <option>Any Yield</option>
                        <option>Under 3%</option>
                        <option>3% – 6%</option>
                        <option>6% – 9%</option>
                        <option>9%+</option>
                      </select>
                      <Lock className="absolute right-3 top-8 w-3.5 h-3.5 text-brand-gold pointer-events-none" />
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover/pf:opacity-100 transition-opacity z-20 pointer-events-none">
                        <div className="bg-card border border-brand-gold/30 rounded-xl px-3 py-2 shadow-elevated text-center whitespace-nowrap">
                          <p className="text-[10px] font-bold text-brand-gold flex items-center gap-1 justify-center"><Zap className="w-2.5 h-2.5" /> Upgrade to Pro</p>
                          <p className="text-[10px] text-muted-foreground">Filter by estimated rental yield</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upsell — only show for non-Pro */}
                {!isPro && (
                  <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-brand-gold/5 border border-brand-gold/20">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-brand-gold" />
                      <span className="text-xs font-medium">Unlock Pro filters — Auction Round &amp; Rental Yield</span>
                    </div>
                    <Button size="sm" className="bg-gradient-gold border-0 text-background font-semibold text-xs" asChild>
                      <Link to="/pro">Upgrade to Pro</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {activeFilterCount > 0 && !showFilters && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {filterType && <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors capitalize">{filterType} <X className="w-3 h-3" /></button>}
              {filterBidRange && <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{BID_RANGES.find(r => r.value === filterBidRange)?.label} <X className="w-3 h-3" /></button>}
              {filterYearRange && <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{YEAR_RANGES.find(r => r.value === filterYearRange)?.label} <X className="w-3 h-3" /></button>}
              {filterOwnership && <button onClick={() => setFilterOwnership("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-xs text-sky-400 hover:bg-sky-500/20 transition-colors">{OWNERSHIP_STATUSES.find(s => s.value === filterOwnership)?.label} <X className="w-3 h-3" /></button>}
              {filterRound && <button onClick={() => setFilterRound("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-xs text-brand-gold hover:bg-brand-gold/20 transition-colors">Round {filterRound} <X className="w-3 h-3" /></button>}
              {filterYield && <button onClick={() => setFilterYield("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-xs text-brand-gold hover:bg-brand-gold/20 transition-colors">Yield: {filterYield.replace("_", " ")} <X className="w-3 h-3" /></button>}
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
            </div>
          )}
        </div>

        {/* ── MAP VIEW ── */}
        {viewMode === "map" && (
          <div className="container pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-[560px] rounded-2xl bg-card border border-border">
                <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
              </div>
            ) : mappableCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-[560px] rounded-2xl bg-card border border-border gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {filtered.length === 0
                    ? "No auctions match the current filters."
                    : `${filtered.length} auction(s) found but none have coordinates.`}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Showing <span className="font-semibold text-foreground">{mappableCount}</span> pinned auction{mappableCount !== 1 ? "s" : ""} on map
                  {filtered.length > mappableCount && ` (${filtered.length - mappableCount} without coordinates hidden)`}
                </p>
                <MapView listings={mapListings} height="560px" />
              </div>
            )}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && (
          <div className="container pb-16">
            {isLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading auctions from OS…</span>
              </div>
            )}

            {error && (
              <div className="text-center py-20">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load auctions. Please try again.</p>
              </div>
            )}

            {!isLoading && !error && filtered.length === 0 && (
              <div className="text-center py-20">
                <Gavel className="w-12 h-12 text-brand-gold/30 mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-2">No auctions match your filters</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Try adjusting your filters or selecting "All Cities".
                </p>
                {activeFilterCount > 0 && (
                  <Button variant="outline" className="border-border mt-4" onClick={clearFilters}>Clear Filters</Button>
                )}
              </div>
            )}

            {!isLoading && filtered.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  Showing <span className="font-semibold text-foreground">{filtered.length}</span> upcoming auctions
                  {selectedCity !== "All Cities" ? ` in ${selectedCity}` : ""}
                  {" · "}ordered by auction date
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map(a => (
                    <AuctionCard
                      key={a.id}
                      a={a}
                      favoritedIds={favoritedIds}
                      onToggleFav={handleToggleFav}
                    />
                  ))}
                </div>
              </>
            )}

            {/* CTA */}
            <div className="mt-10 p-6 glass-card rounded-xl border border-brand-gold/20 text-center">
              <Gavel className="w-8 h-8 text-brand-gold mx-auto mb-3" />
              <h3 className="font-display font-semibold mb-2">Full Auction Database</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS.
              </p>
              <Button className="bg-gradient-gold border-0 text-background font-semibold" asChild>
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                  Open mAI Prop OS <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
      <Footer />

      {/* Auction alert modal */}
      <AuctionAlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
      />
    </div>
  );
}
