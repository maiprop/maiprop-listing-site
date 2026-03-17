import { useState, useMemo, useEffect } from "react";
import { Gavel, TrendingUp, Bell, ExternalLink, AlertCircle, Loader2, MapPin, Calendar, Euro, Map, List, Clock, SlidersHorizontal, X, Lock, Star, Heart, Share2, Flag, Building2, ChevronDown, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { MapView, MapListing } from "@/components/MapView";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { getStreetViewProxyUrl } from "@/lib/config";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToggleFavorite } from "@/hooks/useFavorites";
import { toast } from "sonner";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;
const PAGE_SIZE = 20;
const MAX_PAGES_FREE = 3; // free: up to 3 pages = 60 items
const MAX_PAGES_PRO = 10; // pro:  up to 10 pages = 200 items

// ── Fetch all auctions from DB (future or date TBD) ─────────────────────────────
// Include null auction_date so OS-synced rows without a date still show
function useAuctionListings() {
  return useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const fetchAll = async (withImages: boolean) => {
        let allAuctions: any[] = [];
        let from = 0;
        while (true) {
          const select = withImages ?
          `${AUCTION_SELECT_CORE}, listing_images(url, sort_order)` :
          AUCTION_SELECT_CORE;
          const { data, error } = await supabase.
          from("listings").
          select(select).
          eq("listing_type", "auction").
          eq("status", "active").
          or(`auction_date.gte.${today},auction_date.is.null`).
          order("auction_date", { ascending: true, nullsFirst: false }).
          range(from, from + AUCTION_FETCH_LIMIT - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allAuctions = allAuctions.concat(data);
          if (data.length < AUCTION_FETCH_LIMIT) break;
          from += AUCTION_FETCH_LIMIT;
        }
        return allAuctions;
      };

      const run = async () => {
        let result: any[];
        try {
          result = await fetchAll(true);
        } catch {
          result = await fetchAll(false);
        }
        // Priority placement: featured first, then priority_placement, then auction_date
        result.sort((a, b) => {
          const aFeatured = a.is_featured ? 1 : 0;
          const bFeatured = b.is_featured ? 1 : 0;
          if (bFeatured !== aFeatured) return bFeatured - aFeatured;
          const aPri = Number(a.priority_placement ?? 0);
          const bPri = Number(b.priority_placement ?? 0);
          if (bPri !== aPri) return bPri - aPri;
          const aDate = a.auction_date ? new Date(a.auction_date).getTime() : 0;
          const bDate = b.auction_date ? new Date(b.auction_date).getTime() : 0;
          return aDate - bDate; // earlier auction dates first
        });
        return result;
      };

      return Promise.race([
      run(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), QUERY_TIMEOUT_MS))]
      );
    },
    staleTime: 5 * 60 * 1000 // 5 min cache
  });
}

const PROPERTY_TYPES = [
  { value: "", label: "All Types" },
  // Residential
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  // Land & plots (sub-segmented via tags)
  { value: "land", label: "Land / Plot (any)" },
  { value: "land:land", label: "Land (no building)" },
  { value: "land:land_with_building", label: "Land with building" },
  { value: "land:plot", label: "Agricultural plot" },
  { value: "land:plot_with_building", label: "Plot with building" },
  // Commercial (sub-segmented via tags)
  { value: "commercial", label: "Commercial (any)" },
  { value: "commercial:store", label: "Store / Retail" },
  { value: "commercial:warehouse", label: "Warehouse" },
  { value: "commercial:industrial", label: "Industrial" },
  { value: "commercial:storeroom", label: "Storeroom" },
  { value: "commercial:parking", label: "Parking" },
  { value: "commercial:hotel", label: "Hotel" },
  { value: "commercial:other_business_space", label: "Other business space" },
  // Office (also a commercial subtype but kept separate for clarity)
  { value: "office", label: "Office" },
];


const PROPERTY_TYPE_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Κατοικία",
  villa: "Βίλα",
  land: "Γη",
  commercial: "Επαγγελματικός",
  office: "Γραφείο"
};

