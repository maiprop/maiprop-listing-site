import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Building2, MapPin, Calendar, Home, Star, ChevronLeft, ChevronRight,
  Zap, Loader2, MessageSquare, Phone, BedDouble, Bath, Maximize2,
  Layers, HardHat, ClipboardList, CheckCircle2, Circle, FileImage, Info,
  Ruler, SquareStack, Trees,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useMessages";
import { toast } from "sonner";
import PropertyValuation from "@/components/PropertyValuation";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import PropertyMiniMap from "@/components/PropertyMiniMap";

function formatPrice(n: number) {
  return "€" + n.toLocaleString("el-GR");
}

// ── Image gallery ─────────────────────────────────────────────────────────────
function Gallery({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  if (!images.length) return (
    <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center">
      <Building2 className="w-16 h-16 text-muted-foreground/40" />
    </div>
  );
  return (
    <div className="relative rounded-2xl overflow-hidden aspect-video bg-muted">
      <img
        src={images[idx]}
        alt=""
        className="w-full h-full object-cover"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % images.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-4" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
      <div className="absolute top-3 left-3">
        <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
          <Building2 className="w-3.5 h-3.5" /> New Build
        </span>
      </div>
    </div>
  );
}

// ── Construction timeline ─────────────────────────────────────────────────────
const CONSTRUCTION_PHASES = [
  { key: "planning",          label: "Planning & Permits",   icon: ClipboardList },
  { key: "foundation",        label: "Foundation",           icon: HardHat },
  { key: "under_construction",label: "Structural Work",      icon: Building2 },
  { key: "topping_out",       label: "Topping Out",          icon: Layers },
  { key: "shell_complete",    label: "Fitting Out",          icon: Home },
  { key: "new",               label: "Completed",            icon: CheckCircle2 },
];

function ConstructionTimeline({ status }: { status: string | null }) {
  if (!status) return null;
  const currentIdx = CONSTRUCTION_PHASES.findIndex(p => p.key === status);
  const activeIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
        <HardHat className="w-4 h-4 text-orange-500" /> Construction Progress
      </h2>
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />
        <div
          className="absolute left-4 top-4 w-0.5 bg-orange-500 transition-all"
          style={{ height: `${(activeIdx / (CONSTRUCTION_PHASES.length - 1)) * 100}%` }}
        />
        <div className="space-y-4">
          {CONSTRUCTION_PHASES.map((phase, idx) => {
            const done = idx < activeIdx;
            const active = idx === activeIdx;
            const Icon = phase.icon;
            return (
              <div key={phase.key} className="flex items-center gap-4 relative">
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  done   ? "bg-orange-500 text-white" :
                  active ? "bg-orange-500 text-white ring-4 ring-orange-500/20" :
                           "bg-muted text-muted-foreground"
                }`}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Icon className="w-4 h-4" /> : <Circle className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? "text-orange-600" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {phase.label}
                    {active && <span className="ml-2 text-xs font-bold bg-orange-500/15 text-orange-600 px-2 py-0.5 rounded-full">Current</span>}
                    {done && <span className="ml-2 text-xs text-muted-foreground">Done</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Floor plan section ────────────────────────────────────────────────────────
function FloorPlanSection({
  images,
  onRequestPlans,
}: {
  images: string[];
  onRequestPlans: () => void;
}) {
  const [activeFloor, setActiveFloor] = useState(0);
  const floorPlanImages = images.filter((_url, i) => i > 0); // first is always cover; rest may include floor plans

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-1 flex items-center gap-2">
        <FileImage className="w-4 h-4 text-primary" /> Floor Plans
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Available unit layouts and building sections
      </p>

      {floorPlanImages.length > 0 ? (
        <div className="space-y-3">
          {/* Thumbnail selector */}
          {floorPlanImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {floorPlanImages.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFloor(i)}
                  className={`relative shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === activeFloor ? "border-primary" : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {/* Main floor plan view */}
          <div className="rounded-xl overflow-hidden border border-border bg-muted aspect-[4/3]">
            <img
              src={floorPlanImages[activeFloor]}
              alt="Floor plan"
              className="w-full h-full object-contain"
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Floor plans are indicative — final dimensions confirmed at reservation
          </p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FileImage className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Floor plans available on request</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contact the developer to receive detailed unit layouts, dimensions, and specifications
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={onRequestPlans}>
            <MessageSquare className="w-3.5 h-3.5" /> Request Floor Plans
          </Button>
        </div>
      )}

      {/* Unit type quick reference */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Typical Unit Types</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: BedDouble, label: "Studio",  sqm: "30–45 m²", desc: "Compact / investor" },
            { icon: BedDouble, label: "1 Bed",   sqm: "45–65 m²", desc: "Couple / rental" },
            { icon: BedDouble, label: "2 Bed",   sqm: "65–90 m²", desc: "Family starter" },
            { icon: BedDouble, label: "3 Bed",   sqm: "90–130 m²",desc: "Larger family" },
          ].map(u => (
            <div key={u.label} className="flex items-center gap-2.5 rounded-lg bg-secondary/60 border border-border p-2.5">
              <u.icon className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{u.label} · {u.sqm}</p>
                <p className="text-[10px] text-muted-foreground">{u.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" /> Exact availability and pricing confirmed by developer
        </p>
      </div>
    </div>
  );
}

// ── Construction specs summary ────────────────────────────────────────────────
function ConstructionSpecs({ listing }: { listing: any }) {
  const specs = [
    listing.total_floors   && { icon: SquareStack, label: "Total floors",      value: `${listing.total_floors}` },
    listing.sqm            && { icon: Ruler,       label: "Unit area from",    value: `${listing.sqm} m²` },
    listing.has_parking    && { icon: Home,         label: "Parking",           value: "Included" },
    listing.has_elevator   && { icon: Layers,       label: "Elevator",          value: "Yes" },
    listing.has_pool       && { icon: Trees,        label: "Swimming pool",     value: "Common area" },
    listing.has_garden     && { icon: Trees,        label: "Garden / Grounds",  value: "Yes" },
    listing.has_smart_home && { icon: Zap,          label: "Smart home system", value: "Standard" },
    listing.energy_class   && { icon: Zap,          label: "Energy rating",     value: listing.energy_class },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];

  if (!specs.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
        <Ruler className="w-4 h-4" /> Building Specifications
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {specs.map(spec => (
          <div key={spec.label} className="flex items-start gap-2">
            <spec.icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <div>
              <dt className="text-[10px] text-muted-foreground leading-tight">{spec.label}</dt>
              <dd className="text-xs font-semibold">{spec.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Energy badge ──────────────────────────────────────────────────────────────
const ENERGY_COLORS: Record<string, string> = {
  "A+": "bg-green-500", "A": "bg-green-400", "B+": "bg-lime-500",
  "B": "bg-lime-400", "C": "bg-yellow-400", "D": "bg-orange-400",
  "E": "bg-red-400", "Z": "bg-red-600", "H": "bg-red-700",
};

function EnergyBadge({ cls }: { cls: string | null }) {
  if (!cls) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-xs font-bold ${ENERGY_COLORS[cls] ?? "bg-muted text-muted-foreground"}`}>
      <Zap className="w-3 h-3" /> {cls}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewBuildDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const startConv = useStartConversation();
  const [contactLoading, setContactLoading] = useState(false);

  // AI Market Insights
  const [aiInsightsData, setAiInsightsData] = useState<{
    vsMarket: number; rentalYield: number; estimatedValue: number;
    marketComparison: string; confidenceLabel: string;
  } | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("listings")
        .select(`
          *,
          profiles:owner_id(user_id, display_name, avatar_url, phone),
          listing_images(url, sort_order)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleContact = async () => {
    if (!user) { navigate("/login"); return; }
    if (!listing?.owner_id) return;
    setContactLoading(true);
    try {
      const convId = await startConv.mutateAsync({ other_user_id: listing.owner_id, listing_id: id });
      navigate(`/messages?conv=${convId}`);
    } catch {
      toast.error("Could not start conversation");
    } finally {
      setContactLoading(false);
    }
  };

  useEffect(() => {
    if (!listing || !user) return;
    setAiInsightsLoading(true);
    supabase.functions.invoke("property-valuation", {
      body: {
        title: listing.title,
        city: listing.city,
        address: listing.address,
        price: Number(listing.price),
        sqm: Number(listing.sqm),
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        propertyType: listing.property_type,
        listingType: "sale",
        floor: listing.floor,
        yearBuilt: listing.year_built,
        energyClass: listing.energy_class,
        pricePerSqm: listing.price_per_sqm ? Number(listing.price_per_sqm) : undefined,
        hasParking: listing.has_parking,
        hasPool: listing.has_pool,
        hasElevator: listing.has_elevator,
        region: listing.region,
        condition: listing.construction_status,
      },
    }).then(({ data }) => {
      if (data && !data.error) {
        setAiInsightsData({
          vsMarket: data.marketComparisonPct ?? 0,
          rentalYield: data.rentalYieldEstimate ?? 0,
          estimatedValue: data.estimatedValue ?? Number(listing.price),
          marketComparison: data.marketComparison ?? "at_market",
          confidenceLabel: data.confidenceLabel ?? "Medium",
        });
      }
    }).finally(() => setAiInsightsLoading(false));
  }, [listing?.id, user]);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (error || !listing) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 text-center px-4">
        <p className="text-muted-foreground">Property not found.</p>
        <Link to="/listings"><Button variant="outline" className="mt-4">Back to listings</Button></Link>
      </div>
    </div>
  );

  // Collect images
  const sortedImages = [...(listing.listing_images ?? [])]
    .sort((a: { sort_order: number | null }, b: { sort_order: number | null }) =>
      (a.sort_order ?? 99) - (b.sort_order ?? 99))
    .map((img: { url: string }) => img.url);
  const allImages = listing.cover_image_url
    ? [listing.cover_image_url, ...sortedImages.filter((s: string) => s !== listing.cover_image_url)]
    : sortedImages;

  const owner = listing.profiles as { display_name?: string; avatar_url?: string; phone?: string } | null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 pb-24">

        {/* Back link */}
        <div className="container max-w-5xl px-4 pt-6 pb-2">
          <Link
            to="/listings?type=new_build"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to new builds
          </Link>
        </div>

        <div className="container max-w-5xl px-4">
          <div className="grid lg:grid-cols-3 gap-8">

            {/* ── Left: main content ──────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              <Gallery images={allImages} />

              {/* Title + highlights */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {listing.construction_status && (
                    <span className="text-xs font-semibold bg-orange-500/15 text-orange-600 rounded-full px-3 py-0.5 capitalize">
                      {listing.construction_status.replace(/_/g, " ")}
                    </span>
                  )}
                  {listing.is_pre_sale && (
                    <span className="text-xs font-semibold bg-primary/15 text-primary rounded-full px-3 py-0.5">Pre-sale</span>
                  )}
                  {listing.energy_class && <EnergyBadge cls={listing.energy_class} />}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{listing.title}</h1>
                <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-sm">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>{[listing.address, listing.city, listing.region].filter(Boolean).join(", ")}</span>
                </div>
              </div>

              {/* Specs bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {listing.sqm != null && (
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <Maximize2 className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-bold text-lg">{listing.sqm} m²</p>
                    <p className="text-xs text-muted-foreground">Area</p>
                  </div>
                )}
                {listing.bedrooms != null && (
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <BedDouble className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-bold text-lg">{listing.bedrooms}</p>
                    <p className="text-xs text-muted-foreground">Bedrooms</p>
                  </div>
                )}
                {listing.bathrooms != null && (
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <Bath className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-bold text-lg">{listing.bathrooms}</p>
                    <p className="text-xs text-muted-foreground">Bathrooms</p>
                  </div>
                )}
                {listing.year_built != null && (
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <Calendar className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-bold text-lg">{listing.year_built}</p>
                    <p className="text-xs text-muted-foreground">Delivery year</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {listing.description && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="font-display font-semibold mb-3">Project description</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* Features */}
              {(listing.has_elevator || listing.has_parking || listing.has_pool ||
                listing.has_smart_home || listing.has_security || listing.has_underfloor_heating) && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="font-display font-semibold mb-3">Features & amenities</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { flag: listing.has_elevator, label: "Elevator" },
                      { flag: listing.has_parking, label: "Parking" },
                      { flag: listing.has_pool, label: "Swimming pool" },
                      { flag: listing.has_smart_home, label: "Smart home" },
                      { flag: listing.has_security, label: "Security system" },
                      { flag: listing.has_underfloor_heating, label: "Underfloor heating" },
                      { flag: listing.has_solar_water, label: "Solar water heater" },
                      { flag: listing.has_storage, label: "Storage room" },
                      { flag: listing.has_garden, label: "Garden" },
                      { flag: listing.has_view, label: "View" },
                      { flag: listing.has_ac, label: "A/C" },
                      { flag: listing.has_video_tour, label: "Video tour" },
                    ]
                      .filter((f) => f.flag)
                      .map((f) => (
                        <div key={f.label} className="flex items-center gap-2 text-sm">
                          <Star className="w-3.5 h-3.5 text-primary shrink-0" />
                          {f.label}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Construction timeline */}
              {listing.construction_status && (
                <ConstructionTimeline status={listing.construction_status} />
              )}

              {/* Floor plans + unit types */}
              <FloorPlanSection
                images={allImages}
                onRequestPlans={handleContact}
              />

              {/* Building specs */}
              <ConstructionSpecs listing={listing} />

              {/* Location */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Location
                </h2>
                <p className="text-sm text-muted-foreground">
                  {[listing.address, listing.city, listing.postal_code, listing.region].filter(Boolean).join(", ")}
                </p>
              </div>

              {/* Map */}
              <div className="rounded-xl overflow-hidden">
                <PropertyMiniMap
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  address={listing.address}
                  city={listing.city}
                  title={listing.title}
                />
              </div>

              {/* AI Market Insights */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> AI Market Insights
                </h2>
                {aiInsightsLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!aiInsightsLoading && aiInsightsData && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className={`rounded-xl border p-4 ${
                      aiInsightsData.vsMarket > 0 ? "bg-emerald-400/10 border-emerald-400/20" :
                      aiInsightsData.vsMarket < 0 ? "bg-destructive/10 border-destructive/20" :
                      "bg-yellow-400/10 border-yellow-400/20"
                    }`}>
                      <p className="text-[10px] text-muted-foreground uppercase">vs Market</p>
                      <p className={`font-display font-black text-2xl ${
                        aiInsightsData.vsMarket > 0 ? "text-emerald-600" :
                        aiInsightsData.vsMarket < 0 ? "text-destructive" : "text-amber-600"
                      }`}>
                        {aiInsightsData.vsMarket > 0 ? "+" : ""}{aiInsightsData.vsMarket}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-secondary/50 p-4">
                      <p className="text-[10px] text-muted-foreground uppercase">Rental Yield</p>
                      <p className="font-display font-black text-2xl text-primary">{aiInsightsData.rentalYield}%</p>
                    </div>
                    <div className="rounded-xl border border-border bg-secondary/50 p-4">
                      <p className="text-[10px] text-muted-foreground uppercase">AI Estimate</p>
                      <p className="font-display font-black text-2xl">€{(aiInsightsData.estimatedValue / 1000).toFixed(0)}k</p>
                    </div>
                  </div>
                )}
                {user && !aiInsightsLoading && !aiInsightsData && (
                  <p className="text-xs text-muted-foreground text-center py-4">Market analysis unavailable</p>
                )}
                {!user && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    <Link to="/login" className="text-primary hover:underline">Sign in</Link> to view AI market analysis
                  </p>
                )}
              </div>

              {/* Neighbourhood Report */}
              {listing.address && (
                <NeighbourhoodReport
                  city={listing.city}
                  address={listing.address}
                  region={listing.region}
                  lat={listing.latitude != null ? Number(listing.latitude) : undefined}
                  lng={listing.longitude != null ? Number(listing.longitude) : undefined}
                  listingId={id ?? undefined}
                />
              )}

              {/* Property Valuation */}
              {id && (
                <PropertyValuation
                  listingId={id}
                  title={listing.title}
                  city={listing.city}
                  address={listing.address}
                  price={Number(listing.price)}
                  sqm={Number(listing.sqm)}
                  bedrooms={listing.bedrooms}
                  bathrooms={listing.bathrooms}
                  propertyType={listing.property_type}
                  yearBuilt={listing.year_built}
                  energyClass={listing.energy_class}
                  floor={listing.floor}
                  totalFloors={listing.total_floors}
                  hasParking={listing.has_parking}
                  hasPool={listing.has_pool}
                  hasElevator={listing.has_elevator}
                  hasGarden={listing.has_garden}
                  region={listing.region}
                  condition={listing.construction_status}
                />
              )}
            </div>

            {/* ── Right: price + contact sticky card ─────────────── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-4">
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-0.5">Starting from</p>
                    <p className="font-display text-3xl font-bold text-primary">{formatPrice(listing.price)}</p>
                    {listing.price_per_sqm && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatPrice(listing.price_per_sqm)} / m²
                      </p>
                    )}
                  </div>

                  {listing.is_pre_sale && (
                    <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary font-medium">
                      Pre-sale pricing applies — contact for availability
                    </div>
                  )}

                  <Button className="w-full gap-2 mb-2" onClick={handleContact} disabled={contactLoading}>
                    {contactLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Register interest
                  </Button>

                  {owner?.phone && (
                    <a href={`tel:${owner.phone}`}>
                      <Button variant="outline" className="w-full gap-2">
                        <Phone className="w-4 h-4" /> Call developer
                      </Button>
                    </a>
                  )}
                </div>

                {/* Developer card */}
                {owner && (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">Developer</p>
                    <div className="flex items-center gap-3">
                      {owner.avatar_url ? (
                        <img src={owner.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Home className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm">{owner.display_name ?? "Developer"}</p>
                        <p className="text-xs text-muted-foreground">Verified developer</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick stats */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">Project info</p>
                  {listing.construction_status && (() => {
                    const phaseLabel = CONSTRUCTION_PHASES.find(p => p.key === listing.construction_status)?.label
                      ?? listing.construction_status.replace(/_/g, " ");
                    return (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Phase</span>
                        <span className="font-medium text-orange-600 capitalize">{phaseLabel}</span>
                      </div>
                    );
                  })()}
                  {listing.year_built && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Expected completion</span>
                      <span className="font-medium">{listing.year_built}</span>
                    </div>
                  )}
                  {listing.energy_class && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Energy class</span>
                      <EnergyBadge cls={listing.energy_class} />
                    </div>
                  )}
                  {listing.total_floors && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total floors</span>
                      <span className="font-medium">{listing.total_floors}</span>
                    </div>
                  )}
                  {listing.bedrooms != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Unit bedrooms</span>
                      <span className="font-medium">{listing.bedrooms}</span>
                    </div>
                  )}
                  {listing.sqm != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Unit area from</span>
                      <span className="font-medium">{listing.sqm} m²</span>
                    </div>
                  )}
                  {listing.has_parking && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Parking</span>
                      <span className="font-medium text-primary">Included</span>
                    </div>
                  )}
                  {listing.has_elevator != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Elevator</span>
                      <span className="font-medium">{listing.has_elevator ? "Yes" : "No"}</span>
                    </div>
                  )}
                  {listing.has_pool && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Pool</span>
                      <span className="font-medium text-primary">Common area</span>
                    </div>
                  )}
                </div>

                {/* Request floor plans shortcut */}
                <button
                  onClick={handleContact}
                  disabled={contactLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-secondary text-foreground text-sm font-medium hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  {contactLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileImage className="w-4 h-4 text-primary" />}
                  Request floor plans
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
