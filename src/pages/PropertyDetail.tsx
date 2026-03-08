import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Share2, Phone, MessageSquare,
  Calendar, Video, ChevronLeft, ChevronRight, Star, TrendingUp,
  Shield, FileText, Zap, ExternalLink, Lock, BarChart2, Eye,
  Home, Clock, Check, Gavel, Download, Loader2, CheckCircle,
  Thermometer, Wrench, TreePine, Flame, Wifi, Car, Building2,
  Info, ChevronDown, ChevronUp, Euro, Tag, Layers, LayoutGrid
} from "lucide-react";
import { getSubtypeLabel, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import { mockProperties } from "@/data/mockProperties";
import ViewingDialog from "@/components/ViewingDialog";
import { useListing, useListings } from "@/hooks/useListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import PropertyValuation from "@/components/PropertyValuation";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import AIAssistantWidget from "@/components/AIAssistantWidget";

// ─── Energy class data ──────────────────────────────────────────────────────
const ENERGY_SCALE = [
  { cls: "A+", hex: "#1a9e4f", pct: 8,  desc: "< 33 kWh/m²·yr — Excellent" },
  { cls: "A",  hex: "#2db84e", pct: 17, desc: "33–50 kWh/m²·yr — Very Good" },
  { cls: "B+", hex: "#7dc73a", pct: 26, desc: "50–75 kWh/m²·yr — Good" },
  { cls: "B",  hex: "#b5d934", pct: 35, desc: "75–100 kWh/m²·yr — Above Average" },
  { cls: "C",  hex: "#f5d31b", pct: 50, desc: "100–125 kWh/m²·yr — Average" },
  { cls: "D",  hex: "#f5a623", pct: 62, desc: "125–160 kWh/m²·yr — Below Average" },
  { cls: "E",  hex: "#f07320", pct: 74, desc: "160–200 kWh/m²·yr — Poor" },
  { cls: "F",  hex: "#e84020", pct: 86, desc: "200–250 kWh/m²·yr — Very Poor" },
  { cls: "G",  hex: "#cc1414", pct: 100, desc: "> 250 kWh/m²·yr — Extremely Poor" },
];
const ENERGY_COLORS: Record<string, string> = {
  "A+": "bg-[#1a9e4f] text-white",
  "A":  "bg-[#2db84e] text-white",
  "B+": "bg-[#7dc73a] text-white",
  "B":  "bg-[#b5d934] text-black",
  "C":  "bg-[#f5d31b] text-black",
  "D":  "bg-[#f5a623] text-black",
  "E":  "bg-[#f07320] text-white",
  "F":  "bg-[#e84020] text-white",
  "G":  "bg-[#cc1414] text-white",
};

// ─── Mortgage calculator ──────────────────────────────────────────────────────
function MortgageCalculator({ price }: { price: number }) {
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate]       = useState(3.8);
  const [years, setYears]     = useState(20);

  const down    = Math.round(price * (downPct / 100));
  const loan    = price - down;
  const monthly = loan > 0
    ? Math.round(loan * (rate / 1200) / (1 - Math.pow(1 + rate / 1200, -years * 12)))
    : 0;
  const totalPaid     = monthly * years * 12;
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
          { label: "Loan Term", value: `${years} yrs`, sub: `${years * 12} payments`, min: 5, max: 30, step: 5, val: years, set: setYears },
        ].map(s => (
          <div key={s.label} className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-foreground">{s.value}</span>
                <span className="text-[10px] text-muted-foreground">{s.sub}</span>
              </div>
            </div>
            <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
              onChange={e => s.set(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer accent-primary bg-border" />
          </div>
        ))}

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
    </div>
  );
}

// ─── Feature chip ────────────────────────────────────────────────────────────
function FeatureChip({ icon: Icon, label }: { icon?: any; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground hover:border-primary/30 hover:bg-secondary transition-all duration-200">
      <Check className="w-3 h-3 text-primary shrink-0" />
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <span className="font-medium">{label}</span>
    </div>
  );
}