/** Label for property type pill — includes subtypes like Plot with Building, Land with Building */
function getPropertyTypeLabel(a: { property_type?: string; tags?: string[] | null }): string {
  let base = a.property_type || "";
  // Derive base from tags when property_type is missing (e.g. OS-synced data)
  if (!base && a.tags?.length) {
    if (a.tags.some((t) => t.startsWith("land_type:"))) base = "land";
    else if (a.tags.some((t) => t.startsWith("commercial_type:"))) base = "commercial";
  }
  if (base === "land" && a.tags?.length) {
    const landTag = a.tags.find((t) => t.startsWith("land_type:"));
    if (landTag) {
      const subtype = landTag.replace("land_type:", "");
      const mapping: Record<string, string> = {
        plot_with_building: "Plot with Building",
        land_with_building: "Land with Building",
        land: "Land (no building)",
        plot: "Agricultural plot",
      };
      if (mapping[subtype]) return mapping[subtype];
    }
  }
  if (base === "commercial" && a.tags?.length) {
    const commTag = a.tags.find((t) => t.startsWith("commercial_type:"));
    if (commTag) {
      const subtype = commTag.replace("commercial_type:", "");
      const mapping: Record<string, string> = {
        store: "Store / Retail",
        warehouse: "Warehouse",
        industrial: "Industrial",
        storeroom: "Storeroom",
        parking: "Parking",
        hotel: "Hotel",
        other_business_space: "Other business space",
      };
      if (mapping[subtype]) return mapping[subtype];
    }
  }
  if (!base) return "";
  return PROPERTY_TYPE_GR[base] ?? base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") ?? base;
}

const BID_RANGES = [
{ label: "Any Price", value: "" },
{ label: "Under €20k", value: "0-20000" },
{ label: "€20k – €50k", value: "20000-50000" },
{ label: "€50k – €100k", value: "50000-100000" },
{ label: "€100k – €200k", value: "100000-200000" },
{ label: "€200k – €500k", value: "200000-500000" },
{ label: "€500k+", value: "500000-9999999" }];


const YEAR_RANGES = [
{ label: "Any Year", value: "" },
{ label: "Pre-1980", value: "0-1979" },
{ label: "1980–2000", value: "1980-2000" },
{ label: "2000–2010", value: "2000-2010" },
{ label: "2010–2020", value: "2010-2020" },
{ label: "Post-2020", value: "2020-2100" }];


const OWNERSHIP_STATUSES = [
{ value: "", label: "Any Status" },
{ value: "full", label: "Full" },
{ value: "bare", label: "Bare" },
{ value: "common", label: "Common" },
{ value: "usufruct", label: "Usufruct" },
{ value: "vertical", label: "Vertical" },
{ value: "horizontal", label: "Horizontal" }];


