import { useState, useEffect } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Share2, Phone, MessageSquare,
  Calendar, Video, ChevronLeft, ChevronRight, Star, TrendingUp,
  Shield, FileText, Zap, ExternalLink, Lock, BarChart2, Eye,
  Home, Clock, Check, Gavel, Download, Loader2, CheckCircle,
  Thermometer, Wrench, TreePine, Flame, Wifi, Car, Building2,
  Info, ChevronDown, ChevronUp, Euro, Tag, Layers, LayoutGrid, Bell, Globe, Scale } from
"lucide-react";
import { getSubtypeLabel, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import ViewingDialog from "@/components/ViewingDialog";
import { useListing } from "@/hooks/useListings";
import { useSimilarListings } from "@/hooks/useSimilarListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import PropertyValuation from "@/components/PropertyValuation";
import { ROICalculator } from "@/components/ROICalculator";
import { DealChecklist } from "@/components/DealChecklist";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import { HEATING_TYPES, CONDITION_OPTIONS } from "@/lib/filterConfig";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { getStreetViewProxyUrl } from "@/lib/config";
import { dbListingToCard } from "@/lib/listingUtils";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";

// ─── Energy class data ──────────────────────────────────────────────────────
const ENERGY_SCALE = [
{ cls: "A+", hex: "#1a9e4f", pct: 8, desc: "< 33 kWh/m²·yr — Excellent" },
{ cls: "A", hex: "#2db84e", pct: 17, desc: "33–50 kWh/m²·yr — Very Good" },
{ cls: "B+", hex: "#7dc73a", pct: 26, desc: "50–75 kWh/m²·yr — Good" },
{ cls: "B", hex: "#b5d934", pct: 35, desc: "75–100 kWh/m²·yr — Above Average" },
{ cls: "C", hex: "#f5d31b", pct: 50, desc: "100–125 kWh/m²·yr — Average" },
{ cls: "D", hex: "#f5a623", pct: 62, desc: "125–160 kWh/m²·yr — Below Average" },
{ cls: "E", hex: "#f07320", pct: 74, desc: "160–200 kWh/m²·yr — Poor" },
{ cls: "F", hex: "#e84020", pct: 86, desc: "200–250 kWh/m²·yr — Very Poor" },
{ cls: "G", hex: "#cc1414", pct: 100, desc: "> 250 kWh/m²·yr — Extremely Poor" }];

const ENERGY_COLORS: Record<string, string> = {
  "A+": "bg-[#1a9e4f] text-white",
  "A": "bg-[#2db84e] text-white",
  "B+": "bg-[#7dc73a] text-white",
  "B": "bg-[#b5d934] text-black",
  "C": "bg-[#f5d31b] text-black",
  "D": "bg-[#f5a623] text-black",
  "E": "bg-[#f07320] text-white",
  "F": "bg-[#e84020] text-white",
  "G": "bg-[#cc1414] text-white"
};

// ─── Mortgage calculator ──────────────────────────────────────────────────────
function MortgageCalculator({ price }: {price: number;}) {
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(3.8);
  const [years, setYears] = useState(20);

  const down = Math.round(price * (downPct / 100));
  const loan = price - down;
  const monthly = loan > 0 ?
  Math.round(loan * (rate / 1200) / (1 - Math.pow(1 + rate / 1200, -years * 12))) :
  0;
  const totalPaid = monthly * years * 12;
  const totalInterest = totalPaid - loan;

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Euro className="w-3.5 h-3.5 text-primary" />
        </div>
        <h4 className="font-display font-semibold text-sm">Mortgage Calculator</h4>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium border border-border">Indicative</span>
      </div>

      <div className="p-5 space-y-5">
        {[
        { label: "Down Payment", value: `${downPct}%`, sub: `€${down.toLocaleString()}`, min: 10, max: 50, step: 5, val: downPct, set: setDownPct },
        { label: "Interest Rate", value: `${rate.toFixed(1)}%`, sub: "p.a.", min: 2, max: 8, step: 0.1, val: rate, set: setRate },
        { label: "Loan Term", value: `${years} yrs`, sub: `${years * 12} payments`, min: 5, max: 30, step: 5, val: years, set: setYears }].
        map((s) =>
        <div key={s.label} className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-foreground">{s.value}</span>
                <span className="text-[10px] text-muted-foreground">{s.sub}</span>
              </div>
            </div>
            <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
          onChange={(e) => s.set(Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer accent-primary bg-border" />
          </div>
        )}

        <div className="rounded-xl bg-primary/8 border border-primary/15 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Est. Monthly Payment</p>
          <p className="font-display font-black text-4xl text-primary">€{monthly.toLocaleString()}</p>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-primary/10 text-xs">
            <div className="space-y-0.5">
              <p className="text-muted-foreground">Loan Amount</p>
              <p className="font-semibold">€{loan.toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-muted-foreground">Total Interest</p>
              <p className="font-semibold text-destructive">€{totalInterest.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Indicative only. Final rate subject to credit assessment. Includes 0.12% annual levy (Law 128/75).
        </p>
      </div>
    </div>);

}

// ─── Feature chip ────────────────────────────────────────────────────────────
function FeatureChip({ icon: Icon, label }: {icon?: any;label: string;}) {
  return (
    <div className="flex items-center gap-2 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground hover:border-primary/30 hover:bg-secondary transition-all duration-200">
      <Check className="w-3 h-3 text-primary shrink-0" />
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <span className="font-medium">{label}</span>
    </div>);

}

// ─── Feature section ─────────────────────────────────────────────────────────
function FeatureSection({ title, features, accent }: {title: string;features: {icon?: any;label: string;}[];accent: string;}) {
  if (features.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-1 h-3.5 rounded-full ${accent}`} />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border">{features.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {features.map((f) => <FeatureChip key={f.label} icon={f.icon} label={f.label} />)}
      </div>
    </div>);

}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ children, className = "" }: {children: React.ReactNode;className?: string;}) {
  return (
    <div className={`glass-card rounded-2xl border border-border overflow-hidden ${className}`}>
      {children}
    </div>);

}

function SectionHeader({ icon: Icon, title, badge }: {icon?: any;title: string;badge?: React.ReactNode;}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <h4 className="font-display font-semibold text-sm">{title}</h4>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );






}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }: {label: string;value: string | number;}) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-right capitalize">{value}</span>
    </div>);

}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PropertyDetail() {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();

  const { data: dbListing, isLoading } = useListing(id || "");
  const ownerIsPro = !!(dbListing as any)?.ownerIsPro;
  // Video viewing: Pro users or retailers (individuals) get access; others must upgrade
  const isRetailer = profile?.role === "individual";
  const canVideoView = isPro || isRetailer;
  const { data: similarFromDb = [] } = useSimilarListings({
    excludeId: id ?? dbListing?.id,
    city: dbListing?.city,
    propertyType: dbListing?.property_type,
    listingType: dbListing?.listing_type,
    price: dbListing ? Number(dbListing.price) : undefined,
    limit: 8
  });

  // Redirect: if auction opened via /property/:id, send to /auction/:id
  useEffect(() => {
    if (dbListing && dbListing.listing_type === "auction" && location.pathname.startsWith("/property/")) {
      navigate(`/auction/${id}`, { replace: true });
    }
  }, [dbListing, location.pathname, id, navigate]);

  const [currentImage, setCurrentImage] = useState(0);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [reportPurchased, setReportPurchased] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [walkScore, setWalkScore] = useState<number | null>(null);
  const [auctionAlertOpen, setAuctionAlertOpen] = useState(false);

  // AI Market Insights — dynamically loaded from property-valuation edge function
  const [aiInsightsData, setAiInsightsData] = useState<{
    vsMarket: number;
    rentalYield: number;
    estimatedValue: number;
    marketComparison: string;
    confidenceLabel: string;
  } | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsLoaded, setAiInsightsLoaded] = useState(false);

  useEffect(() => {
    if (!dbListing || aiInsightsLoaded) return;
    setAiInsightsLoaded(true);
    setAiInsightsLoading(true);
    const listingId = id ?? dbListing.id;
    const invokeValuation = async () => {
      try {
        // Try OS report API first when we have a listing id
        if (listingId) {
          const { data: osRes } = await supabaseClient.functions.invoke("fetch-report-from-os", {
            body: { listing_id: listingId, report_type: "valuation" }
          });
          if (osRes?.ok && osRes.report && typeof (osRes.report as any).estimatedValue === "number") {
            const r = osRes.report as any;
            setAiInsightsData({
              vsMarket: r.marketComparisonPct ?? 0,
              rentalYield: r.rentalYieldEstimate ?? 0,
              estimatedValue: r.estimatedValue ?? 0,
              marketComparison: r.marketComparison ?? "at_market",
              confidenceLabel: r.confidenceLabel ?? "Medium"
            });
            setAiInsightsLoading(false);
            return;
          }
        }
        const { data, error: fnErr } = await supabaseClient.functions.invoke("property-valuation", {
          body: {
            title: dbListing.title,
            city: dbListing.city,
            address: dbListing.address,
            price: Number(dbListing.price),
            sqm: Number(dbListing.sqm),
            bedrooms: dbListing.bedrooms,
            bathrooms: dbListing.bathrooms,
            propertyType: dbListing.property_type,
            listingType: dbListing.listing_type,
            floor: dbListing.floor,
            yearBuilt: dbListing.year_built,
            energyClass: dbListing.energy_class,
            pricePerSqm: dbListing.price_per_sqm ? Number(dbListing.price_per_sqm) : undefined,
            hasParking: dbListing.has_parking,
            hasPool: dbListing.has_pool,
            hasElevator: dbListing.has_elevator,
            region: dbListing.region,
            // Ownership info affects valuation for auction properties
            ownershipStatus: (() => {
              const t: string[] = (dbListing as any)?.tags ?? [];
              const tag = t.find((x: string) => x.startsWith("ownership:") && !x.startsWith("ownership_pct:"));
              return tag ? tag.replace("ownership:", "") : undefined;
            })(),
            ownershipPercentage: (() => {
              const t: string[] = (dbListing as any)?.tags ?? [];
              const tag = t.find((x: string) => x.startsWith("ownership_pct:"));
              return tag ? Number(tag.replace("ownership_pct:", "")) : undefined;
            })()
          }
        });
        if (data && !data.error) {
          setAiInsightsData({
            vsMarket: data.marketComparisonPct ?? 0,
            rentalYield: data.rentalYieldEstimate ?? 0,
            estimatedValue: data.estimatedValue ?? Number(dbListing.price),
            marketComparison: data.marketComparison ?? "at_market",
            confidenceLabel: data.confidenceLabel ?? "Medium"
          });
        } else if (isAiUsageLimitError(fnErr, data)) {
          toast.error("AI insights are temporarily unavailable due to usage limits. Please try again later.");
        }
      } catch (e) {
        if (isAiUsageLimitError(e, null)) toast.error("AI insights are temporarily unavailable due to usage limits. Please try again later.");
      } finally {
        setAiInsightsLoading(false);
      }
    };
    invokeValuation();
  }, [dbListing, aiInsightsLoaded]);

  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const startConversation = useStartConversation();

  const isFavorited = favorites.some((f: any) => f.listing_id === id);

  const handleFavorite = () => {
    if (!user) {toast.error("Sign in to save properties");return;}
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };

  const handleContact = async () => {
    if (!user) {toast.error("Sign in to contact the owner");navigate("/login");return;}
    const ownerId = dbListing ?
    (dbListing as any).profiles?.user_id ?? (dbListing as any).owner_id :
    undefined;
    if (!ownerId) {toast.info("Contact details not available");return;}
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch {toast.error("Could not start conversation");}
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>);

  }

  if (!dbListing) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container pt-32 text-center">
          <p className="text-muted-foreground">Property not found.</p>
          <Button className="mt-4" onClick={() => navigate("/listings")}>Back to Listings</Button>
        </div>
        <Footer />
      </div>);

  }

  const db = dbListing;
  const title = db.title;
  const city = db.city;
  // Use DB address; fall back to city
  const address = db.address ?? city;
  const price = Number(db.price);
  const sqm = Number(db.sqm);
  const bedrooms = db.bedrooms;
  const bathrooms = db.bathrooms;
  const listingType = db.listing_type;
  const propertyType = db.property_type;
  const subtype = (db as any)?.commercial_subtype as string | null;
  const description = db.description;
  const ownerProfile = (dbListing as any).profiles;
  const ownerParticipantType = (dbListing as any).ownerParticipantType ?? null;
  const pricePerSqm = db.price_per_sqm;
  const energyClass = db.energy_class;
  const isLandType = propertyType === "land";
  const isAuction = listingType === "auction";
  const websiteUrl = (db as any)?.website_url as string | null;

  // Extract ownership info from tags (for auction listings)
  const tags: string[] = (db as any)?.tags ?? [];
  const ownershipTag = tags.find((t: string) => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
  const ownershipStatus = ownershipTag ? ownershipTag.replace("ownership:", "") : null;
  const ownershipPctTag = tags.find((t: string) => t.startsWith("ownership_pct:"));
  const ownershipPct = ownershipPctTag ? Number(ownershipPctTag.replace("ownership_pct:", "")) : null;

  const OWNERSHIP_LABEL: Record<string, {label: string;cls: string;}> = {
    full: { label: "Πλήρης κυριότητα (100%)", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    partial: { label: "Μερική κυριότητα", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    common: { label: "Εξ αδιαιρέτου", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
    none: { label: "Χωρίς κυριότητα", cls: "bg-destructive/15 text-destructive border-destructive/30" }
  };
  const ownershipDisplay = ownershipStatus ? OWNERSHIP_LABEL[ownershipStatus] ?? { label: ownershipStatus, cls: "bg-muted text-muted-foreground border-border" } : null;

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {await navigator.share({ title, url });} catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const dbImages = [
  ...(db.cover_image_url ? [db.cover_image_url] : []),
  ...((dbListing as any).listing_images?.map((img: any) => img.url) || [])];


  // Street View fallback via proxy (key never in client URLs)
  const streetViewFallback = (() => {
    if (db.latitude != null && db.longitude != null) {
      return getStreetViewProxyUrl({ lat: Number(db.latitude), lng: Number(db.longitude) });
    }
    if (db.address || db.city) {
      return getStreetViewProxyUrl({ location: `${db.address ?? ""} ${db.city ?? ""}`.trim() });
    }
    return null;
  })();

  // Final fallback chain: DB images → Street View → nothing
  const images = dbImages.length ?
  dbImages :
  streetViewFallback ?
  [streetViewFallback] :
  [];

  // ── Feature groups ──────────────────────────────────────────────────────────
  const internalFeatures: {icon?: any;label: string;}[] = [];
  const externalFeatures: {icon?: any;label: string;}[] = [];
  const constructionFeatures: {icon?: any;label: string;}[] = [];
  const suitabilityFeatures: {icon?: any;label: string;}[] = [];

  if (db.has_elevator) internalFeatures.push({ icon: Building2, label: "Elevator" });
  if ((db as any).has_ac) internalFeatures.push({ icon: Thermometer, label: "Air Conditioning" });
  if ((db as any).has_solar_water) internalFeatures.push({ icon: Zap, label: "Solar Water Heating" });
  if (db.has_storage) internalFeatures.push({ icon: Home, label: "Storage Space" });
  if ((db as any).has_secure_door) internalFeatures.push({ icon: Shield, label: "Secure Door" });
  if ((db as any).has_alarm) internalFeatures.push({ icon: Shield, label: "Alarm" });
  if ((db as any).has_cctv) internalFeatures.push({ icon: Eye, label: "CCTV" });
  if (db.has_security) internalFeatures.push({ icon: Shield, label: "Security System" });
  if ((db as any).has_fireplace) internalFeatures.push({ icon: Flame, label: "Fireplace" });
  if ((db as any).has_underfloor_heating) internalFeatures.push({ icon: Thermometer, label: "Underfloor Heating" });
  if ((db as any).has_furnished) internalFeatures.push({ icon: Home, label: "Furnished" });
  if ((db as any).has_internal_staircase) internalFeatures.push({ label: "Internal Staircase" });
  if ((db as any).has_double_glazing) internalFeatures.push({ label: "Double Glazed Windows" });
  if ((db as any).has_window_screens) internalFeatures.push({ label: "Window Screens" });
  if ((db as any).has_night_power) internalFeatures.push({ icon: Zap, label: "Night Power Rate" });
  if ((db as any).has_attic) internalFeatures.push({ label: "Attic" });
  if ((db as any).has_satellite) internalFeatures.push({ icon: Wifi, label: "Satellite Receiver" });
  if (db.has_smart_home) internalFeatures.push({ icon: Wifi, label: "Smart Home" });
  if ((db as any).has_equipped) internalFeatures.push({ icon: Wrench, label: "Equipped / Fitted-out" });
  if ((db as any).has_three_phase_power) internalFeatures.push({ icon: Zap, label: "3-Phase Electricity" });
  if ((db as any).has_structured_cabling) internalFeatures.push({ label: "Structured Cabling" });

  if (db.has_parking) externalFeatures.push({ icon: Car, label: "Parking Space" });
  if ((db as any).has_balcony) externalFeatures.push({ label: "Balcony" });
  if (db.has_garden) externalFeatures.push({ icon: TreePine, label: "Garden" });
  if (db.has_pool) externalFeatures.push({ label: "Swimming Pool" });
  if ((db as any).has_view) externalFeatures.push({ icon: Eye, label: "View" });
  if ((db as any).has_facade) externalFeatures.push({ label: "Facade" });
  if ((db as any).has_awning) externalFeatures.push({ label: "Awning" });
  if ((db as any).has_disability_access) externalFeatures.push({ label: "Disability Access" });
  if ((db as any).is_corner) externalFeatures.push({ label: "Corner Property" });
  if ((db as any).has_loading_dock) externalFeatures.push({ label: "Loading Dock" });
  if ((db as any).is_buildable) externalFeatures.push({ label: "Buildable" });
  if ((db as any).within_city_plan) externalFeatures.push({ label: "Within City Plan" });
  if ((db as any).within_settlement) externalFeatures.push({ label: "Within Settlement" });
  if ((db as any).has_water_supply) externalFeatures.push({ icon: Wrench, label: "Water Supply" });
  if ((db as any).has_electricity_supply) externalFeatures.push({ icon: Zap, label: "Electricity Supply" });
  if ((db as any).has_land_concession) externalFeatures.push({ label: "Land Concession" });

  if ((db as any).is_penthouse) constructionFeatures.push({ label: "Penthouse" });
  if ((db as any).is_neoclassical) constructionFeatures.push({ label: "Neoclassical" });
  if ((db as any).is_preserved) constructionFeatures.push({ label: "Preserved Building" });
  if (db.has_virtual_tour) constructionFeatures.push({ label: "Virtual Tour" });
  if (db.has_video_tour) constructionFeatures.push({ label: "Video Tour" });

  if ((db as any).suitable_student) suitabilityFeatures.push({ label: "Students" });
  if ((db as any).suitable_holiday) suitabilityFeatures.push({ label: "Holiday Home" });
  if ((db as any).suitable_investment) suitabilityFeatures.push({ label: "Investment" });
  if ((db as any).suitable_commercial_use) suitabilityFeatures.push({ label: "Commercial Use" });

  const hasAnyFeatures = internalFeatures.length + externalFeatures.length + constructionFeatures.length + suitabilityFeatures.length > 0;

  const similarListings = (similarFromDb as any[]).
  filter((l: any) => l.id !== id).
  slice(0, 6);

  // Build property details rows grouped
  const detailRows: {label: string;value: string;}[] = [
  { label: "Price", value: `€${price.toLocaleString()}` },
  { label: "Price / m²", value: pricePerSqm ? `€${Number(pricePerSqm).toLocaleString()}` : "—" },
  { label: "Surface", value: `${sqm} m²` },
  ...(db.year_built ? [{ label: "Year Built", value: String(db.year_built) }] : []),
  ...(db.floor != null ? [{ label: "Floor", value: db.floor === 0 ? "Ground" : `${db.floor}${db.total_floors ? ` of ${db.total_floors}` : ""}` }] : []),
  ...((db as any)?.levels ? [{ label: "Levels", value: String((db as any).levels) }] : []),
  ...((db as any)?.kitchens ? [{ label: "Kitchens", value: String((db as any).kitchens) }] : []),
  ...((db as any)?.living_rooms ? [{ label: "Living Rooms", value: String((db as any).living_rooms) }] : []),
  ...((db as any)?.wc_count ? [{ label: "WC", value: String((db as any).wc_count) }] : []),
  ...((db as any)?.heating_system ? [{ label: "Heating", value: HEATING_TYPES.find((h) => h.value === (db as any).heating_system)?.label ?? (db as any).heating_system.replace(/_/g, " ") }] : []),
  ...(db.energy_class ? [{ label: "Energy Class", value: db.energy_class }] : []),
  ...((db as any)?.construction_status ? [{ label: "Condition", value: CONDITION_OPTIONS.find((c) => c.value === (db as any).construction_status)?.label ?? (db as any).construction_status.replace(/_/g, " ") }] : []),
  ...(db.cadastre_number ? [{ label: "Cadastre No.", value: db.cadastre_number }] : []),
  ...(db.enfia_zone ? [{ label: "ENFIA Zone", value: db.enfia_zone }] : []),
  ...(db.postal_code ? [{ label: "Postal Code", value: db.postal_code }] : []),
  ...(db.region ? [{ label: "Region", value: db.region }] : []),
  // Land
  ...(isLandType && (db as any)?.coverage_ratio ? [{ label: "Coverage Ratio", value: `${(db as any).coverage_ratio}%` }] : []),
  ...(isLandType && (db as any)?.building_allowance ? [{ label: "Build Allowance", value: `${(db as any).building_allowance} m²` }] : []),
  ...(isLandType && (db as any)?.facade_length ? [{ label: "Facade Length", value: `${(db as any).facade_length} m` }] : []),
  ...(isLandType && (db as any)?.plot_depth ? [{ label: "Plot Depth", value: `${(db as any).plot_depth} m` }] : []),
  ...(isLandType && (db as any)?.slope ? [{ label: "Slope", value: (db as any).slope }] : []),
  ...(isLandType && (db as any)?.zone_type ? [{ label: "Zone", value: (db as any).zone_type }] : []),
  ...(isLandType && (db as any)?.road_type ? [{ label: "Road Type", value: (db as any).road_type }] : []),
  ...(isLandType && (db as any)?.distance_from_sea ? [{ label: "From Sea", value: `${(db as any).distance_from_sea} m` }] : []),
  ...(isLandType && (db as any)?.distance_from_city ? [{ label: "From City", value: `${(db as any).distance_from_city} m` }] : []),
  // Commercial
  ...((db as any)?.commercial_subtype ? [{ label: "Subtype", value: (db as any).commercial_subtype }] : []),
  ...((db as any)?.plot_surface ? [{ label: "Plot Surface", value: `${(db as any).plot_surface} m²` }] : []),
  ...((db as any)?.floor_height ? [{ label: "Floor Height", value: `${(db as any).floor_height} m` }] : []),
  // Meta
  { label: "System Code", value: db.id.slice(0, 8).toUpperCase() },
  { label: "Published", value: new Date(db.created_at).toLocaleDateString("en-GB") },
  { label: "Last Updated", value: new Date(db.updated_at).toLocaleDateString("en-GB") }];


  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-16">
        {/* Breadcrumb */}
        <div className="container py-2 sm:py-3">
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none">
            <Link to="/" className="hover:text-foreground transition-colors shrink-0">Home</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            {isAuction ?
            <Link to="/auctions" className="hover:text-foreground transition-colors shrink-0">Auctions</Link> :
            <Link to="/listings" className="hover:text-foreground transition-colors shrink-0">Listings</Link>
            }
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="text-foreground truncate font-medium">{title}</span>
          </div>
        </div>

        <div className="container pb-24 lg:pb-10">
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">

            {/* ──── LEFT COLUMN ──── */}
            <div className="space-y-5">

              {/* ── Gallery ── */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group shadow-elevated">
                {images.length > 0 ?
                <img
                  src={images[currentImage] || images[0]}
                  alt={title}
                  className="w-full h-full object-cover transition-opacity duration-300" /> :


                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary">
                    <Gavel className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No photos available for this auction</p>
                  </div>
                }

                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  {listingType === "auction" && <span className="badge-auction text-xs font-bold px-3 py-1.5 rounded-full shadow">AUCTION</span>}
                  {listingType === "firesale" && <span className="badge-firesale text-xs font-bold px-3 py-1.5 rounded-full shadow">FIRESALE</span>}
                  {listingType === "rent" && <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow">FOR RENT</span>}
                </div>

                {/* Nav arrows */}
                {images.length > 1 &&
                <>
                    <button
                    className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    onClick={() => setCurrentImage((currentImage - 1 + images.length) % images.length)}>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    onClick={() => setCurrentImage((currentImage + 1) % images.length)}>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                }

                {/* Top right actions — 44px touch targets for mobile */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full backdrop-blur-md shadow transition-all ${isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"}`}
                    onClick={handleFavorite}
                    aria-label={isFavorited ? "Remove from saved" : "Save property"}>
                    <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
                  </button>
                  <button onClick={handleShare} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all" aria-label="Share property">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Counter + views — only when photos exist */}
                {images.length > 0 &&
                <>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">
                      {currentImage + 1} / {images.length}
                    </div>
                    <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs">
                      <Eye className="w-3 h-3 text-muted-foreground" />
                      <span>{db.views_count || 0} views</span>
                    </div>
                  </>
                }
              </div>

              {/* Thumbnails */}
              {images.length > 1 &&
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  {images.map((img, i) =>
                <button key={i} onClick={() => setCurrentImage(i)}
                className={`shrink-0 min-h-[44px] min-w-[44px] w-16 h-11 rounded-lg overflow-hidden transition-all duration-200 ${
                currentImage === i ?
                "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100" :
                "opacity-50 hover:opacity-80"}`
                }>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                )}
                </div>
              }

              {/* ── Title + Price hero ── */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border capitalize">
                        {propertyType}
                      </span>
                      {subtype &&
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/30 capitalize flex items-center gap-1">
                          <LayoutGrid className="w-2.5 h-2.5" />
                          {getSubtypeLabel(propertyType, subtype)}
                        </span>
                      }
                      {listingType &&
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 capitalize">
                          For {listingType}
                        </span>
                      }
                      {energyClass && energyClass !== "Exempt" &&
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ENERGY_COLORS[energyClass] || "bg-secondary"}`}>
                          <Zap className="w-2.5 h-2.5 inline mr-0.5" />{energyClass}
                        </span>
                      }
                    </div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">{title}</h1>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {/* Show full address from DB, fallback to city */}
                        {address && address !== city ? `${address}, ${city}` : city}
                        {db.region ? ` · ${db.region}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-black text-foreground">
                      €{price.toLocaleString()}
                      {listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                    </div>
                    {pricePerSqm &&
                    <div className="text-xs text-muted-foreground mt-0.5">
                        €{Number(pricePerSqm).toLocaleString()} per m²
                      </div>
                    }
                  </div>
                </div>

                {/* Key stats bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {bedrooms != null &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Bed className="w-3.5 h-3.5 text-primary" />{bedrooms} bed
                    </div>
                  }
                  {bathrooms != null &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Bath className="w-3.5 h-3.5 text-primary" />{bathrooms} bath
                    </div>
                  }
                  {(db as any)?.wc_count != null &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Home className="w-3.5 h-3.5 text-primary" />{(db as any).wc_count} WC
                    </div>
                  }
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                    <Square className="w-3.5 h-3.5 text-primary" />{sqm} m²
                  </div>
                  {db.floor != null &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      {db.floor === -1 ? "Basement" : db.floor === 0 ? "Ground floor" : `${db.floor}${["st", "nd", "rd"][db.floor - 1] || "th"} floor`}
                      {db.total_floors ? ` / ${db.total_floors}` : ""}
                    </div>
                  }
                  {db.year_built != null &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Calendar className="w-3.5 h-3.5 text-primary" />Construction year {db.year_built}
                    </div>
                  }
                  {(db as any)?.heating_system &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Thermometer className="w-3.5 h-3.5 text-primary" />{HEATING_TYPES.find((h) => h.value === (db as any).heating_system)?.label ?? (db as any).heating_system.replace(/_/g, " ")}
                    </div>
                  }
                  {(db as any)?.construction_status &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Building2 className="w-3.5 h-3.5 text-primary" />{CONDITION_OPTIONS.find((c) => c.value === (db as any).construction_status)?.label ?? (db as any).construction_status.replace(/_/g, " ")}
                    </div>
                  }
                  {/* Ownership pills — shown for all listing types when present in tags */}
                  {ownershipDisplay &&
                  <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${ownershipDisplay.cls}`}>
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      {ownershipDisplay.label}
                    </div>
                  }
                  {ownershipPct != null && ownershipStatus !== "full" &&
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Tag className="w-3.5 h-3.5 text-primary" />{ownershipPct}%
                    </div>
                  }
                </div>

                {/* Rent extras */}
                {listingType === "rent" &&
                <div className="flex flex-wrap gap-2">
                    {(db as any)?.deposit_months &&
                  <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        🔐 {(db as any).deposit_months}mo deposit
                      </span>
                  }
                    {(db as any)?.monthly_expenses &&
                  <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        💡 €{(db as any).monthly_expenses}/mo expenses
                      </span>
                  }
                    {(db as any)?.pets_allowed &&
                  <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">🐾 Pets OK</span>
                  }
                    {(db as any)?.agent_fee_included &&
                  <span className="px-2.5 py-1 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-xs font-medium text-brand-emerald">✓ No Agent Fee</span>
                  }
                    {(db as any)?.short_term_rental &&
                  <span className="px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-xs font-medium text-brand-gold">📅 Short-term OK</span>
                  }
                  </div>
                }
              </div>

              {/* ── AI Market Insights — dynamic from property-valuation ── */}
              <Section>
                <SectionHeader icon={Zap} title="AI Market Insights" badge={
                <span className="text-[10px] text-muted-foreground">Powered by mAI Prop OS</span>
                } />
                <div className="p-5 space-y-4">
                  {aiInsightsLoading &&
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Analysing market data…</span>
                    </div>
                  }
                  {!aiInsightsLoading && aiInsightsData && (() => {
                    const cmpCfg: Record<string, {label: string;color: string;bg: string;}> = {
                      below_market: { label: "Below Market", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
                      at_market: { label: "At Market", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
                      above_market: { label: "Above Market", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" }
                    };
                    const cmp = cmpCfg[aiInsightsData.marketComparison] ?? cmpCfg.at_market;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${cmp.bg}`}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">vs Market</p>
                          <div className="flex items-baseline gap-1">
                            <span className={`font-display font-black text-3xl ${cmp.color}`}>
                              {aiInsightsData.vsMarket > 0 ? "+" : ""}{aiInsightsData.vsMarket}%
                            </span>
                          </div>
                          <p className={`text-[10px] font-semibold ${cmp.color}`}>{cmp.label}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Rental Yield</p>
                          <div className="flex items-baseline gap-1">
                            <span className="font-display font-black text-3xl text-primary">{aiInsightsData.rentalYield}%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Est. gross annual yield</p>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">AI Estimate</p>
                          <div className="flex items-baseline gap-1">
                            <span className="font-display font-black text-3xl text-foreground">
                              €{(aiInsightsData.estimatedValue / 1000).toFixed(0)}k
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Confidence: {aiInsightsData.confidenceLabel}</p>
                        </div>
                      </div>);

                  })()}
                  {!aiInsightsLoading && !aiInsightsData &&
                  <p className="text-xs text-muted-foreground text-center py-4">Market analysis unavailable</p>
                  }
                </div>
              </Section>

              {/* ── Description (hidden for auctions) ── */}
              {!isAuction && description &&
              <Section>
                  <SectionHeader icon={FileText} title="Description" />
                  <div className="p-6">
                    <div className={`text-sm text-muted-foreground leading-relaxed ${!descExpanded ? "line-clamp-4" : ""}`}>
                      {description}
                    </div>
                    {description.length > 200 &&
                  <button onClick={() => setDescExpanded(!descExpanded)}
                  className="flex items-center gap-1 text-xs text-primary mt-3 hover:underline font-medium">
                        {descExpanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Read more</>}
                      </button>
                  }
                  </div>
                </Section>
              }

              {/* ── Auction Details (shown first for auction listings) ── */}
              {isAuction &&
              <Section>
                  <SectionHeader icon={Gavel} title="Auction Details" badge={
                <span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">LIVE</span>
                } />
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="glass-card rounded-xl p-4 border border-border text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Auction Date</p>
                        <p className="font-display font-bold text-sm">
                          {db.auction_date ?
                        new Date(db.auction_date).toLocaleDateString("en-GB") :
                        "TBC"}
                        </p>
                      </div>
                      <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
                        <p className="font-display font-bold text-sm text-brand-gold">
                          €{(Number(db.auction_starting_bid) || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Ownership status row */}
                    {ownershipDisplay &&
                  <div className="flex items-center justify-between rounded-xl bg-secondary border border-border px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">Ownership Status</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ownershipDisplay.cls}`}>
                            {ownershipDisplay.label}
                          </span>
                          {ownershipPct != null && ownershipStatus !== "full" &&
                      <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full border border-border">
                              {ownershipPct}%
                            </span>
                      }
                        </div>
                      </div>
                  }

                    {db.auction_court &&
                  <div>
                        <p className="text-xs text-muted-foreground mb-1">Court / Platform</p>
                        <p className="text-sm font-semibold">{db.auction_court}</p>
                      </div>
                  }
                    <div className="rounded-xl bg-brand-gold/8 border border-brand-gold/20 p-3 text-xs text-muted-foreground leading-relaxed">
                      ⚡ Judicial auction — buyer conducts own due diligence. maiProp provides AI-powered pre-auction analysis.
                    </div>

                    {/* eAuction.gr CTA — prominent when website_url is present */}
                    {websiteUrl &&
                  <a href={websiteUrl} target="_blank" rel="noreferrer noopener" className="block">
                        <Button className="w-full bg-gradient-gold border-0 text-background font-bold gap-2 h-12 text-base shadow-lg hover:shadow-brand-gold/30 hover:scale-[1.01] transition-all">
                          <ExternalLink className="w-5 h-5" />
                          View on eAuction.gr
                        </Button>
                      </a>
                  }

                    <Button
                    variant={websiteUrl ? "outline" : "default"}
                    className={websiteUrl ?
                    "w-full border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10 gap-2" :
                    "w-full bg-gradient-gold border-0 text-background font-semibold gap-2"
                    }
                    onClick={() => {
                      if (!user) {toast.error("Sign in to set auction alerts");navigate("/login");return;}
                      setAuctionAlertOpen(true);
                    }}>
                    
                      <Bell className="w-4 h-4" />
                      Set Auction Alert
                    </Button>
                  </div>
                </Section>
              }

              {/* ── Property Details ── */}
              <Section>
                <SectionHeader icon={Home} title="Property Details" />
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                    {detailRows.map((row) =>
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                    )}
                  </div>

                  {/* Energy certificate */}
                  {energyClass && energyClass !== "Exempt" && ENERGY_COLORS[energyClass] && (() => {
                    const energyData = ENERGY_SCALE.find((e) => e.cls === energyClass);
                    return (
                      <div className="mt-6 pt-6 border-t border-border">
                        <div className="flex items-center gap-2 mb-4">
                          <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Energy Performance Certificate</p>
                        </div>
                        <div className="flex gap-1 items-end mb-2">
                          {ENERGY_SCALE.map((e, i) => {
                            const isActive = e.cls === energyClass;
                            const barH = 16 + i * 4;
                            return (
                              <div key={e.cls} className="flex-1 flex flex-col items-center gap-0.5">
                                {isActive && <div className="text-[8px] font-black text-foreground">▼</div>}
                                <div
                                  style={{ backgroundColor: e.hex, height: `${barH}px`, opacity: isActive ? 1 : 0.4 }}
                                  className={`w-full rounded-sm flex items-end justify-center pb-0.5 transition-all ${isActive ? "ring-2 ring-white/30 ring-offset-1 ring-offset-card" : ""}`}>
                                  
                                  <span className="text-[8px] font-black leading-none"
                                  style={{ color: ["B", "C", "D"].includes(e.cls) ? "#000" : "#fff" }}>
                                    {e.cls}
                                  </span>
                                </div>
                              </div>);

                          })}
                        </div>
                        {energyData &&
                        <div className="flex items-center gap-2 mt-3">
                            <div className={`px-2 py-0.5 rounded text-xs font-black ${ENERGY_COLORS[energyClass]}`}>
                              {energyClass}
                            </div>
                            <span className="text-xs text-muted-foreground">{energyData.desc}</span>
                          </div>
                        }
                      </div>);

                  })()}
                </div>
              </Section>

              {/* ── Features & Amenities ── */}
              {hasAnyFeatures &&
              <Section>
                  <SectionHeader
                  icon={Check}
                  title="Features & Amenities"
                  badge={
                  <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                        {internalFeatures.length + externalFeatures.length + constructionFeatures.length + suitabilityFeatures.length} features
                      </span>
                  } />
                
                  <div className="p-6 space-y-6">
                    <FeatureSection title="Internal" features={internalFeatures} accent="bg-primary" />
                    <FeatureSection title="External" features={externalFeatures} accent="bg-brand-emerald" />
                    <FeatureSection title="Construction" features={constructionFeatures} accent="bg-accent" />
                    <FeatureSection title="Suitable For" features={suitabilityFeatures} accent="bg-brand-gold" />
                  </div>
                </Section>
              }

              {/* ── Website Link (distinctive section) ── */}
              {websiteUrl &&
              <Section>
                  <SectionHeader icon={Globe} title="Official Website" />
                  

















                
                </Section>
              }

              {/* ── Mini map ── */}
              <div className="rounded-2xl overflow-hidden">
                <PropertyMiniMap
                  latitude={db?.latitude}
                  longitude={db?.longitude}
                  address={address}
                  city={city}
                  title={title}
                  onWalkScoreChange={setWalkScore} />
                
              </div>

              {/* ── Neighbourhood Report ── */}
              <NeighbourhoodReport
                city={city}
                address={address}
                region={db?.region}
                propertyType={propertyType}
                lat={db?.latitude ? Number(db.latitude) : undefined}
                lng={db?.longitude ? Number(db.longitude) : undefined}
                listingId={id ?? undefined} />
              

            </div>

            {/* ──── RIGHT SIDEBAR ──── */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">

              {/* ① Contact / Buy card — Starting Bid FIRST */}
              <div className="glass-card rounded-2xl overflow-hidden border border-primary/10 shadow-elevated">
                {/* Price header */}
                <div className="bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border px-5 py-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                        {listingType === "rent" ? "Monthly Rent" : isAuction ? "Starting Bid" : "Asking Price"}
                      </p>
                      <p className="font-display text-2xl font-black text-foreground">
                        €{(isAuction && db.auction_starting_bid ? Number(db.auction_starting_bid) : price).toLocaleString()}
                        {listingType === "rent" && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                      </p>
                      {isAuction && db.auction_starting_bid &&
                      <p className="text-xs text-muted-foreground mt-0.5">Market value: €{price.toLocaleString()}</p>
                      }
                      {!isAuction && pricePerSqm && <p className="text-xs text-muted-foreground mt-0.5">€{Number(pricePerSqm).toLocaleString()}/m²</p>}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="w-3 h-3" />{db.views_count || 0}
                      </div>
                      <p className="text-[10px] text-muted-foreground">views</p>
                    </div>
                  </div>
                </div>

                {/* Agent info — hidden for auctions */}
                {!isAuction &&
                <div className="px-5 py-4 border-b border-border">
                    {ownerProfile ?
                  <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden shrink-0">
                          {ownerProfile.avatar_url ?
                      <img src={ownerProfile.avatar_url} alt="" className="w-full h-full object-cover" /> :
                      ownerProfile.display_name?.[0] || "O"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{ownerProfile.display_name || "Owner"}</p>
                            {ownerParticipantType === "agent" &&
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">Agent</span>
                        }
                            {ownerParticipantType === "seller" &&
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30">Private Seller</span>
                        }
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ownerParticipantType === "agent" ? "Licensed real estate agent" : ownerParticipantType === "seller" ? "Private seller / landlord" : "Listing owner"}
                          </p>
                        </div>
                        {ownerProfile.verified &&
                    <div className="flex items-center gap-1 text-xs text-primary shrink-0">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </div>
                    }
                      </div> :

                  <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">A</div>
                        <div>
                          <p className="font-semibold text-sm">Licensed Agent</p>
                          <div className="flex items-center gap-1 text-xs text-brand-gold mt-0.5">
                            <Star className="w-3 h-3 fill-current" /><span>Verified</span>
                          </div>
                        </div>
                      </div>
                  }
                  </div>
                }

                {/* Actions */}
                <div className="p-5 space-y-2.5">
                  {isAuction ?
                  <>
                      <Button
                      className="w-full bg-gradient-gold border-0 text-background font-semibold gap-2 h-10"
                      onClick={() => {
                        if (!user) {toast.error("Sign in to set auction alerts");navigate("/login");return;}
                        setAuctionAlertOpen(true);
                      }}>
                      
                        <Bell className="w-4 h-4" />
                        Set Auction Alert
                      </Button>
                      {websiteUrl &&
                    <a
                      href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                      target="_blank"
                      rel="noopener noreferrer">
                      
                          <Button variant="outline" className="w-full border-border gap-2 h-9 text-xs">
                            <ExternalLink className="w-3.5 h-3.5" />View on eAuction.gr
                          </Button>
                        </a>
                    }
                    </> :

                  ownerIsPro ?
                  <>
                      <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2 h-10"
                    onClick={handleContact} disabled={startConversation.isPending}>
                        {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        Send Message
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-border gap-1.5 h-9 text-xs">
                          <Phone className="w-3.5 h-3.5" />Call
                        </Button>
                        <Button variant="outline" className="border-border gap-1.5 h-9 text-xs" onClick={() => user ? setViewingOpen(true) : (toast.error("Sign in to request a viewing"), navigate("/login"))}>
                          <Calendar className="w-3.5 h-3.5" />Viewing
                        </Button>
                      </div>
                      <Button
                      variant="outline"
                      className="w-full border-border gap-2 h-9 text-xs"
                      onClick={() => {
                        if (!user) {toast.error("Sign in to request a viewing");navigate("/login");return;}
                        if (canVideoView) setViewingOpen(true);else
                        toast.info("Video viewing is available for Pro users, or free for retailers."), navigate("/pricing");
                      }}>
                      
                        <Video className="w-3.5 h-3.5" />Video Viewing{!canVideoView && <Lock className="w-3 h-3 ml-0.5 opacity-60" />}
                      </Button>
                    </> :

                  <p className="text-xs text-muted-foreground">Messaging and calendar sync available for Pro property owners.</p>

                  }
                </div>

                {/* Response time — only non-auction */}
                {!isAuction &&
                <div className="px-5 pb-4 text-center">
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />Usually responds within 2 hours
                    </p>
                  </div>
                }
              </div>

              {/* ② Walk Score — derived from actual POIs loaded in PropertyMiniMap */}
              {walkScore !== null && (() => {
                const colour = walkScoreColour(walkScore);
                const label = walkScoreLabel(walkScore);
                const r = 20,c = 2 * Math.PI * r;
                return (
                  <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-4">
                    <svg width="52" height="52" viewBox="0 0 56 56" className="shrink-0">
                      <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                      <circle cx="28" cy="28" r={r} fill="none"
                      stroke={colour} strokeWidth="4"
                      strokeDasharray={`${c * walkScore / 100} ${c * (1 - walkScore / 100)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 28 28)" />
                      
                      <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="900" fill={colour}>{walkScore}</text>
                    </svg>
                    <div>
                      <p className="text-sm font-bold" style={{ color: colour }}>{label}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Walk Score</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Based on actual nearby amenities</p>
                    </div>
                  </div>);

              })()}

              {/* ③ AI Property Valuation — unlocked for Pro users */}
              {isPro ?
              <PropertyValuation
                title={title}
                city={city}
                address={address}
                price={price}
                sqm={sqm}
                bedrooms={bedrooms}
                bathrooms={bathrooms}
                propertyType={propertyType}
                listingType={db?.listing_type}
                floor={db?.floor}
                totalFloors={db?.total_floors}
                yearBuilt={db?.year_built}
                heatingSystem={(db as any)?.heating_system ?? undefined}
                energyClass={energyClass}
                pricePerSqm={pricePerSqm ? Number(pricePerSqm) : undefined}
                hasParking={db?.has_parking}
                hasPool={db?.has_pool}
                hasElevator={db?.has_elevator}
                hasGarden={db?.has_garden}
                hasStorage={db?.has_storage}
                hasBalcony={db?.has_balcony}
                hasView={db?.has_view}
                hasFurnished={db?.has_furnished}
                region={db?.region}
                description={db?.description}
                tags={db?.tags}
                ownershipStatus={ownershipStatus ?? undefined}
                ownershipPercentage={ownershipPct ?? undefined}
                auctionCourt={db?.auction_court}
                plotSurface={db?.plot_surface}
                condition={(db as any)?.construction_status ?? undefined}
                isNeoclassical={db?.is_neoclassical}
                isPreserved={db?.is_preserved}
                distanceFromSea={db?.distance_from_sea}
                withinCityPlan={db?.within_city_plan}
                withinSettlement={db?.within_settlement}
                buildingAllowance={db?.building_allowance}
                coverageRatio={db?.coverage_ratio}
                isBuildable={db?.is_buildable}
                cadastreNumber={db?.cadastre_number}
                hasLandConcession={db?.has_land_concession}
                landUse={db?.land_use}
                listingId={id ?? undefined} /> : (


              /* Non-pro: static locked card — no edge function calls */
              <div className="glass-card rounded-2xl overflow-hidden border border-primary/20">
                  <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
                    <Zap className="w-4 h-4 text-primary" />
                    <h4 className="font-display font-semibold text-sm flex-1">AI Property Valuation</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">Pro</span>
                  </div>
                  <div className="p-6 flex flex-col items-center gap-4 text-center">
                    {/* Blurred mock data */}
                    <div className="w-full pointer-events-none select-none blur-[5px] opacity-50 space-y-3">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">AI Estimated Value</p>
                          <p className="font-display font-black text-2xl text-foreground">€███,███</p>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">€███,███ — €███,███</p>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <div className="w-14 h-14 rounded-full bg-muted border-4 border-brand-emerald/40" />
                          <div className="w-14 h-14 rounded-full bg-muted border-4 border-primary/30" />
                        </div>
                      </div>
                      <div className="bg-secondary/60 border border-border rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground">Pricing position</span>
                        <span className="font-bold text-brand-emerald">Underpriced</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary/50 rounded-lg px-2.5 py-2 h-9" />
                        <div className="bg-secondary/50 rounded-lg px-2.5 py-2 h-9" />
                      </div>
                    </div>
                    <Lock className="w-6 h-6 text-primary" />
                    <div>
                      <p className="font-display font-bold text-sm">Pro Feature</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[200px]">
                        Full AI valuation — price range, confidence, legal &amp; tax overlay, key factors.
                      </p>
                    </div>
                    <Link to="/pricing" className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                      <Zap className="w-3.5 h-3.5" /> Upgrade to Pro
                    </Link>
                  </div>
                </div>)
              }

              {/* ④ Full AI Property Report */}
              <Section className={reportPurchased ? "border-primary/30" : ""}>
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0">
                      <BarChart2 className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold text-sm">Full AI Property Report</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold font-bold">PREMIUM</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                        Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {["Cadastre Verification", "5-Year Price History", "Comparable Sales", "Investment Projection", "Legal Status Check", "Neighborhood Score"].map((item) => {}



                        )}
                      </div>
                      {!reportPurchased ?
                      <div className="flex items-center gap-3 flex-wrap">
                          <Button className="bg-gradient-primary border-0 text-primary-foreground text-sm" onClick={() => setReportPurchased(true)}>
                            Unlock Report — €29
                          </Button>
                          <span className="text-xs text-muted-foreground">One-time · instant access</span>
                        </div> :

                      <Button variant="outline" className="border-primary/30 text-primary gap-2 text-sm">
                          <Download className="w-4 h-4" /> Download PDF
                        </Button>
                      }
                    </div>
                  </div>
                </div>
              </Section>

              {/* Professional add-ons — valuation & legal */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5 text-brand-gold" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">Professional Add-ons</h4>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">Formal valuation reports, legal due diligence, and building legality checks — book accredited professionals in your area.</p>
                  <Link
                    to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    
                    Find valuers &amp; lawyers in {city || "Greece"} <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* ⑤ Verified listing badge — hidden for auctions */}
              {!isAuction


















              }

              {/* ⑥ Mortgage Calculator — hidden for auctions and rentals */}
              {!isAuction && listingType !== "rent" && <MortgageCalculator price={price} />}

              {/* ROI Calculator — for investors */}
              {!isAuction &&
              <ROICalculator defaultPrice={price} defaultSqm={sqm ?? 80} />
              }

              {/* Due diligence checklist — for logged-in users */}
              {user && !isAuction &&
              <DealChecklist entityType="listing" entityId={id} />
              }

              {/* Rental Summary */}
              {listingType === "rent" &&
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Euro className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <h4 className="font-display font-semibold text-sm">Rental Summary</h4>
                  </div>
                  <div className="p-5 space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Monthly Rent</span>
                      <span className="font-semibold text-sm">€{price.toLocaleString()}</span>
                    </div>
                    {(db as any)?.monthly_expenses &&
                  <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Shared Expenses</span>
                        <span className="text-sm">€{(db as any).monthly_expenses}</span>
                      </div>
                  }
                    {(db as any)?.deposit_months &&
                  <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Deposit</span>
                        <span className="text-sm">{(db as any).deposit_months}mo · €{(price * (db as any).deposit_months).toLocaleString()}</span>
                      </div>
                  }
                    <div className="pt-2.5 border-t border-border flex justify-between font-semibold">
                      <span className="text-xs text-muted-foreground">Total Move-in Cost</span>
                      <span className="text-primary">€{(price * (1 + ((db as any)?.deposit_months || 0))).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              }

              {/* Report error */}
              <div className="text-center pt-1">
                <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto transition-colors">
                  <Info className="w-3 h-3" />Found an error? Report this listing
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Similar Listings / Similar Deals */}
        {similarListings.length > 0 &&
        <div className="container pb-16">
            <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" />
              {isAuction ? "Similar Deals" : "Similar Listings"}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              {isAuction ? "More auctions from the OS database" : "Related properties you might like"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarListings.map((l: any) =>
            <PropertyCard key={l.id} property={dbListingToCard(l, { includeOwnership: true, includeRaw: true, maxImages: 3 })} />
            )}
            </div>
          </div>
        }
      </div>

      <Footer />

      <ViewingDialog
        open={viewingOpen}
        onClose={() => setViewingOpen(false)}
        canVideoView={canVideoView}
        ownerId={(db as any).owner_id ?? (db as any).profiles?.user_id ?? ""}
        property={{
          id: db.id, title: db.title, city: db.city,
          price: Number(db.price), sqm: Number(db.sqm),
          type: db.property_type as any, listingType: db.listing_type as any,
          images: images, address: db.address || db.city,
          tags: []
        }} />
      

      <AIAssistantWidget
        propertyContext={{
          title: db.title,
          city: db.city,
          address: db.address,
          price: Number(db.price),
          pricePerSqm: db.price_per_sqm ? Number(db.price_per_sqm) : undefined,
          sqm: Number(db.sqm),
          bedrooms: db.bedrooms,
          bathrooms: db.bathrooms,
          propertyType: db.property_type,
          listingType: db.listing_type,
          floor: db.floor,
          yearBuilt: db.year_built,
          energyClass: db.energy_class,
          heatingSystem: (db as any).heating_system,
          hasParking: db.has_parking,
          hasPool: db.has_pool,
          hasElevator: db.has_elevator,
          hasGarden: db.has_garden,
          hasBalcony: (db as any).has_balcony,
          hasAC: (db as any).has_ac,
          hasFireplace: (db as any).has_fireplace,
          hasFurnished: (db as any).has_furnished,
          hasStorage: db.has_storage,
          hasSmartHome: db.has_smart_home,
          petsAllowed: (db as any).pets_allowed,
          hasView: (db as any).has_view,
          latitude: db.latitude,
          longitude: db.longitude,
          region: db.region
        }} />
      

      {/* Auction Alert Modal */}
      <AuctionAlertModal
        open={auctionAlertOpen}
        onClose={() => setAuctionAlertOpen(false)} />
      
    </div>);

}