// ─── Feature section ─────────────────────────────────────────────────────────
function FeatureSection({ title, features, accent }: { title: string; features: { icon?: any; label: string }[]; accent: string }) {
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
        {features.map(f => <FeatureChip key={f.label} icon={f.icon} label={f.label} />)}
      </div>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card rounded-2xl border border-border overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon?: any; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/50">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <h3 className="font-display font-semibold text-sm">{title}</h3>
      {badge && <div className="ml-auto">{badge}</div>}
    </div>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-right capitalize">{value}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: dbListing, isLoading } = useListing(id || "");
  const { data: dbSimilar = [] } = useListings({ city: dbListing?.city });

  const mockProperty = mockProperties.find(p => p.id === id) || mockProperties[0];
  const isDbListing = !!dbListing;

  const [currentImage, setCurrentImage] = useState(0);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [reportPurchased, setReportPurchased] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [walkScore, setWalkScore] = useState<number | null>(null);

  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const startConversation = useStartConversation();

  const isFavorited = favorites.some((f: any) => f.listing_id === id);

  const handleFavorite = () => {
    if (!user) { toast.error("Sign in to save properties"); return; }
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };

  const handleContact = async () => {
    if (!user) { toast.error("Sign in to contact the owner"); navigate("/login"); return; }
    const ownerId = isDbListing ? (dbListing as any).profiles?.user_id : undefined;
    if (!ownerId) { toast.info("Contact details not available"); return; }
    try {
      await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages");
    } catch { toast.error("Could not start conversation"); }
  };

  const dbImages = dbListing
    ? [
        ...(dbListing.cover_image_url ? [dbListing.cover_image_url] : []),
        ...((dbListing as any).listing_images?.map((img: any) => img.url) || []),
      ]
    : null;
  const images = dbImages?.length ? dbImages : mockProperty.images;

  if (isLoading && !mockProperties.find(p => p.id === id)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const db = isDbListing ? dbListing : null;
  const title = db?.title ?? mockProperty.title;
  const city = db?.city ?? mockProperty.city;
  const address = db?.address ?? mockProperty.address ?? city;
  const price = Number(db?.price ?? mockProperty.price);
  const sqm = Number(db?.sqm ?? mockProperty.sqm);
  const bedrooms = db?.bedrooms ?? mockProperty.bedrooms;
  const bathrooms = db?.bathrooms ?? mockProperty.bathrooms;
  const listingType = db?.listing_type ?? mockProperty.listingType;
  const propertyType = db?.property_type ?? mockProperty.type;
  const description = db?.description;
  const ownerProfile = isDbListing ? (dbListing as any).profiles : null;
  const pricePerSqm = db?.price_per_sqm;
  const energyClass = db?.energy_class;
  const isLandType = propertyType === "land";

  // ── Feature groups ──────────────────────────────────────────────────────────
  const internalFeatures: { icon?: any; label: string }[] = [];
  const externalFeatures: { icon?: any; label: string }[] = [];
  const constructionFeatures: { icon?: any; label: string }[] = [];
  const suitabilityFeatures: { icon?: any; label: string }[] = [];

  if (db) {
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
  } else {
    mockProperty.tags?.forEach((t: string) => externalFeatures.push({ label: t }));
  }

  const hasAnyFeatures = internalFeatures.length + externalFeatures.length + constructionFeatures.length + suitabilityFeatures.length > 0;

  const similarListings = isDbListing
    ? (dbSimilar as any[]).filter((l: any) => l.id !== id).slice(0, 4)
    : mockProperties.filter(p => p.id !== id && p.city === city).slice(0, 4);

  const aiInsights = [
    { label: "Investment Score", value: `${(db?.ai_score ?? mockProperty.aiScore) || 82}`, unit: "/100", trend: "+3 this month", color: "text-primary" },
    { label: "vs Market", value: "-8%", unit: "below avg", trend: "Good deal", color: "text-brand-emerald" },
    { label: "Rental Yield", value: "4.8%", unit: "p.a. est.", trend: "Stable", color: "text-brand-gold" },
    { label: "Capital Growth", value: "+12%", unit: "5yr", trend: "Athens avg +9%", color: "text-accent" },
  ];

  // Build property details rows grouped
  const detailRows: { label: string; value: string }[] = [
    { label: "Price", value: `€${price.toLocaleString()}` },
    { label: "Price / m²", value: pricePerSqm ? `€${Number(pricePerSqm).toLocaleString()}` : "—" },
    { label: "Surface", value: `${sqm} m²` },
    ...(isDbListing && db?.year_built ? [{ label: "Year Built", value: String(db.year_built) }] : []),
    ...(isDbListing && db?.floor != null ? [{ label: "Floor", value: db.floor === 0 ? "Ground" : `${db.floor}${db.total_floors ? ` of ${db.total_floors}` : ""}` }] : []),
    ...(isDbListing && (db as any)?.levels ? [{ label: "Levels", value: String((db as any).levels) }] : []),
    ...(isDbListing && (db as any)?.kitchens ? [{ label: "Kitchens", value: String((db as any).kitchens) }] : []),
    ...(isDbListing && (db as any)?.living_rooms ? [{ label: "Living Rooms", value: String((db as any).living_rooms) }] : []),
    ...(isDbListing && (db as any)?.wc_count ? [{ label: "WC", value: String((db as any).wc_count) }] : []),
    ...(isDbListing && (db as any)?.heating_system ? [{ label: "Heating", value: (db as any).heating_system.replace("_", " ") }] : []),
    ...(isDbListing && db?.energy_class ? [{ label: "Energy Class", value: db.energy_class }] : []),
    ...(isDbListing && (db as any)?.construction_status ? [{ label: "Construction", value: (db as any).construction_status.replace("_", " ") }] : []),
    ...(isDbListing && db?.cadastre_number ? [{ label: "Cadastre No.", value: db.cadastre_number }] : []),
    ...(isDbListing && db?.enfia_zone ? [{ label: "ENFIA Zone", value: db.enfia_zone }] : []),
    ...(isDbListing && db?.postal_code ? [{ label: "Postal Code", value: db.postal_code }] : []),
    ...(isDbListing && db?.region ? [{ label: "Region", value: db.region }] : []),
    // Land
    ...(isLandType && isDbListing && (db as any)?.coverage_ratio ? [{ label: "Coverage Ratio", value: `${(db as any).coverage_ratio}%` }] : []),
    ...(isLandType && isDbListing && (db as any)?.building_allowance ? [{ label: "Build Allowance", value: `${(db as any).building_allowance} m²` }] : []),
    ...(isLandType && isDbListing && (db as any)?.facade_length ? [{ label: "Facade Length", value: `${(db as any).facade_length} m` }] : []),
    ...(isLandType && isDbListing && (db as any)?.plot_depth ? [{ label: "Plot Depth", value: `${(db as any).plot_depth} m` }] : []),
    ...(isLandType && isDbListing && (db as any)?.slope ? [{ label: "Slope", value: (db as any).slope }] : []),
    ...(isLandType && isDbListing && (db as any)?.zone_type ? [{ label: "Zone", value: (db as any).zone_type }] : []),
    ...(isLandType && isDbListing && (db as any)?.road_type ? [{ label: "Road Type", value: (db as any).road_type }] : []),
    ...(isLandType && isDbListing && (db as any)?.distance_from_sea ? [{ label: "From Sea", value: `${(db as any).distance_from_sea} m` }] : []),
    ...(isLandType && isDbListing && (db as any)?.distance_from_city ? [{ label: "From City", value: `${(db as any).distance_from_city} m` }] : []),
    // Commercial
    ...(isDbListing && (db as any)?.commercial_subtype ? [{ label: "Subtype", value: (db as any).commercial_subtype }] : []),
    ...(isDbListing && (db as any)?.plot_surface ? [{ label: "Plot Surface", value: `${(db as any).plot_surface} m²` }] : []),
    ...(isDbListing && (db as any)?.floor_height ? [{ label: "Floor Height", value: `${(db as any).floor_height} m` }] : []),
    // Meta
    ...(isDbListing ? [
      { label: "System Code", value: db!.id.slice(0, 8).toUpperCase() },
      { label: "Published", value: new Date(db!.created_at).toLocaleDateString("en-GB") },
      { label: "Last Updated", value: new Date(db!.updated_at).toLocaleDateString("en-GB") },
      { label: "Availability", value: (db as any)?.available_from ? `From ${new Date((db as any).available_from).toLocaleDateString("en-GB")}` : "Available now" },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      <div className="pt-16">
        {/* Breadcrumb */}
        <div className="container py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/listings" className="hover:text-foreground transition-colors">Listings</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`/listings?city=${city}`} className="hover:text-foreground transition-colors">{city}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground truncate max-w-[240px] font-medium">{title}</span>
          </div>
        </div>

        <div className="container pb-20">
          <div className="grid lg:grid-cols-[1fr_340px] gap-8">

            {/* ──── LEFT COLUMN ──── */}
            <div className="space-y-5">

              {/* ── Gallery ── */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group shadow-elevated">
                <img
                  src={images[currentImage] || images[0]}
                  alt={title}
                  className="w-full h-full object-cover transition-opacity duration-300"
                />

                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  {listingType === "auction" && <span className="badge-auction text-xs font-bold px-3 py-1.5 rounded-full shadow">AUCTION</span>}
                  {listingType === "firesale" && <span className="badge-firesale text-xs font-bold px-3 py-1.5 rounded-full shadow">FIRESALE</span>}
                  {listingType === "rent" && <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow">FOR RENT</span>}
                </div>

                {/* Nav arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-0 group-hover:opacity-100"
                      onClick={() => setCurrentImage((currentImage - 1 + images.length) % images.length)}>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-0 group-hover:opacity-100"
                      onClick={() => setCurrentImage((currentImage + 1) % images.length)}>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Top right actions */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button
                    className={`p-2.5 rounded-full backdrop-blur-md shadow transition-all ${isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"}`}
                    onClick={handleFavorite}>
                    <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
                  </button>
                  <button className="p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Counter + views */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">
                  {currentImage + 1} / {images.length}
                </div>
                {isDbListing && (
                  <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs">
                    <Eye className="w-3 h-3 text-muted-foreground" />
                    <span>{dbListing.views_count || 0} views</span>
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setCurrentImage(i)}
                      className={`shrink-0 w-16 h-11 rounded-lg overflow-hidden transition-all duration-200 ${
                        currentImage === i
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100"
                          : "opacity-50 hover:opacity-80"
                      }`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* ── Title + Price hero ── */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border capitalize">
                        {propertyType}
                      </span>
                      {listingType && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 capitalize">
                          For {listingType}
                        </span>
                      )}
                      {energyClass && energyClass !== "Exempt" && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ENERGY_COLORS[energyClass] || "bg-secondary"}`}>
                          <Zap className="w-2.5 h-2.5 inline mr-0.5" />{energyClass}
                        </span>
                      )}
                    </div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">{title}</h1>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{address}{address !== city ? `, ${city}` : ""}{db?.region ? ` · ${db.region}` : ""}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-black text-foreground">
                      €{price.toLocaleString()}
                      {listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                    </div>
                    {pricePerSqm && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        €{Number(pricePerSqm).toLocaleString()} per m²
                      </div>
                    )}
                  </div>
                </div>

                {/* Key stats bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {bedrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Bed className="w-3.5 h-3.5 text-primary" />{bedrooms} bed
                    </div>
                  )}
                  {bathrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Bath className="w-3.5 h-3.5 text-primary" />{bathrooms} bath
                    </div>
                  )}
                  {(db as any)?.wc_count != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Home className="w-3.5 h-3.5 text-primary" />{(db as any).wc_count} WC
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                    <Square className="w-3.5 h-3.5 text-primary" />{sqm} m²
                  </div>
                  {db?.floor != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      {db.floor === 0 ? "Ground" : `${db.floor}${["st","nd","rd"][db.floor-1] || "th"}`} floor
                      {db.total_floors ? ` / ${db.total_floors}` : ""}
                    </div>
                  )}
                  {(db as any)?.heating_system && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium capitalize">
                      <Thermometer className="w-3.5 h-3.5 text-primary" />{(db as any).heating_system}
                    </div>
                  )}
                </div>

                {/* Rent extras */}
                {listingType === "rent" && isDbListing && (
                  <div className="flex flex-wrap gap-2">
                    {(db as any)?.deposit_months && (
                      <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        🔐 {(db as any).deposit_months}mo deposit
                      </span>
                    )}
                    {(db as any)?.monthly_expenses && (
                      <span className="px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        💡 €{(db as any).monthly_expenses}/mo expenses
                      </span>
                    )}
                    {(db as any)?.pets_allowed && (
                      <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">🐾 Pets OK</span>
                    )}
                    {(db as any)?.agent_fee_included && (
                      <span className="px-2.5 py-1 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-xs font-medium text-brand-emerald">✓ No Agent Fee</span>
                    )}
                    {(db as any)?.short_term_rental && (
                      <span className="px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-xs font-medium text-brand-gold">📅 Short-term OK</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── AI Market Insights ── */}
              <Section>
                <SectionHeader icon={Zap} title="AI Market Insights" badge={
                  <span className="text-[10px] text-muted-foreground">Powered by mAI Prop OS</span>
                } />
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border">
                  {aiInsights.map(insight => (
                    <div key={insight.label} className="p-5 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{insight.label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`font-display font-black text-2xl ${insight.color}`}>{insight.value}</span>
                        <span className="text-xs text-muted-foreground">{insight.unit}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{insight.trend}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Description ── */}
              <Section>
                <SectionHeader icon={FileText} title="Description" />
                <div className="p-6">
                  <div className={`text-sm text-muted-foreground leading-relaxed ${!descExpanded ? "line-clamp-4" : ""}`}>
                    {description ||
                      `This exceptional property offers a rare combination of modern architecture and premium location in the heart of ${city}. 
                      Featuring high-end finishes throughout, the property benefits from abundant natural light and exceptional views. 
                      The open-plan living area flows seamlessly to a private terrace, while the kitchen is equipped with top-of-the-line appliances. 
                      Ideally positioned near all amenities, transport links, and quality schools — an outstanding opportunity not to be missed.`}
                  </div>
                  {(description?.length ?? 200) > 200 && (
                    <button onClick={() => setDescExpanded(!descExpanded)}
                      className="flex items-center gap-1 text-xs text-primary mt-3 hover:underline font-medium">
                      {descExpanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Read more</>}
                    </button>
                  )}
                </div>
              </Section>

              {/* ── Property Details ── */}
              <Section>
                <SectionHeader icon={Home} title="Property Details" />
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                    {detailRows.map((row) => (
                      <DetailRow key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>

                  {/* Energy certificate */}
                  {energyClass && energyClass !== "Exempt" && ENERGY_COLORS[energyClass] && (() => {
                    const energyData = ENERGY_SCALE.find(e => e.cls === energyClass);
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
                                  className={`w-full rounded-sm flex items-end justify-center pb-0.5 transition-all ${isActive ? "ring-2 ring-white/30 ring-offset-1 ring-offset-card" : ""}`}
                                >
                                  <span className="text-[8px] font-black leading-none"
                                    style={{ color: ["B","C","D"].includes(e.cls) ? "#000" : "#fff" }}>
                                    {e.cls}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {energyData && (
                          <div className="flex items-center gap-2 mt-3">
                            <div className={`px-2 py-0.5 rounded text-xs font-black ${ENERGY_COLORS[energyClass]}`}>
                              {energyClass}
                            </div>
                            <span className="text-xs text-muted-foreground">{energyData.desc}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </Section>

              {/* ── Features & Amenities ── */}
              {hasAnyFeatures && (
                <Section>
                  <SectionHeader
                    icon={Check}
                    title="Features & Amenities"
                    badge={
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                        {internalFeatures.length + externalFeatures.length + constructionFeatures.length + suitabilityFeatures.length} features
                      </span>
                    }
                  />
                  <div className="p-6 space-y-6">
                    <FeatureSection title="Internal" features={internalFeatures} accent="bg-primary" />
                    <FeatureSection title="External" features={externalFeatures} accent="bg-brand-emerald" />
                    <FeatureSection title="Construction" features={constructionFeatures} accent="bg-accent" />
                    <FeatureSection title="Suitable For" features={suitabilityFeatures} accent="bg-brand-gold" />
                  </div>
                </Section>
              )}

              {/* ── Mini map ── */}
              <div className="rounded-2xl overflow-hidden">
                <PropertyMiniMap
                  latitude={db?.latitude}
                  longitude={db?.longitude}
                  address={address}
                  city={city}
                  title={title}
                  onWalkScoreChange={setWalkScore}
                />
              </div>

              {/* ── Neighbourhood Report ── */}
              <NeighbourhoodReport
                city={city}
                address={address}
                region={db?.region}
                propertyType={propertyType}
                lat={db?.latitude ? Number(db.latitude) : undefined}
                lng={db?.longitude ? Number(db.longitude) : undefined}
              />

              {/* ── Auction Details ── */}
              {listingType === "auction" && (
                <Section>
                  <SectionHeader icon={Gavel} title="Auction Details" badge={
                    <span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">LIVE</span>
                  } />
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="glass-card rounded-xl p-4 border border-border text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Auction Date</p>
                        <p className="font-display font-bold text-sm">
                          {isDbListing && dbListing.auction_date
                            ? new Date(dbListing.auction_date).toLocaleDateString("en-GB")
                            : (mockProperty as any).auctionDate || "TBC"}
                        </p>
                      </div>
                      <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
                        <p className="font-display font-bold text-sm text-brand-gold">
                          €{((isDbListing ? Number(dbListing.auction_starting_bid) : (mockProperty as any).auctionStartingBid) || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="glass-card rounded-xl p-4 border border-border text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Market Value</p>
                        <p className="font-display font-bold text-sm">€{price.toLocaleString()}</p>
                      </div>
                    </div>
                    {isDbListing && dbListing.auction_court && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Court / Platform</p>
                        <p className="text-sm font-semibold">{dbListing.auction_court}</p>
                      </div>
                    )}
                    <div className="rounded-xl bg-brand-gold/8 border border-brand-gold/20 p-3 text-xs text-muted-foreground leading-relaxed">
                      ⚡ Judicial auction — buyer conducts own due diligence. maiProp provides AI-powered pre-auction analysis.
                    </div>
                    <Button className="w-full bg-gradient-gold border-0 text-background font-semibold">
                      Set Auction Alert — Get AI Report
                    </Button>
                  </div>
                </Section>
              )}

              {/* ── Premium AI Report ── */}
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
                        Deep-dive: cadastre verification, price history, comparable sales, investment projections, ENFIA calculation, and legal status.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {["Cadastre Verification", "5-Year Price History", "Comparable Sales", "Investment Projection", "Legal Status Check", "Neighborhood Score"].map(item => (
                          <div key={item} className={`flex items-center gap-1.5 text-xs ${reportPurchased ? "text-primary" : "text-muted-foreground"}`}>
                            {reportPurchased ? <Check className="w-3 h-3 text-primary" /> : <Lock className="w-3 h-3" />}
                            {item}
                          </div>
                        ))}
                      </div>
                      {!reportPurchased ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <Button className="bg-gradient-primary border-0 text-primary-foreground text-sm" onClick={() => setReportPurchased(true)}>
                            Unlock Report — €29
                          </Button>
                          <span className="text-xs text-muted-foreground">One-time · instant access</span>
                        </div>
                      ) : (
                        <Button variant="outline" className="border-primary/30 text-primary gap-2 text-sm">
                          <Download className="w-4 h-4" /> Download PDF
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── Similar properties ── */}
              {similarListings.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    Similar in {city}
                    <div className="flex-1 h-px bg-border ml-1" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {isDbListing
                      ? (similarListings as any[]).map((l: any) => (
                          <Link key={l.id} to={`/property/${l.id}`}
                            className="glass-card rounded-xl overflow-hidden block hover:border-primary/40 transition-all duration-200 border border-border group">
                            <div className="aspect-[3/2] overflow-hidden">
                              <img
                                src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60"}
                                alt={l.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            </div>
                            <div className="p-3.5">
                              <p className="font-semibold text-sm truncate">{l.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{l.city} · €{Number(l.price).toLocaleString()} · {l.sqm}m²</p>
                            </div>
                          </Link>
                        ))
                      : (similarListings as any[]).map((p: any) => <PropertyCard key={p.id} property={p} compact />)
                    }
                  </div>
                </div>
              )}
            </div>

            {/* ──── RIGHT SIDEBAR ──── */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">

              {/* Contact card */}
              <div className="glass-card rounded-2xl overflow-hidden border border-primary/10 shadow-elevated">
                {/* Price header */}
                <div className="bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border px-5 py-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                        {listingType === "rent" ? "Monthly Rent" : "Asking Price"}
                      </p>
                      <p className="font-display text-2xl font-black text-foreground">
                        €{price.toLocaleString()}
                        {listingType === "rent" && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                      </p>
                      {pricePerSqm && <p className="text-xs text-muted-foreground mt-0.5">€{Number(pricePerSqm).toLocaleString()}/m²</p>}
                    </div>
                    {isDbListing && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="w-3 h-3" />{dbListing.views_count || 0}
                        </div>
                        <p className="text-[10px] text-muted-foreground">views</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Agent info */}
                <div className="px-5 py-4 border-b border-border">
                  {ownerProfile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden shrink-0">
                        {ownerProfile.avatar_url
                          ? <img src={ownerProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (ownerProfile.display_name?.[0] || "O")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{ownerProfile.display_name || "Owner"}</p>
                        <p className="text-xs text-muted-foreground">Listing Owner</p>
                      </div>
                      {ownerProfile.verified && (
                        <div className="flex items-center gap-1 text-xs text-primary shrink-0">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Verified</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">A</div>
                      <div>
                        <p className="font-semibold text-sm">Licensed Agent</p>
                        <div className="flex items-center gap-1 text-xs text-brand-gold mt-0.5">
                          <Star className="w-3 h-3 fill-current" /><span>Verified</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-5 space-y-2.5">
                  <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2 h-10"
                    onClick={handleContact} disabled={startConversation.isPending}>
                    {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Send Message
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="border-border gap-1.5 h-9 text-xs">
                      <Phone className="w-3.5 h-3.5" />Call
                    </Button>
                    <Button variant="outline" className="border-border gap-1.5 h-9 text-xs" onClick={() => setViewingOpen(true)}>
                      <Calendar className="w-3.5 h-3.5" />Viewing
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full border-border gap-2 h-9 text-xs" onClick={() => setViewingOpen(true)}>
                    <Video className="w-3.5 h-3.5" />Video Viewing
                  </Button>
                </div>

                {/* Response time */}
                <div className="px-5 pb-4 text-center">
                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />Usually responds within 2 hours
                  </p>
                </div>
              </div>

              {/* Verified listing badge */}
              <div className="glass-card rounded-2xl p-4 border border-brand-emerald/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-brand-emerald/10 flex items-center justify-center">
                    <Shield className="w-3.5 h-3.5 text-brand-emerald" />
                  </div>
                  <span className="font-display font-semibold text-sm">Verified Listing</span>
                </div>
                <div className="space-y-2">
                  {["Cadastre verified", "Agent ID checked", "No encumbrances found"].map(item => (
                    <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3 h-3 text-brand-emerald shrink-0" />{item}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 shrink-0" />Last verified: today
                  </div>
                </div>
              </div>

              {/* Walk Score */}
              {walkScore !== null && (() => {
                const colour = walkScoreColour(walkScore);
                const label = walkScoreLabel(walkScore);
                const r = 20, c = 2 * Math.PI * r;
                return (
                  <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-4">
                    <svg width="52" height="52" viewBox="0 0 56 56" className="shrink-0">
                      <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                      <circle cx="28" cy="28" r={r} fill="none"
                        stroke={colour} strokeWidth="4"
                        strokeDasharray={`${c * walkScore / 100} ${c * (1 - walkScore / 100)}`}
                        strokeLinecap="round"
                        transform="rotate(-90 28 28)"
                      />
                      <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="900" fill={colour}>{walkScore}</text>
                    </svg>
                    <div>
                      <p className="text-sm font-bold" style={{ color: colour }}>{label}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Walk Score</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Based on nearby amenities</p>
                    </div>
                  </div>
                );
              })()}

              {/* AI Property Valuation */}
              {isDbListing && (
                <PropertyValuation
                  title={title}
                  city={city}
                  address={address}
                  price={price}
                  sqm={sqm}
                  bedrooms={bedrooms}
                  bathrooms={bathrooms}
                  propertyType={propertyType}
                  listingType={listingType}
                  floor={db?.floor}
                  yearBuilt={db?.year_built}
                  energyClass={energyClass}
                  pricePerSqm={pricePerSqm ? Number(pricePerSqm) : undefined}
                  hasParking={db?.has_parking}
                  hasPool={db?.has_pool}
                  hasElevator={db?.has_elevator}
                  region={db?.region}
                />
              )}

              {/* Mortgage Calculator */}
              {listingType !== "rent" && <MortgageCalculator price={price} />}

              {/* Rental Summary */}
              {listingType === "rent" && isDbListing && (
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
                    {(db as any)?.monthly_expenses && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Shared Expenses</span>
                        <span className="text-sm">€{(db as any).monthly_expenses}</span>
                      </div>
                    )}
                    {(db as any)?.deposit_months && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Deposit</span>
                        <span className="text-sm">{(db as any).deposit_months}mo · €{(price * (db as any).deposit_months).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="pt-2.5 border-t border-border flex justify-between font-semibold">
                      <span className="text-xs text-muted-foreground">Total Move-in Cost</span>
                      <span className="text-primary">€{(price * (1 + ((db as any)?.deposit_months || 0))).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Report error */}
              <div className="text-center pt-1">
                <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto transition-colors">
                  <Info className="w-3 h-3" />Found an error? Report this listing
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      <ViewingDialog
        open={viewingOpen}
        onClose={() => setViewingOpen(false)}
        property={isDbListing ? {
          id: dbListing.id, title: dbListing.title, city: dbListing.city,
          price: Number(dbListing.price), sqm: Number(dbListing.sqm),
          type: dbListing.property_type as any, listingType: dbListing.listing_type as any,
          images: images, address: dbListing.address || dbListing.city,
          tags: []
        } : mockProperty}
      />

      <AIAssistantWidget
        propertyContext={isDbListing ? {
          title: dbListing.title,
          city: dbListing.city,
          address: dbListing.address,
          price: Number(dbListing.price),
          pricePerSqm: dbListing.price_per_sqm ? Number(dbListing.price_per_sqm) : undefined,
          sqm: Number(dbListing.sqm),
          bedrooms: dbListing.bedrooms,
          bathrooms: dbListing.bathrooms,
          propertyType: dbListing.property_type,
          listingType: dbListing.listing_type,
          floor: dbListing.floor,
          yearBuilt: dbListing.year_built,
          energyClass: dbListing.energy_class,
          heatingSystem: (dbListing as any).heating_system,
          hasParking: dbListing.has_parking,
          hasPool: dbListing.has_pool,
          hasElevator: dbListing.has_elevator,
          hasGarden: dbListing.has_garden,
          hasBalcony: (dbListing as any).has_balcony,
          hasAC: (dbListing as any).has_ac,
          hasFireplace: (dbListing as any).has_fireplace,
          hasFurnished: (dbListing as any).has_furnished,
          hasStorage: dbListing.has_storage,
          hasSmartHome: dbListing.has_smart_home,
          petsAllowed: (dbListing as any).pets_allowed,
          hasView: (dbListing as any).has_view,
          latitude: dbListing.latitude,
          longitude: dbListing.longitude,
          region: dbListing.region,
        } : undefined}
      />
    </div>
  );
}