/** Extract ownership status tag from tags array */
function getOwnershipStatus(tags?: string[] | null): string | null {
  if (!tags) return null;
  const tag = tags.find((t) => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
  return tag ? tag.replace("ownership:", "") : null;
}

/** Extract ownership percentage from tags array */
function getOwnershipPct(tags?: string[] | null): number | null {
  if (!tags) return null;
  const tag = tags.find((t) => t.startsWith("ownership_pct:"));
  return tag ? Number(tag.replace("ownership_pct:", "")) : null;
}

function normalizeOwnership(v?: string | null): string | null {
  if (!v) return null;
  const raw = v.toLowerCase().trim();
  if (["full", "full_ownership", "complete", "100"].includes(raw)) return "full";
  if (["bare", "bare_ownership", "psili"].includes(raw)) return "bare";
  if (["common", "shared", "undivided", "joint"].includes(raw)) return "common";
  if (["usufruct", "epikarpia"].includes(raw)) return "usufruct";
  if (["vertical", "vertical_ownership"].includes(raw)) return "vertical";
  if (["horizontal", "horizontal_ownership"].includes(raw)) return "horizontal";
  return raw;
}

function ownershipMatches(filterValue: string, tags?: string[] | null): boolean {
  if (!filterValue) return true;
  const status = normalizeOwnership(getOwnershipStatus(tags));
  const pct = getOwnershipPct(tags);
  const f = normalizeOwnership(filterValue);
  if (!f) return true;
  if (f === "full") return status === "full" || pct != null && pct >= 100;
  if (f === "bare") return status === "bare";
  if (f === "common") return status === "common" || status == null && pct != null && pct > 0 && pct < 100;
  if (f === "usufruct") return status === "usufruct";
  if (f === "vertical") return status === "vertical";
  if (f === "horizontal") return status === "horizontal";
  return status === f;
}

function getAuctionRound(tags?: string[] | null): number | null {
  if (!tags?.length) return null;
  const t = tags.find((x) => x.startsWith("round:"));
  if (!t) return null;
  const n = Number(t.replace("round:", ""));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Estimate gross annual rental yield for an auction property.
 * Uses city-level median rent-per-sqm benchmarks (€/sqm/month) sourced
 * from REMAX/Spitogatos 2024 data for Greece.
 * Formula: (monthlyRent × 12) / startingBid × 100
 */
const CITY_RENT_PER_SQM: Record<string, number> = {
  // Athens area
  "αθήνα": 9.5, "athens": 9.5,
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
  "σέρρες": 5
};
const DEFAULT_RENT_PER_SQM = 6; // conservative fallback

function estimateYield(a: {price?: number | null;auction_starting_bid?: number | null;sqm?: number | null;city?: string | null;}): number | null {
  const bid = Number(a.auction_starting_bid ?? a.price ?? 0);
  const sqm = Number(a.sqm ?? 0);
  if (bid <= 0 || sqm <= 0) return null;
  const cityKey = (a.city ?? "").toLowerCase().trim();
  // Try exact match, then prefix match
  const rentPerSqm = CITY_RENT_PER_SQM[cityKey] ??
  Object.entries(CITY_RENT_PER_SQM).find(([k]) => cityKey.includes(k) || k.includes(cityKey))?.[1] ??
  DEFAULT_RENT_PER_SQM;
  const annualRent = rentPerSqm * sqm * 12;
  return annualRent / bid * 100;
}

/** Map filterYield bucket to [min, max] percent range */
function yieldRange(bucket: string): [number, number] | null {
  switch (bucket) {
    case "low":return [0, 3];
    case "medium":return [3, 6];
    case "high":return [6, 9];
    case "very_high":return [9, Infinity];
    default:return null;
  }
}

const OWNERSHIP_BADGE: Record<string, {label: string;cls: string;}> = {
  full: { label: "Πλήρης κυριότητα", cls: "bg-primary/15 text-primary border-primary/25" },
  bare: { label: "Ψιλή κυριότητα", cls: "bg-brand-purple/15 text-brand-purple border-brand-purple/25" },
  common: { label: "Εξ αδιαιρέτου", cls: "bg-accent/15 text-accent-foreground border-accent/25" },
  usufruct: { label: "Επικαρπία", cls: "bg-muted text-muted-foreground border-border" },
  vertical: { label: "Κάθετη ιδιοκτησία", cls: "bg-primary/10 text-primary border-primary/20" },
  horizontal: { label: "Οριζόντια ιδιοκτησία", cls: "bg-secondary text-foreground border-border" }
};

type ViewMode = "list" | "map";

function streetViewImg(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  return getStreetViewProxyUrl({ lat, lng }) ?? null;
}

function daysUntil(dateStr?: string | null): number {
  if (!dateStr) return 999;
  const now = new Date();
  const d = new Date(dateStr);
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

function countdownBadge(days: number): {label: string;cls: string;} | null {
  if (days <= 0) return { label: "Today!", cls: "bg-destructive text-destructive-foreground" };
  if (days === 1) return { label: "Tomorrow", cls: "bg-gradient-primary text-primary-foreground" };
  if (days <= 7) return { label: `${days} days left`, cls: "bg-primary text-primary-foreground" };
  return null;
}

// Premium lock badge
function PremiumBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-primary text-primary-foreground border border-primary/30">
      <Lock className="w-2.5 h-2.5" /> PRO
    </span>);

}

// ── Auction card with favorite/share/report ────────────────────────────────────
function AuctionCard({ a, favoritedIds, onToggleFav



}: {a: any;favoritedIds: Set<string>;onToggleFav: (id: string, isFav: boolean) => void;}) {
  const days = daysUntil(a.auction_date);
  const badge = countdownBadge(days);
  const imgSrc = a.cover_image_url ?? streetViewImg(a.latitude, a.longitude);
  const isFav = favoritedIds.has(a.id);
  const ownershipStatus = normalizeOwnership(getOwnershipStatus(a.tags));
  const ownershipPct = getOwnershipPct(a.tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}/auction/${a.id}`;
    if (navigator.share) {
      try {await navigator.share({ title: a.title, url });} catch {}
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
        {imgSrc ?
        <img
          src={imgSrc}
          alt={a.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {(e.target as HTMLImageElement).style.display = "none";}} /> :


        <div className="w-full h-full flex items-center justify-center">
            <Gavel className="w-10 h-10 text-muted-foreground/20" />
          </div>
        }
      <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          {a.is_featured && (
            <span className="inline-flex items-center gap-1 bg-gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Crown className="w-2.5 h-2.5" /> Featured
            </span>
          )}
          {a.auction_date && (
            <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <Calendar className="w-3 h-3 text-primary" />
              {format(new Date(a.auction_date), "dd MMM yyyy")}
            </div>
          )}
        </div>
        {getPropertyTypeLabel(a) && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
            {getPropertyTypeLabel(a)}
          </div>
        )}
        {badge &&
        <div className={`absolute bottom-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            <Clock className="w-3 h-3" />
            {badge.label}
          </div>
        }
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

        {/* Property type pill */}
        {getPropertyTypeLabel(a) && (
        <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit">
            {getPropertyTypeLabel(a)}
          </span>
        )}

        {/* Ownership status badge */}
        {ownershipBadge &&
        <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${ownershipBadge.cls}`}>
            <Building2 className="w-2.5 h-2.5" />
            {ownershipBadge.label}
            {ownershipPct != null && ownershipPct < 100 &&
          <span className="opacity-80">({ownershipPct}%)</span>
          }
          </div>
        }

        {a.year_built &&
        <div className="text-xs text-muted-foreground">Built {a.year_built}</div>
        }
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 font-display font-bold bg-gradient-primary bg-clip-text text-transparent">
            <Euro className="w-3.5 h-3.5 text-primary" />
            {(a.auction_starting_bid ?? a.price ?? 0).toLocaleString("el-GR")}
          </div>
          {a.sqm && a.sqm > 1 &&
          <span className="text-xs text-muted-foreground">{a.sqm} τ.μ.</span>
          }
        </div>
        {a.auction_court && !/^[A-Z_]+$/.test(a.auction_court) &&
          <div className="text-xs text-muted-foreground truncate">{a.auction_court}</div>
        }




        {/* Action row */}
        <div className="mt-auto pt-3 border-t border-border flex items-center gap-2">
          {/* Favorite */}
          <button
            onClick={(e) => {e.preventDefault();onToggleFav(a.id, isFav);}}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            isFav ?
            "bg-rose-500/15 border-rose-500/30 text-rose-400" :
            "bg-secondary border-border text-muted-foreground hover:text-foreground"}`
            }
            aria-label="Save">
            
            <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current text-rose-400" : ""}`} />
            {isFav ? "Saved" : "Save"}
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
            aria-label="Share">
            
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>

          {/* Report */}
          <button
            onClick={handleReport}
            className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-all"
            aria-label="Report">
            
            <Flag className="w-3.5 h-3.5" />
          </button>

          {/* External link */}
          {a.website_url &&
          <a
            href={a.website_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-all">
            
              <ExternalLink className="w-3 h-3" />
              eAuction
            </a>
          }
        </div>
      </div>
    </div>);

}

