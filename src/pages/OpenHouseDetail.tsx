import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Calendar, ChevronLeft, ChevronRight, Eye, Zap,
  Pencil, Pause, Play, Trash2, Loader2, MessageCircle, Euro, Users, LayoutDashboard,
  Home, Wrench, Lock, ExternalLink, Heart, Share2, Layers, Thermometer, Building2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import OpenHouseRegistrationDialog from "@/components/OpenHouseRegistrationDialog";
import OpenHouseAssetControlPanel from "@/components/OpenHouseAssetControlPanel";
import OpenHouseOfferDialog from "@/components/OpenHouseOfferDialog";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import PropertyValuation from "@/components/PropertyValuation";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import { useListing } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useOpenHouseSettings, useOpenHouseRegistrations, useOpenHouseOffers } from "@/hooks/useOpenHouseAssetControl";
import { useStartConversation } from "@/hooks/useMessages";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HEATING_TYPES, CONDITION_OPTIONS } from "@/lib/filterConfig";
import { getStreetViewProxyUrl } from "@/lib/config";
import { SignInForAI } from "@/components/SignInForAI";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-right capitalize">{value}</span>
    </div>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-card rounded-2xl border border-border overflow-hidden ${className}`}>{children}</div>;
}

function SectionHeader({ icon: Icon, title }: { icon?: any; title: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
      {Icon && <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-primary" /></div>}
      <h4 className="font-display font-semibold text-sm">{title}</h4>
    </div>
  );
}

/**
 * Open House detail page — clean, fast UI for NPL managers (ad owners).
 * Streamlined view for managing open house listings.
 */
export default function OpenHouseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMock = !!id && ["mock-open-1", "mock-open-2", "mock-open-3"].includes(id);
  const { data: listing, isLoading } = useListing(isMock ? "" : (id || ""));
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const [regOpen, setRegOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [currentImage, setCurrentImage] = useState(0);

  const { data: assetSettings } = useOpenHouseSettings(id || undefined);
  const { data: registrations = [] } = useOpenHouseRegistrations(id || undefined, false);
  const { data: offers = [] } = useOpenHouseOffers(id || undefined);
  const hasAssetControl = !!assetSettings;
  const startConversation = useStartConversation();

  const [aiInsightsData, setAiInsightsData] = useState<{ vsMarket: number; rentalYield: number; estimatedValue: number; marketComparison: string; confidenceLabel: string } | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

  const mockListing = useMemo(() => {
    if (!isMock || !id) return null;
    const base = {
      listing_type: "open_house",
      status: "active",
      views_count: 132,
      bedrooms: 2,
      bathrooms: 2,
      sqm: 135,
      year_built: 2015,
      description: "Bright modern apartment with large balcony, close to Kifisia center and metro. Ideal for couples or small families looking for quiet living with quick access to the city.",
    };
    if (id === "mock-open-1") {
      return {
        id,
        title: "Modern 2BR in Kifisia",
        address: "Kifisia Center",
        city: "Athens",
        price: 420000,
        cover_image_url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=60",
        open_house_date: new Date().toISOString(),
        ...base,
      };
    }
    if (id === "mock-open-2") {
      return {
        id,
        title: "Sea-view Villa in Vouliagmeni",
        address: "Panorama Vouliagmeni",
        city: "Athens Riviera",
        price: 1450000,
        cover_image_url: "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=60",
        open_house_date: new Date().toISOString(),
        bedrooms: 4,
        bathrooms: 4,
        sqm: 280,
        year_built: 2020,
        views_count: 89,
        description: "Luxury villa with unobstructed sea views, infinity pool, and generous outdoor spaces — perfect for entertaining and weekend escapes.",
        listing_type: "open_house",
        status: "active",
      };
    }
    if (id === "mock-open-3") {
      return {
        id,
        title: "Loft Near Aristotelous Square",
        address: "City Center",
        city: "Thessaloniki",
        price: 310000,
        cover_image_url: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&q=60",
        open_house_date: new Date().toISOString(),
        bedrooms: 1,
        bathrooms: 1,
        sqm: 107,
        year_built: 2010,
        views_count: 54,
        description: "Industrial-style loft a short walk from Aristotelous Square — ideal pied-à-terre or investment in Thessaloniki's city center.",
        listing_type: "open_house",
        status: "active",
      };
    }
    return null;
  }, [id, isMock]);

  const db = (isMock ? mockListing : listing) as any;
  const myReg = registrations.find((r: any) => r.requester_id === user?.id);
  const myOffer = offers.find((o: any) => o.bidder_id === user?.id);
  const isOwner = !isMock && user?.id && db?.owner_id === user.id;
  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFavorited = !!id && favorites.some((f: any) => f.listing_id === id);
  const handleFavorite = () => {
    if (!user) { toast.error("Sign in to save properties"); return; }
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: db?.title, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
  };

  // UX: Contact only after approval; Offer only after attended + open house date passed
  const openHouseDate = db?.open_house_date ? new Date(db.open_house_date) : null;
  const ohDatePassed = openHouseDate ? openHouseDate < new Date() : false;
  const canContact = !!myReg && ["approved", "attended"].includes(myReg.status);
  const canSubmitOffer = !!myReg && myReg.status === "attended" && ohDatePassed;

  const handleContact = async () => {
    const ownerId = db?.owner_id;
    if (!user || !ownerId || !id) return;
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch {
      toast.error("Could not start conversation");
    }
  };

  useEffect(() => {
    if (!db || isMock || !user) return;
    setAiInsightsLoading(true);
    supabase.functions.invoke("property-valuation", {
      body: {
        title: db.title,
        city: db.city,
        address: db.address,
        price: Number(db.price),
        sqm: Number(db.sqm),
        bedrooms: db.bedrooms,
        bathrooms: db.bathrooms,
        propertyType: db.property_type,
        listingType: "sale",
        floor: db.floor,
        yearBuilt: db.year_built,
        energyClass: db.energy_class,
        pricePerSqm: db.price_per_sqm ? Number(db.price_per_sqm) : undefined,
      },
    }).then(({ data }) => {
      if (data && !data.error) {
        setAiInsightsData({
          vsMarket: data.marketComparisonPct ?? 0,
          rentalYield: data.rentalYieldEstimate ?? 0,
          estimatedValue: data.estimatedValue ?? Number(db.price),
          marketComparison: data.marketComparison ?? "at_market",
          confidenceLabel: data.confidenceLabel ?? "Medium",
        });
      }
    }).finally(() => setAiInsightsLoading(false));
  }, [db?.id, isMock, user]);

  useEffect(() => {
    if (isMock) return;
    if (db?.listing_type === "open_house") return;
    if (db?.listing_type && db.listing_type !== "open_house") {
      navigate(`/property/${id}`, { replace: true });
    }
  }, [db?.listing_type, id, navigate, isMock]);

  useEffect(() => {
    if (db?.open_house_date) {
      const d = new Date(db.open_house_date);
      setDateInput(d.toISOString().slice(0, 16));
    }
  }, [db?.open_house_date]);

  const saveDate = async () => {
    if (!id || !dateInput) return;
    try {
      await updateListing.mutateAsync({
        id,
        updates: { open_house_date: new Date(dateInput).toISOString() },
      });
      setEditingDate(false);
      toast.success("Open house date updated");
    } catch {
      toast.error("Could not update date");
    }
  };

  const toggleStatus = () => {
    if (!id) return;
    const next = db?.status === "active" ? "paused" : "active";
    updateListing.mutate({ id, updates: { status: next } });
    toast.success(next === "active" ? "Listing activated" : "Listing paused");
  };

  const handleDelete = () => {
    if (!id || !confirm("Delete this open house listing?")) return;
    deleteListing.mutate(id);
    toast.success("Listing deleted");
    navigate("/open-houses");
  };

  if (!isMock && (isLoading || !db)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const price = Number(db.price ?? 0);
  const sqm = Number(db.sqm ?? 0);
  const address = db.address ?? db.city;
  let imgs: string[] = db.cover_image_url ? [db.cover_image_url] : [];
  if (db.listing_images?.length) {
    const sorted = [...db.listing_images].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    sorted.forEach((img: any) => imgs.push(img.url));
  }
  const streetViewFallback = !isMock && (db.latitude != null && db.longitude != null)
    ? getStreetViewProxyUrl({ lat: Number(db.latitude), lng: Number(db.longitude) })
    : (db.address || db.city) ? getStreetViewProxyUrl({ location: `${db.address ?? ""} ${db.city ?? ""}`.trim() }) : null;
  if (!imgs.length && streetViewFallback) imgs = [streetViewFallback];

  const pricePerSqm = sqm > 0 ? Math.round(price / sqm) : null;
  const detailRows: { label: string; value: string }[] = [
    { label: "Price", value: `€${price.toLocaleString()}` },
    { label: "Price / m²", value: pricePerSqm ? `€${pricePerSqm.toLocaleString()}` : "—" },
    { label: "Surface", value: `${sqm} m²` },
    ...(db.year_built ? [{ label: "Year Built", value: String(db.year_built) }] : []),
    ...(db.floor != null ? [{ label: "Floor", value: db.floor === 0 ? "Ground" : `${db.floor}${db.total_floors ? ` of ${db.total_floors}` : ""}` }] : []),
    ...(db.heating_system ? [{ label: "Heating", value: HEATING_TYPES.find((h) => h.value === db.heating_system)?.label ?? db.heating_system.replace(/_/g, " ") }] : []),
    ...(db.energy_class ? [{ label: "Energy Class", value: db.energy_class }] : []),
    ...(db.construction_status ? [{ label: "Condition", value: CONDITION_OPTIONS.find((c) => c.value === db.construction_status)?.label ?? db.construction_status.replace(/_/g, " ") }] : []),
  ];
  const city = db.city || "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Breadcrumb — same as PropertyDetail */}
        <div className="container py-2 sm:py-3">
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none">
            <Link to="/" className="hover:text-foreground transition-colors shrink-0">Home</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <Link to="/open-houses" className="hover:text-foreground transition-colors shrink-0">Open Houses</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="text-foreground truncate font-medium">{db.title}</span>
          </div>
        </div>

        <div className="container pb-24 lg:pb-10">
          {/* Owner manage bar */}
          {isOwner && (
            <div className="flex flex-wrap gap-2 mb-6 p-4 rounded-xl bg-card border border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase self-center mr-2">Manage</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingDate(!editingDate)}>
                <Pencil className="w-3.5 h-3.5" /> Edit date
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={toggleStatus}>
                {db.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
              {isOwner && editingDate && (
                <div className="flex flex-wrap items-center gap-2 w-full mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <input type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  <Button size="sm" onClick={saveDate} disabled={updateListing.isPending}>{updateListing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          {/* Owner: Asset Control panel */}
          {isOwner && id && (
            <div className="mb-6">
              <OpenHouseAssetControlPanel listingId={id} isOwner={true} />
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
            {/* Left column — same structure as PropertyDetail */}
            <div className="space-y-5">
              {/* Gallery — 16:9 like buy property */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group shadow-elevated">
                {imgs[0] ? (
                  <img src={imgs[currentImage] || imgs[0]} alt={db.title} className="w-full h-full object-cover transition-opacity duration-300" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary">
                    <Home className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No photos</p>
                  </div>
                )}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-emerald-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">OPEN HOUSE</span>
                </div>
                {imgs.length > 1 && (
                  <>
                    <button className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg" onClick={() => setCurrentImage((p) => (p - 1 + imgs.length) % imgs.length)} aria-label="Previous">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg" onClick={() => setCurrentImage((p) => (p + 1) % imgs.length)} aria-label="Next">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full backdrop-blur-md shadow transition-all ${isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"}`} onClick={handleFavorite} aria-label={isFavorited ? "Remove from saved" : "Save property"}>
                    <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
                  </button>
                  <button onClick={handleShare} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all" aria-label="Share">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
                {imgs.length > 0 && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">{currentImage + 1} / {imgs.length}</div>
                    <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs"><Eye className="w-3 h-3 text-muted-foreground" />{db.views_count || 0} views</div>
                  </>
                )}
              </div>
              {imgs.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  {imgs.map((img, i) => (
                    <button key={i} onClick={() => setCurrentImage(i)} className={`shrink-0 min-h-[44px] min-w-[44px] w-16 h-11 rounded-lg overflow-hidden transition-all ${currentImage === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100" : "opacity-50 hover:opacity-80"}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Title + Price hero — same as PropertyDetail */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border capitalize">{db.property_type}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">Open House</span>
                    </div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">{db.title}</h1>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{address && address !== city ? `${address}, ${city}` : city}{db.region ? ` · ${db.region}` : ""}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-black text-foreground">€{price.toLocaleString()}</div>
                    {pricePerSqm && <div className="text-xs text-muted-foreground mt-0.5">€{pricePerSqm.toLocaleString()} per m²</div>}
                  </div>
                </div>
                {/* Key stats bar — same as PropertyDetail */}
                <div className="flex items-center gap-2 flex-wrap">
                  {db.bedrooms != null && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Bed className="w-3.5 h-3.5 text-primary" />{db.bedrooms} bed</div>}
                  {db.bathrooms != null && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Bath className="w-3.5 h-3.5 text-primary" />{db.bathrooms} bath</div>}
                  <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Square className="w-3.5 h-3.5 text-primary" />{sqm} m²</div>
                  {db.floor != null && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Layers className="w-3.5 h-3.5 text-primary" />{db.floor === 0 ? "Ground" : `${db.floor}${db.total_floors ? ` of ${db.total_floors}` : ""}`}</div>}
                  {db.year_built != null && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Calendar className="w-3.5 h-3.5 text-primary" />{db.year_built}</div>}
                  {db.heating_system && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Thermometer className="w-3.5 h-3.5 text-primary" />{HEATING_TYPES.find((h) => h.value === db.heating_system)?.label ?? db.heating_system.replace(/_/g, " ")}</div>}
                  {db.construction_status && <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-3 py-2 rounded-xl text-sm font-medium"><Building2 className="w-3.5 h-3.5 text-primary" />{CONDITION_OPTIONS.find((c) => c.value === db.construction_status)?.label ?? db.construction_status.replace(/_/g, " ")}</div>}
                </div>
              </div>

              {/* Open House date Section */}
              {openHouseDate && (
                <Section>
                  <SectionHeader icon={Calendar} title="Open House" />
                  <div className="p-6">
                    <div className="flex items-center gap-4">
                      <Calendar className="w-12 h-12 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-display text-lg font-bold text-foreground">
                          {openHouseDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {openHouseDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          {hasAssetControl ? " — Pre-register to book a timeslot" : " — No appointment needed"}
                        </p>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* Description */}
              {db.description && (
                <Section>
                  <SectionHeader icon={FileText} title="Description" />
                  <div className="p-6"><p className="text-sm text-muted-foreground leading-relaxed">{db.description}</p></div>
                </Section>
              )}

              {/* Property Details */}
              {detailRows.length > 0 && (
                <Section>
                  <SectionHeader icon={Home} title="Property Details" />
                  <div className="p-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">{detailRows.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}</div></div>
                </Section>
              )}

              {/* AI Market Insights */}
              {!isMock && (
                <Section>
                  <SectionHeader icon={Zap} title="AI Market Insights" />
                  <div className="p-5">
                    {aiInsightsLoading && <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
                    {!aiInsightsLoading && aiInsightsData && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className={`rounded-xl border p-4 ${aiInsightsData.vsMarket > 0 ? "bg-emerald-400/10 border-emerald-400/20" : aiInsightsData.vsMarket < 0 ? "bg-destructive/10 border-destructive/20" : "bg-yellow-400/10 border-yellow-400/20"}`}>
                          <p className="text-[10px] text-muted-foreground uppercase">vs Market</p>
                          <p className={`font-display font-black text-2xl ${aiInsightsData.vsMarket > 0 ? "text-emerald-600" : aiInsightsData.vsMarket < 0 ? "text-destructive" : "text-amber-600"}`}>
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
                    {user && !aiInsightsLoading && !aiInsightsData && <p className="text-xs text-muted-foreground text-center py-4">Market analysis unavailable</p>}
                  </div>
                </Section>
              )}

              {/* Neighbourhood & Map */}
              {db.address && (
                <>
                  <NeighbourhoodReport
                    city={city}
                    address={db.address}
                    region={db.region}
                    lat={db.latitude != null ? Number(db.latitude) : undefined}
                    lng={db.longitude != null ? Number(db.longitude) : undefined}
                    listingId={id ?? undefined}
                  />
                  <div className="rounded-2xl overflow-hidden">
                    <PropertyMiniMap
                      address={db.address}
                      city={city}
                      title={db.title}
                      latitude={db.latitude}
                      longitude={db.longitude}
                    />
                  </div>
                </>
              )}

              {/* AI Valuation */}
              {!isMock && id && (
                <PropertyValuation listingId={id} title={db.title} city={city} address={db.address} price={price} sqm={sqm} bedrooms={db.bedrooms} bathrooms={db.bathrooms} propertyType={db.property_type} yearBuilt={db.year_built} energyClass={db.energy_class} floor={db.floor} totalFloors={db.total_floors} heatingSystem={db.heating_system} />
              )}

              {/* Professionals */}
              <Section>
                <SectionHeader icon={Wrench} title="Professional Add-ons" />
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">Formal valuation reports, legal due diligence, and building legality checks.</p>
                  <Link to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    Find professionals <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </Section>
            </div>

            {/* Right sidebar — same structure as PropertyDetail */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">
              <div className="glass-card rounded-xl p-5 border border-border">
                <div className="font-display text-2xl font-bold text-primary mb-1">
                  €{price.toLocaleString()}
                </div>
                {sqm > 0 && <p className="text-xs text-muted-foreground">€{Math.round(price / sqm).toLocaleString()}/m²</p>}

                {/* Real listing: full registration / offer flow — gate by approval & attendance */}
                {!isMock && !isOwner && user && (
                  <div className="mt-4 space-y-2">
                    {myReg && (
                      <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                        myReg.status === "attended" ? "bg-emerald-500/15 text-emerald-700" :
                        myReg.status === "approved" ? "bg-emerald-500/10 text-emerald-600" :
                        myReg.status === "pending" ? "bg-amber-500/15 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {myReg.status === "attended" ? "✓ Attended — you can submit an offer" :
                          myReg.status === "approved" ? "✓ Approved — attend the open house to unlock offers" :
                          myReg.status === "pending" ? "⏳ Awaiting approval" : `Status: ${myReg.status}`}
                      </div>
                    )}
                    {!canSubmitOffer && myReg?.status === "attended" && !ohDatePassed && openHouseDate && (
                      <p className="text-[11px] text-muted-foreground">
                        Offer submission opens after {openHouseDate.toLocaleDateString("en-GB")} {openHouseDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                    <Button className="w-full gap-2" onClick={() => setRegOpen(true)} variant={myReg ? "outline" : "default"}>
                      <Users className="w-4 h-4" /> {myReg ? "View registration" : "Pre-register for Open House"}
                    </Button>
                    {myOffer ? (
                      <button
                        type="button"
                        onClick={() => setOfferOpen(true)}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs bg-secondary/50 hover:bg-secondary border border-border transition-colors"
                      >
                        Your offer: {myOffer.status === "submitted" ? "Sealed" : `€${Number(myOffer.amount).toLocaleString()}`} · View
                      </button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setOfferOpen(true)}
                        disabled={!canSubmitOffer}
                      >
                        <Euro className="w-4 h-4" /> Submit Offer
                        {!canSubmitOffer && (myReg?.status !== "attended" || !ohDatePassed) && <Lock className="w-3 h-3 opacity-50" />}
                      </Button>
                    )}
                    {canContact ? (
                      <Button variant="outline" className="w-full gap-2" onClick={handleContact} disabled={startConversation.isPending}>
                        {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                        Contact
                      </Button>
                    ) : (
                      <div className="rounded-lg px-3 py-2 text-[11px] text-muted-foreground border border-border bg-muted/30 flex items-center gap-1.5">
                        <Lock className="w-3 h-3 shrink-0" />
                        {!myReg ? "Pre-register first to contact" : myReg.status === "pending" ? "Contact unlocks after approval" : "Attend first to contact"}
                      </div>
                    )}
                  </div>
                )}
                {!isMock && !isOwner && !user && (
                  <Button className="w-full mt-4 gap-2" asChild>
                    <Link to="/login">Sign in to contact</Link>
                  </Button>
                )}

                {/* Owner: dashboard shortcut */}
                {isOwner && (
                  <div className="mt-4 space-y-2">
                    <Button className="w-full gap-2" asChild>
                      <Link to="/dashboard?tab=open-houses">
                        <LayoutDashboard className="w-4 h-4" /> Manage in Dashboard
                      </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      View registrations, approve visitors & manage sealed offers
                    </p>
                  </div>
                )}

                {/* Mock listing: explain the flow without hitting backend */}
                {isMock && (
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Demo only</p>
                    <p>
                      This is a sample open house property page. In a real listing you would see:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Buttons to pre-register for a timeslot</li>
                      <li>The status of your registration and offer</li>
                      <li>Actions to submit a sealed offer after the visit</li>
                      <li>A direct messaging link with the listing agent or owner</li>
                    </ul>
                    <p className="mt-1">
                      Use the Open Houses dashboard section to test the full asset control, registrations, and offers flow on real data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <OpenHouseRegistrationDialog
        open={regOpen}
        onClose={() => setRegOpen(false)}
        listingId={id!}
        listingTitle={db.title}
        hasAssetControl={hasAssetControl}
      />
      <OpenHouseOfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listingId={id!}
        listingTitle={db.title}
        listingPrice={price}
        canSubmit={canSubmitOffer}
        offerBlockedReason={
          !myReg ? "Pre-register and get approved first" :
          myReg.status === "pending" ? "Awaiting approval" :
          myReg.status !== "attended" ? "Attend the open house to unlock offer submission" :
          !ohDatePassed ? `Offers open after ${openHouseDate?.toLocaleString("en-GB")}` : undefined
        }
      />

      <Footer />
    </div>
  );
}