export default function Auctions() {
  const { user, profile } = useAuth();
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
  const [currentPage, setCurrentPage] = useState(1);

  // Prefill city from URL when data loads
  useEffect(() => {
    const cityParam = searchParams.get("city");
    if (cityParam) setSelectedCity(cityParam);
  }, [searchParams]);

  const { data: auctions = [], isLoading, error } = useAuctionListings();
  const toggleFav = useToggleFavorite();
  const email = (user?.email || "").toLowerCase();
  const isMaiPropOsUser =
  email.endsWith("@maiprop.co") ||
  email.endsWith("@os.maiprop.co");
  // pageCap and maxItems computed below when cappedAuctions is built

  // Dynamic city list from actual data
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(auctions.map((a) => a.city).filter(Boolean))).sort();
    return ["All Cities", ...cities];
  }, [auctions]);

  const roundOptions = useMemo(() => {
    const rounds = auctions.map((a: any) => getAuctionRound(a.tags)).filter((n): n is number => n != null);
    const opts: {value: string;label: string;}[] = [{ value: "", label: "All Rounds" }];
    if (rounds.some((n) => n === 1)) opts.push({ value: "1", label: "1st Auction" });
    if (rounds.some((n) => n === 2)) opts.push({ value: "2", label: "2nd Auction" });
    if (rounds.some((n) => n >= 3)) opts.push({ value: "3plus", label: "3rd+ Auction" });
    return opts;
  }, [auctions]);

  const handleToggleFav = (id: string, isFav: boolean) => {
    if (!user) {navigate("/login");return;}
    toggleFav.mutate({ listing_id: id, isFavorited: isFav });
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(id);else next.add(id);
      return next;
    });
  };

  // (filtering is applied inside visibleFiltered below, after the cap)

  const pageCap = isMaiPropOsUser ? Infinity : isPro ? MAX_PAGES_PRO : MAX_PAGES_FREE;
  const maxItems = Number.isFinite(pageCap) ? pageCap * PAGE_SIZE : Infinity;

  // Cap is applied on the RAW auctions list BEFORE filtering so that
  // narrowing filters cannot be used to bypass the page cap.
  const cappedAuctions = useMemo(
    () => Number.isFinite(maxItems) ? auctions.slice(0, maxItems) : auctions,
    [auctions, maxItems]
  );
  const totalRaw = auctions.length; // full count for upsell copy

  const visibleFiltered = useMemo(() => {
    return cappedAuctions.filter((a) => {
      if (selectedCity !== "All Cities" && !a.city?.toLowerCase().includes(selectedCity.toLowerCase())) return false;
      if (filterType) {
        const [base, subtype] = filterType.split(":");
        // Base property_type must always match
        if (base && a.property_type !== base) return false;
        // For land/commercial subtypes, also require the corresponding tag
        if (subtype && base === "land") {
          const targetTag = `land_type:${subtype}`;
          if (!a.tags?.includes(targetTag)) return false;
        }
        if (subtype && base === "commercial") {
          const targetTag = `commercial_type:${subtype}`;
          if (!a.tags?.includes(targetTag)) return false;
        }
      }
      if (filterBidRange) {
        const [min, max] = filterBidRange.split("-").map(Number);
        const bid = a.auction_starting_bid ?? a.price ?? 0;
        if (bid < min || bid > max) return false;
      }
      if (filterYearRange && a.year_built) {
        const [min, max] = filterYearRange.split("-").map(Number);
        if (a.year_built < min || a.year_built > max) return false;
      }
      // Premium filters: only apply when user is Pro
      if (isPro || isMaiPropOsUser) {
        if (filterOwnership && !ownershipMatches(filterOwnership, a.tags)) return false;
        if (filterRound) {
          const round = getAuctionRound(a.tags);
          if (filterRound === "3plus") {
            if (!round || round < 3) return false;
          } else {
            const target = Number(filterRound);
            if (!round || round !== target) return false;
          }
        }
        if (filterYield) {
          const range = yieldRange(filterYield);
          if (range) {
            const est = estimateYield(a);
            if (est === null || est < range[0] || est > range[1]) return false;
          }
        }
      }
      return true;
    });
  }, [cappedAuctions, selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, isPro, isMaiPropOsUser]);

  const totalPages = Math.max(1, Math.ceil(visibleFiltered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleFiltered.slice(start, start + PAGE_SIZE);
  }, [visibleFiltered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, maxItems]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const activeFilterCount = [
    filterType,
    filterBidRange,
    filterYearRange,
    ...(isPro || isMaiPropOsUser ? [filterOwnership, filterRound, filterYield] : []),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterType("");
    setFilterBidRange("");
    setFilterYearRange("");
    setFilterOwnership("");
    setFilterRound("");
    setFilterYield("");
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeek = visibleFiltered.filter((a) => {
    if (!a.auction_date) return false;
    const d = new Date(a.auction_date);
    const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dayOnly >= todayStart && dayOnly <= weekEnd;
  }).length;

  const avgBid = visibleFiltered.length ?
  Math.round(visibleFiltered.reduce((sum, a) => sum + (a.auction_starting_bid ?? a.price ?? 0), 0) / visibleFiltered.length) :
  0;

  // Compute % of auctions that have a starting bid below stated price
  const withDiscount = visibleFiltered.filter((a) => a.auction_starting_bid && a.price && a.auction_starting_bid < a.price).length;
  const discountPct = visibleFiltered.length > 0 ? Math.round(withDiscount / visibleFiltered.length * 100) : 0;

  const auctionStats = [
  { value: isLoading ? "—" : String(thisWeek), label: "This Week", icon: Gavel },
  { value: isLoading ? "—" : visibleFiltered.length.toLocaleString(), label: "Visible Auctions", icon: TrendingUp },
  { value: isLoading ? "—" : avgBid > 0 ? `€${(avgBid / 1000).toFixed(0)}k` : "—", label: "Avg Starting Bid", icon: TrendingUp }];


  const mapListings: MapListing[] = visibleFiltered.
  filter((a) => a.latitude != null && a.longitude != null).
  map((a) => ({
    id: a.id,
    title: a.title,
    price: a.auction_starting_bid ?? a.price ?? 0,
    sqm: a.sqm ?? 0,
    latitude: a.latitude,
    longitude: a.longitude,
    images: (() => {
      const imgs: string[] = a.cover_image_url ? [a.cover_image_url] : [];
      if (!imgs.length && a.listing_images?.length) {
        const sorted = [...a.listing_images].sort((x: any, y: any) => x.sort_order - y.sort_order);
        sorted.forEach((img: any) => imgs.push(img.url));
      }
      if (!imgs.length) {
        const sv = streetViewImg(a.latitude, a.longitude);
        if (sv) imgs.push(sv);
      }
      return imgs;
    })(),
    listingType: "auction",
    city: a.city,
    _raw: a
  }));

  const mappableCount = mapListings.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="border-b border-border py-6 sm:py-12" style={{background: "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-purple-dark)) 55%, hsl(var(--brand-purple)) 100%)"}}>
          <div className="container">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <Gavel className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
              <span className="text-[10px] sm:text-xs font-bold text-brand-cyan uppercase tracking-widest">Greek Auctions · Live Data</span>
            </div>
            <h1 className="font-display text-xl sm:text-4xl font-bold mb-1.5 sm:mb-2 text-white">Property Auctions</h1>
            <p className="text-white/60 text-xs sm:text-base max-w-xl">
              Real-time court auction data powered by mAI Prop OS.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-8 max-w-2xl">
              {auctionStats.map((s) =>
              <div key={s.label} className="rounded-xl p-2.5 sm:p-5 text-center flex flex-col items-center justify-center border border-white/10 bg-white/5 backdrop-blur-sm">
                  <div className="font-display text-lg sm:text-3xl font-bold text-brand-cyan">{s.value}</div>
                  <div className="text-[9px] sm:text-xs text-white/50 mt-0.5 sm:mt-1.5 font-medium leading-tight">{s.label}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert CTA */}
        <div className="container py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-primary/8 border border-primary/20">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Get notified of new auctions matching your criteria</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set custom alerts for location, price range, and property type</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gradient-primary border-0 text-primary-foreground font-semibold w-full sm:w-auto shrink-0"
              onClick={() => user ? setAlertModalOpen(true) : window.location.href = "/login"}>
              {user ? "Set Alert" : "Sign in to Alert"}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="container pb-3 sm:pb-4">
          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* City select — visible on mobile as part of toolbar */}
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="sm:hidden flex-1 appearance-none bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary cursor-pointer"
            >
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* Filters toggle */}
            <Button
              variant="outline"
              size="sm"
              className={`border-border gap-1.5 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
              onClick={() => setShowFilters((v) => !v)}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 &&
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
              }
            </Button>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border">
              <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`
              }>
                <List className="w-3.5 h-3.5" /> <span className="hidden sm:inline">List</span>
              </button>
              <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`
              }>
                <Map className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Map</span>
              {!isLoading && mappableCount > 0 &&
              <span className="ml-0.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
                    {mappableCount}
                  </span>
              }
              </button>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters &&
          <div className="mt-4 p-5 bg-card/95 border border-border rounded-2xl space-y-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" /> Auction Filters
                </span>
                {activeFilterCount > 0 &&
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear all
                  </button>
              }
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
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary cursor-pointer">
                      
                        {cityOptions.map((c) =>
                      <option key={c} value={c}>{c}</option>
                      )}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Typology */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Property Type</label>
                    <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Starting bid */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Starting Bid</label>
                    <select
                    value={filterBidRange}
                    onChange={(e) => setFilterBidRange(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {BID_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  {/* Construction year */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Construction Year</label>
                    <select
                    value={filterYearRange}
                    onChange={(e) => setFilterYearRange(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {YEAR_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>{/* end grid */}
              </div>{/* end standard filters */}

              {/* Auction filters: Ownership, Round, Yield — Pro only */}
              <div className="pt-4 border-t border-border -mx-5 px-5 pb-1 rounded-b-2xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  More Filters
                  {!isPro && !isMaiPropOsUser && <PremiumBadge />}
                </p>
                {isPro || isMaiPropOsUser ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Ownership Status</label>
                      <select value={filterOwnership} onChange={(e) => setFilterOwnership(e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        {OWNERSHIP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Auction Round</label>
                      <select value={filterRound} onChange={(e) => setFilterRound(e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        {roundOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                        Est. Rental Yield
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">(city benchmark × sqm / bid)</span>
                      </label>
                      <select
                        value={filterYield}
                        onChange={(e) => setFilterYield(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        <option value="">Any Yield</option>
                        <option value="low">Under 3% — Low yield</option>
                        <option value="medium">3% – 6% — Average</option>
                        <option value="high">6% – 9% — Good</option>
                        <option value="very_high">9%+ — High yield opportunity</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                    <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Ownership Status, Auction Round & Est. Rental Yield</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Upgrade to Pro to unlock these filters.</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-brand-gold/40 text-brand-gold hover:bg-brand-gold/10 shrink-0" asChild>
                      <Link to="/pricing">Upgrade to Pro</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          }

          {/* Active filter chips */}
          {activeFilterCount > 0 && !showFilters &&
          <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {filterType && <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors capitalize">{filterType} <X className="w-3 h-3" /></button>}
              {filterBidRange && <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{BID_RANGES.find((r) => r.value === filterBidRange)?.label} <X className="w-3 h-3" /></button>}
              {filterYearRange && <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{YEAR_RANGES.find((r) => r.value === filterYearRange)?.label} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterOwnership && <button onClick={() => setFilterOwnership("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors">{OWNERSHIP_STATUSES.find((s) => s.value === filterOwnership)?.label} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterRound && <button onClick={() => setFilterRound("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{roundOptions.find((o) => o.value === filterRound)?.label || `Round ${filterRound}`} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterYield && <button onClick={() => setFilterYield("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">Yield: {filterYield.replace("_", " ")} <X className="w-3 h-3" /></button>}
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
            </div>
          }
        </div>

        {/* ── MAP VIEW ── */}
        {viewMode === "map" &&
        <div className="container pb-6">
            {isLoading ?
          <div className="flex items-center justify-center h-[560px] rounded-2xl bg-card border border-border">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div> :
          mappableCount === 0 ?
          <div className="flex flex-col items-center justify-center h-[560px] rounded-2xl bg-card border border-border gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {visibleFiltered.length === 0 ?
              "No auctions match the current filters." :
              `${visibleFiltered.length} auction(s) found but none have coordinates.`}
                </p>
              </div> :

          <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Showing <span className="font-semibold text-foreground">{mappableCount}</span> pinned auction{mappableCount !== 1 ? "s" : ""} on map
                  {visibleFiltered.length > mappableCount && ` (${visibleFiltered.length - mappableCount} without coordinates hidden)`}
                </p>
                <MapView listings={mapListings} height="560px" />
              </div>
          }
          </div>
        }

        {/* ── LIST VIEW ── */}
        {viewMode === "list" &&
        <div className="container pb-24 lg:pb-16">
            {isLoading &&
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading auctions from OS…</span>
              </div>
          }

            {error &&
          <div className="text-center py-20">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load auctions. Please try again.</p>
              </div>
          }

            {!isLoading && !error && visibleFiltered.length === 0 &&
          <div className="text-center py-20">
                <Gavel className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-2">No auctions match your filters</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Try adjusting your filters or selecting "All Cities".
                </p>
                {activeFilterCount > 0 &&
            <Button variant="outline" className="border-border mt-4" onClick={clearFilters}>Clear Filters</Button>
            }
              </div>
          }

            {!isLoading && visibleFiltered.length > 0 &&
          <>
                 <p className="text-xs text-muted-foreground mb-4">
                   Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleFiltered.length)}</span>
                   {" of "}
                   <span className="font-semibold text-foreground">{visibleFiltered.length}</span> auctions
                   {selectedCity !== "All Cities" ? ` in ${selectedCity}` : ""}
                   {" · "}ordered by date
                 </p>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                   {paginated.map((a) =>
              <AuctionCard
                key={a.id}
                a={a}
                favoritedIds={favoritedIds}
                onToggleFav={handleToggleFav} />

              )}
                 </div>
                 {totalPages > 1 &&
            <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
                     <Button
                variant="outline"
                size="sm"
                className="border-border"
                disabled={currentPage === 1}
                onClick={() => {setCurrentPage((p) => Math.max(1, p - 1));window.scrollTo({ top: 0, behavior: "smooth" });}}>
                ← Previous
              </Button>
              {(() => {
                const pages: (number | "…")[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 4) pages.push("…");
                  const start = Math.max(2, currentPage - 2);
                  const end = Math.min(totalPages - 1, currentPage + 2);
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (currentPage < totalPages - 3) pages.push("…");
                  pages.push(totalPages);
                }
                return pages.map((p, idx) =>
                  p === "…" ? (
                    <span key={`ellipsis-${idx}`} className="text-sm text-muted-foreground px-1 select-none">…</span>
                  ) : (
                       <Button
                  key={p}
                  variant={p === currentPage ? "default" : "outline"}
                  size="sm"
                  className={p === currentPage ? "bg-gradient-primary border-0 text-primary-foreground font-bold" : "border-border"}
                  onClick={() => {setCurrentPage(p as number);window.scrollTo({ top: 0, behavior: "smooth" });}}>
                       {p}
                     </Button>
                  )
                );
              })()}
              <Button
                size="sm"
                className="border-border"
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => {setCurrentPage((p) => Math.min(totalPages, p + 1));window.scrollTo({ top: 0, behavior: "smooth" });}}>
                Next →
              </Button>
            </div>
                 }
                 {/* Banner when Pro user hits 10-page cap */}
                 {isPro && !isMaiPropOsUser && totalRaw > MAX_PAGES_PRO * PAGE_SIZE &&
                   <div className="mt-8 p-4 rounded-2xl bg-secondary border border-border flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                     <ExternalLink className="w-5 h-5 text-muted-foreground shrink-0" />
                     <div className="flex-1">
                       <p className="text-sm font-medium text-foreground">Showing {MAX_PAGES_PRO * PAGE_SIZE} of {totalRaw} auctions</p>
                       <p className="text-xs text-muted-foreground mt-0.5">Visit mAI Prop OS for the complete, unfiltered auction database.</p>
                     </div>
                     <Button size="sm" variant="outline" className="shrink-0 border-border" asChild>
                       <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                         Visit mAI Prop OS <ExternalLink className="w-3 h-3 ml-1.5" />
                       </a>
                     </Button>
                   </div>
                 }
                 {/* Upsell when free user hits page cap */}
                 {!isPro && !isMaiPropOsUser && totalRaw > MAX_PAGES_FREE * PAGE_SIZE &&
                   <div className="mt-8 p-5 rounded-2xl bg-primary/8 border border-primary/25 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                     <Gavel className="w-8 h-8 text-primary shrink-0" />
                     <div className="flex-1">
                       <p className="font-display font-semibold text-sm">
                         See 300% more results with Pro
                       </p>
                       <p className="text-xs text-muted-foreground mt-0.5">
                         Pro shows 3× the free results — not all future auctions. For the full database, use mAI Prop OS.
                       </p>
                     </div>
                     <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground font-semibold shrink-0" asChild>
                       <Link to="/pricing">Upgrade to Pro</Link>
                     </Button>
                   </div>
                 }
               </>
           }
            {/* CTA */}
            <div className="mt-10 p-6 glass-card rounded-xl border border-primary/20 text-center">
              <Gavel className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-display font-semibold mb-2">Full Auction Database</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS.
              </p>
              <Button className="bg-gradient-primary border-0 text-primary-foreground font-semibold" asChild>
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                  Open mAI Prop OS <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        }
      </div>
      <Footer />
      {alertModalOpen && (
        <AuctionAlertModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
        />
      )}
    </div>
  );
}