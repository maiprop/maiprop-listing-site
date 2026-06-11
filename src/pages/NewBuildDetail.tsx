import { useState, useEffect, type ElementType } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Building2, MapPin, Calendar, Home,
  Zap, Eye, Thermometer, Check,
  ChevronDown, ChevronUp, Shield, Flame, Wifi, Car, TreePine, Phone,
  Loader2, Maximize2, BedDouble, Bath, Layers, FileImage,
} from "lucide-react";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsFavorited, useToggleFavorite } from "@/hooks/useFavorites";
import { PropertyScoresSection } from "@/components/property/PropertyScoresSection";
import { useStartConversation } from "@/hooks/useMessages";
import { toast } from "sonner";
import PropertyValuation from "@/components/PropertyValuation";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import { ENERGY_SCALE, ENERGY_COLORS } from "@/types";
import { CONSTRUCTION_PHASES, formatNewBuildPrice as formatPrice } from "@/lib/newBuildConfig";
import { formatPrice as formatCurrency } from "@/lib/format";
import { getPrimaryValuationEstimate } from "@/lib/valuationResult";
import { FeatureSection } from "@/components/property/DetailPrimitives";
import { PropertyGallery as Gallery } from "@/components/new-build/PropertyGallery";
import { ConstructionTimeline } from "@/components/new-build/ConstructionTimeline";
import { FloorPlanSection } from "@/components/new-build/FloorPlanSection";
import { ConstructionSpecs } from "@/components/new-build/ConstructionSpecs";
import { UnitShowcase } from "@/components/new-build/UnitShowcase";
import { RegisterInterestCard } from "@/components/new-build/RegisterInterestCard";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import { fetchPublicApi } from "@/lib/publicApi";
import { getListingDetailPath, shouldUseNewBuildRoute } from "@/lib/listingRoutes";

// ── Helpers ────────────────────────────────────────────────────────────────────
const EnergyBadge = ({ cls }: { cls: string }) => {
  const colorClass = (ENERGY_COLORS as Record<string, string>)[cls] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${colorClass}`}>{cls}</span>
  );
};

type RegisterInterestForm = {
  name: string;
  phone: string;
  message: string;
};

type RegisterInterestPayload = {
  listingId: string;
  user: User;
  profile: Profile | null;
  form: RegisterInterestForm;
  contactName: string;
};

const cleanOptionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const getInterestPhone = (form: RegisterInterestForm, profile: Profile | null) => {
  return cleanOptionalText(form.phone) ?? cleanOptionalText(profile?.phone) ?? null;
};

type NewBuildListing = Database["public"]["Tables"]["listings"]["Row"] & {
  listing_images?: Array<Pick<Database["public"]["Tables"]["listing_images"]["Row"], "url" | "sort_order">> | null;
  profiles?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    phone?: string | null;
  } | null;
  walkability_score?: number | null;
  safety_score?: number | null;
  noise_score?: number | null;
};

type PublicListingResponse = {
  data: NewBuildListing | null;
};

const insertNewBuildLead = async ({
  listingId,
  user,
  profile,
  form,
  contactName,
}: RegisterInterestPayload) => {
  await supabase.from("new_building_leads").insert({
    new_building_id: listingId,
    user_id: user.id,
    email: user.email ?? "",
    full_name: contactName,
    phone: getInterestPhone(form, profile),
    investment_budget: 0,
    notes: cleanOptionalText(form.message) ?? "",
    utm_source: "newbuild_detail_register",
  });
};

// ── Main page ─────────────────────────────────────────────────────────────────
// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function NewBuildDetail() { // skipcq: JS-R1005 - New-build detail coordinates listing data, lead capture, media, and analytics affordances.
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const trv = (key: string, fallback: string, values: Record<string, string | number>) =>
    tInterpolate(t, key, fallback, values);
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const startConv = useStartConversation();
  const [contactLoading, setContactLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [walkScore, setWalkScore] = useState<number | null>(null);

  const { data: isFavorited = false } = useIsFavorited(id ?? "");
  const toggleFav = useToggleFavorite();
  const handleFavorite = () => {
    if (!user) { toast.error(tr("property.signInToSave", "Sign in to save properties")); return; }
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: listing?.title, url }); } catch (_err: unknown) { /* cancelled */ } }
    else { await navigator.clipboard.writeText(url); toast.success(tr("property.linkCopied", "Link copied to clipboard")); }
  };

  // AI Market Insights
  const [aiInsightsData, setAiInsightsData] = useState<{
    vsMarket: number; rentalYield: number; estimatedValue: number;
    marketComparison: string; confidenceLabel: string;
  } | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["new-build-listing", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await fetchPublicApi<PublicListingResponse>(
        `/api/public/listing?id=${encodeURIComponent(id)}`,
        { throwOnError: true },
      );
      return response?.data ?? null;
    },
    enabled: !!id,
  });
  const canonicalDetailPath = listing ? getListingDetailPath(listing) : null;
  const isCanonicalNewBuild = listing ? shouldUseNewBuildRoute(listing) : false;

  const handleRegisterInterest = async (form: RegisterInterestForm) => {
    const ownerId = listing?.owner_id;
    if (!id || !ownerId) return;
    if (!user) { navigate("/login"); return; }

    const contactName = cleanOptionalText(form.name)
      ?? cleanOptionalText(profile?.display_name)
      ?? cleanOptionalText(profile?.first_name)
      ?? tr("newBuildDetail.fallbackInterestedBuyer", "Interested buyer");
    await startConv.mutateAsync({ other_user_id: ownerId, listing_id: id });
    await insertNewBuildLead({ listingId: id, user, profile, form, contactName });
    toast.success(tr("newBuildDetail.toasts.interestRegistered", "Interest registered — the developer will be in touch"));
  };

  const handleContact = async () => {
    if (!user) { navigate("/login"); return; }
    if (!listing?.owner_id) return;
    setContactLoading(true);
    try {
      const convId = await startConv.mutateAsync({ other_user_id: listing.owner_id, listing_id: id });
      navigate(`/messages?conv=${convId}`);
    } catch (err: unknown) {
      toast.error(getPlanLimitErrorMessage(err) ?? tr("property.errorStartConversation", "Could not start conversation"));
    } finally {
      setContactLoading(false);
    }
  };

  useEffect(() => {
    if (!listing || !user || !isCanonicalNewBuild) return;
    setAiInsightsLoading(true);
    supabase.functions.invoke("property-valuation", {
      body: {
        listingId: listing.id,
        title: listing.title,
        city: listing.city,
        address: listing.address,
        price: Number(listing.price),
        sqm: Number(listing.sqm),
        latitude: listing.latitude != null ? Number(listing.latitude) : undefined,
        longitude: listing.longitude != null ? Number(listing.longitude) : undefined,
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
    }).then(({ data }) => { // skipcq: JS-R1005 - AI insight response normalizes several optional metrics together.
      if (data && !data.error) {
        setAiInsightsData({
          vsMarket: data.marketComparisonPct ?? 0,
          rentalYield: data.rentalYieldEstimate ?? 0,
          estimatedValue: getPrimaryValuationEstimate(data, Number(listing.price)),
          marketComparison: data.marketComparison ?? "at_market",
          confidenceLabel: data.confidenceLabel ?? "Medium",
        });
      }
    }).finally(() => setAiInsightsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id, user, isCanonicalNewBuild]);

  useEffect(() => {
    if (!listing || isCanonicalNewBuild || !canonicalDetailPath) return;
    navigate(canonicalDetailPath, { replace: true });
  }, [canonicalDetailPath, isCanonicalNewBuild, listing, navigate]);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    </div>
  );

  if (error || !listing) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 text-center px-4">
        <p className="text-muted-foreground">{tr("property.errorLoad", "Property not found.")}</p>
        <Link to="/listings"><Button variant="outline" className="mt-4">{tr("property.backToListings", "Back to listings")}</Button></Link>
      </div>
    </div>
  );

  if (!isCanonicalNewBuild) return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            to="/listings?listing_type=new_build"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {tr("newBuildDetail.backToNewBuilds", "Back to new builds")}
          </Link>
        </div>

        <div className="container max-w-5xl px-4">
          <div className="grid lg:grid-cols-[1fr_340px] gap-8">

            {/* ── Left: main content ──────────────────────────────── */}
            <div className="space-y-6">
              <Gallery
                images={allImages}
                isFavorited={isFavorited}
                onFavorite={handleFavorite}
                onShare={handleShare}
                title={listing.title}
              />

              {/* Title + Price hero row */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {listing.construction_status && (
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-orange-500/15 text-orange-600 rounded-full px-2 py-0.5 capitalize">
                          {tr(`newBuildDetail.phases.${listing.construction_status}`, listing.construction_status.replace(/_/g, " "))}
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/15 text-primary rounded-full px-2 py-0.5">{tr("newBuildDetail.badges.newBuild", "New Build")}</span>
                      {listing.energy_class && <EnergyBadge cls={listing.energy_class} />}
                    </div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{listing.title}</h1>
                    <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-sm">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{[listing.address, listing.city, listing.region].filter(Boolean).join(", ")}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-black text-foreground">
                      {formatPrice(Number(listing.price))}
                    </div>
                    {listing.price_per_sqm != null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {trv("newBuildDetail.pricePerSqm", "{{price}} per m²", { price: formatPrice(Number(listing.price_per_sqm)) })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Key stats bar — wrapped flex pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  {listing.sqm != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Maximize2 className="w-3.5 h-3.5 text-primary" />{listing.sqm} m²
                    </div>
                  )}
                  {listing.bedrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <BedDouble className="w-3.5 h-3.5 text-primary" />{trv("newBuildDetail.stats.bed", "{{count}} bed", { count: listing.bedrooms })}
                    </div>
                  )}
                  {listing.bathrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Bath className="w-3.5 h-3.5 text-primary" />{trv("newBuildDetail.stats.bath", "{{count}} bath", { count: listing.bathrooms })}
                    </div>
                  )}
                  {!!listing.total_floors && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Layers className="w-3.5 h-3.5 text-primary" />{trv("newBuildDetail.stats.floors", "{{count}} floors", { count: listing.total_floors })}
                    </div>
                  )}
                  {listing.year_built != null && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Calendar className="w-3.5 h-3.5 text-primary" />{trv("newBuildDetail.stats.delivery", "Delivery {{year}}", { year: listing.year_built })}
                    </div>
                  )}
                  {listing.energy_class && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Zap className="w-3.5 h-3.5 text-primary" />{trv("newBuildDetail.stats.energy", "Energy {{class}}", { class: listing.energy_class })}
                    </div>
                  )}
                  {listing.heating_system && (
                    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
                      <Thermometer className="w-3.5 h-3.5 text-primary" />{String(listing.heating_system).replace(/_/g, " ")}
                    </div>
                  )}
                </div>
              </div>

              {/* Type-specific: Unit showcase */}
              <UnitShowcase listing={listing as Record<string, unknown>} onContact={handleContact} />

              {/* Type-specific: Construction timeline */}
              {listing.construction_status && (
                <ConstructionTimeline status={listing.construction_status as string} />
              )}

              {/* Type-specific: Floor plans / gallery */}
              <FloorPlanSection
                images={allImages}
                onRequestPlans={handleContact}
              />

              {/* Type-specific: Building specs */}
              <ConstructionSpecs listing={listing} />

              {/* AI Market Insights */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">{tr("newBuildDetail.ai.title", "AI Market Insights")}</h4>
                  <span className="ml-auto text-[10px] text-muted-foreground">{tr("newBuildDetail.ai.poweredBy", "Powered by mAI Prop OS")}</span>
                </div>
                <div className="p-5">
                  {user && aiInsightsLoading && (
                    <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs">{tr("newBuildDetail.ai.analysing", "Analysing market data...")}</span>
                    </div>
                  )}
                  {user && !aiInsightsLoading && aiInsightsData && (() => {
                    const cmpCfg: Record<string, { label: string; color: string; bg: string }> = {
                      below_market: { label: tr("newBuildDetail.ai.comparison.belowMarket", "Below Market"), color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
                      at_market:    { label: tr("newBuildDetail.ai.comparison.atMarket", "At Market"),    color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
                      above_market: { label: tr("newBuildDetail.ai.comparison.aboveMarket", "Above Market"), color: "text-destructive",  bg: "bg-destructive/10 border-destructive/20" },
                    };
                    const cmp = cmpCfg[aiInsightsData.marketComparison] ?? cmpCfg.at_market;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${cmp.bg}`}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("newBuildDetail.ai.vsMarket", "vs Market")}</p>
                          <span className={`font-display font-black text-3xl ${cmp.color}`}>
                            {aiInsightsData.vsMarket > 0 ? "+" : ""}{aiInsightsData.vsMarket}%
                          </span>
                          <p className={`text-[10px] font-semibold ${cmp.color}`}>{cmp.label}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("newBuildDetail.ai.rentalYield", "Rental Yield")}</p>
                          <span className="font-display font-black text-3xl text-primary">{aiInsightsData.rentalYield}%</span>
                          <p className="text-[10px] text-muted-foreground">{tr("newBuildDetail.ai.grossYield", "Est. gross annual yield")}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("newBuildDetail.ai.estimate", "AI Estimate")}</p>
                          <span className="font-display font-black text-3xl text-foreground">
                            {formatCurrency(aiInsightsData.estimatedValue)}
                          </span>
                          <p className="text-[10px] text-muted-foreground">{trv("newBuildDetail.ai.confidence", "Confidence: {{confidence}}", { confidence: aiInsightsData.confidenceLabel })}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {user && !aiInsightsLoading && !aiInsightsData && (
                    <p className="text-xs text-muted-foreground text-center py-4">{tr("newBuildDetail.ai.unavailable", "Market analysis unavailable")}</p>
                  )}
                  {!user && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      <Link to="/login" className="text-primary hover:underline">{tr("nav.signIn", "Sign in")}</Link> {tr("newBuildDetail.ai.signInSuffix", "to view AI market analysis")}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              {listing.description && (
                <div className="glass-card rounded-2xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                    <h4 className="font-display font-semibold text-sm">{tr("newBuildDetail.description.title", "Project Description")}</h4>
                  </div>
                  <div className="p-6">
                    <div className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-line ${!descExpanded ? "line-clamp-4" : ""}`}>
                      {listing.description}
                    </div>
                    {listing.description.length > 200 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="flex items-center gap-1 text-xs text-primary mt-3 hover:underline font-medium"
                      >
                        {descExpanded
                          ? (<><ChevronUp className="w-3 h-3" />{tr("newBuildDetail.description.showLess", "Show less")}</>)
                          : (<><ChevronDown className="w-3 h-3" />{tr("newBuildDetail.description.readMore", "Read more")}</>)
                        }
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Energy Performance Certificate */}
              {listing.energy_class && listing.energy_class !== "Exempt" && (ENERGY_COLORS as Record<string, string>)[listing.energy_class] && (() => {
                const energyData = ENERGY_SCALE.find((e) => e.cls === listing.energy_class);
                return (
                  <div className="glass-card rounded-2xl border border-border overflow-hidden">
                    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <h4 className="font-display font-semibold text-sm">{tr("newBuildDetail.energy.title", "Energy Performance Certificate")}</h4>
                    </div>
                    <div className="p-6">
                      <div className="flex gap-1 items-end mb-2">
                        {ENERGY_SCALE.map((e, i) => {
                          const isActive = e.cls === listing.energy_class;
                          const barH = 16 + i * 4;
                          return (
                            <div key={e.cls} className="flex-1 flex flex-col items-center gap-0.5">
                              {isActive && <div className="text-[8px] font-black text-foreground">▼</div>}
                              <div
                                style={{ backgroundColor: e.hex, height: `${barH}px`, opacity: isActive ? 1 : 0.4 }}
                                className={`w-full rounded-sm flex items-end justify-center pb-0.5 transition-all ${isActive ? "ring-2 ring-white/30 ring-offset-1 ring-offset-card" : ""}`}
                              >
                                <span className="text-[8px] font-black leading-none"
                                  style={{ color: ["B", "C", "D"].includes(e.cls) ? "#000" : "#fff" }}>
                                  {e.cls}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {energyData && (
                        <div className="flex items-center gap-2 mt-3">
                          <div className={`px-2 py-0.5 rounded text-xs font-black ${(ENERGY_COLORS as Record<string, string>)[listing.energy_class]}`}>
                            {listing.energy_class}
                          </div>
                          <span className="text-xs text-muted-foreground">{energyData.desc}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Features & Amenities */}
              {(() => { // skipcq: JS-R1005 - Feature grouping keeps internal, external, and construction amenities in one section.
                const internalFeatures: { icon?: ElementType; label: string }[] = [];
                const externalFeatures: { icon?: ElementType; label: string }[] = [];
                const constructionFeatures: { icon?: ElementType; label: string }[] = [];

                if (listing.has_elevator) internalFeatures.push({ icon: Building2, label: tr("newBuildDetail.features.elevator", "Elevator") });
                if (listing.has_ac) internalFeatures.push({ icon: Thermometer, label: tr("newBuildDetail.features.airConditioning", "Air Conditioning") });
                if (listing.has_solar_water) internalFeatures.push({ icon: Zap, label: tr("newBuildDetail.features.solarWater", "Solar Water Heating") });
                if (listing.has_storage) internalFeatures.push({ icon: Home, label: tr("newBuildDetail.features.storage", "Storage Space") });
                if (listing.has_security) internalFeatures.push({ icon: Shield, label: tr("newBuildDetail.features.security", "Security System") });
                if (listing.has_fireplace) internalFeatures.push({ icon: Flame, label: tr("newBuildDetail.features.fireplace", "Fireplace") });
                if (listing.has_underfloor_heating) internalFeatures.push({ icon: Thermometer, label: tr("newBuildDetail.features.underfloorHeating", "Underfloor Heating") });
                if (listing.has_smart_home) internalFeatures.push({ icon: Wifi, label: tr("newBuildDetail.features.smartHome", "Smart Home") });

                if (listing.has_parking) externalFeatures.push({ icon: Car, label: tr("newBuildDetail.features.parking", "Parking Space") });
                if (listing.has_garden) externalFeatures.push({ icon: TreePine, label: tr("newBuildDetail.features.garden", "Garden") });
                if (listing.has_pool) externalFeatures.push({ label: tr("newBuildDetail.features.pool", "Swimming Pool") });
                if (listing.has_view) externalFeatures.push({ icon: Eye, label: tr("newBuildDetail.features.view", "View") });

                if (listing.has_video_tour) constructionFeatures.push({ label: tr("newBuildDetail.features.videoTour", "Video Tour") });
                if (listing.has_virtual_tour) constructionFeatures.push({ label: tr("newBuildDetail.features.virtualTour", "Virtual Tour") });

                const total = internalFeatures.length + externalFeatures.length + constructionFeatures.length;
                if (total === 0) return null;
                return (
                  <div className="glass-card rounded-2xl border border-border overflow-hidden">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5 px-5 py-4 border-b border-border">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <h4 className="min-w-0 flex-1 basis-40 font-display font-semibold text-sm">{tr("newBuildDetail.features.title", "Features & Amenities")}</h4>
                      <div className="flex w-full justify-start sm:ml-auto sm:w-auto sm:justify-end">
                        <span className="inline-flex max-w-full items-center justify-center text-center text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                          {trv("newBuildDetail.features.count", "{{count}} features", { count: total })}
                        </span>
                      </div>
                    </div>
                    <div className="p-6 space-y-6">
                      <FeatureSection title={tr("newBuildDetail.features.internal", "Internal")} features={internalFeatures} accent="bg-primary" />
                      <FeatureSection title={tr("newBuildDetail.features.external", "External")} features={externalFeatures} accent="bg-brand-emerald" />
                      <FeatureSection title={tr("newBuildDetail.features.construction", "Construction")} features={constructionFeatures} accent="bg-accent" />
                    </div>
                  </div>
                );
              })()}

              {/* Mini Map */}
              <div className="rounded-2xl overflow-hidden">
                <PropertyMiniMap
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  address={listing.address ?? ""}
                  city={listing.city ?? undefined}
                  title={listing.title}
                  onWalkScoreChange={setWalkScore}
                />
              </div>

              {/* Neighbourhood Report */}
              {listing.address && (
                <NeighbourhoodReport
                  city={listing.city ?? undefined}
                  address={listing.address ?? ""}
                  region={listing.region ?? undefined}
                  lat={listing.latitude != null ? Number(listing.latitude) : undefined}
                  lng={listing.longitude != null ? Number(listing.longitude) : undefined}
                  listingId={id ?? undefined}
                  isPro={isPro}
                />
              )}

              {/* Property Valuation */}
              {id && (
                <PropertyValuation
                  listingId={id}
                  title={listing.title}
                  city={listing.city ?? undefined}
                  address={listing.address ?? undefined}
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
                  latitude={listing.latitude != null ? Number(listing.latitude) : undefined}
                  longitude={listing.longitude != null ? Number(listing.longitude) : undefined}
                />
              )}
            </div>

            {/* ── Right: sticky sidebar ───────────────────────────── */}
            <div className="space-y-4 self-start lg:sticky lg:top-24">
                {/* Register Interest card */}
                <RegisterInterestCard
                  listing={listing as Record<string, unknown>}
                  user={user}
                  onLogin={() => navigate("/login")}
                  onContact={handleRegisterInterest}
                />

                {/* Call button (always accessible) */}
                {owner?.phone && (
                  <a href={`tel:${owner.phone}`} className="block">
                    <Button variant="outline" className="w-full gap-2">
                      <Phone className="w-4 h-4" /> {tr("newBuildDetail.sidebar.callDeveloper", "Call developer")}
                    </Button>
                  </a>
                )}

                {/* Developer card */}
                {owner && (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">{tr("newBuildDetail.sidebar.developer", "Developer")}</p>
                    <div className="flex items-center gap-3">
                      {owner.avatar_url ? (
                        <img src={owner.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Home className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm">{owner.display_name ?? tr("newBuildDetail.sidebar.developer", "Developer")}</p>
                        <p className="text-xs text-muted-foreground">{tr("newBuildDetail.sidebar.verifiedDeveloper", "Verified developer")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick stats */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">{tr("newBuildDetail.sidebar.projectInfo", "Project info")}</p>
                  {listing.construction_status && (() => {
                    const rawPhaseLabel = CONSTRUCTION_PHASES.find(p => p.key === listing.construction_status)?.label
                      ?? listing.construction_status.replace(/_/g, " ");
                    const phaseLabel = tr(`newBuildDetail.phases.${listing.construction_status}`, rawPhaseLabel);
                    return (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.phase", "Phase")}</span>
                        <span className="font-medium text-orange-600 capitalize">{phaseLabel}</span>
                      </div>
                    );
                  })()}
                  {listing.year_built && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.expectedCompletion", "Expected completion")}</span>
                      <span className="font-medium">{listing.year_built}</span>
                    </div>
                  )}
                  {listing.energy_class && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.energyClass", "Energy class")}</span>
                      <EnergyBadge cls={listing.energy_class} />
                    </div>
                  )}
                  {!!listing.total_floors && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.totalFloors", "Total floors")}</span>
                      <span className="font-medium">{listing.total_floors}</span>
                    </div>
                  )}
                  {listing.bedrooms != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.unitBedrooms", "Unit bedrooms")}</span>
                      <span className="font-medium">{listing.bedrooms}</span>
                    </div>
                  )}
                  {listing.sqm != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.unitAreaFrom", "Unit area from")}</span>
                      <span className="font-medium">{listing.sqm} m²</span>
                    </div>
                  )}
                  {listing.has_parking && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.parking", "Parking")}</span>
                      <span className="font-medium text-primary">{tr("newBuildDetail.sidebar.included", "Included")}</span>
                    </div>
                  )}
                  {listing.has_elevator != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.elevator", "Elevator")}</span>
                      <span className="font-medium">{listing.has_elevator ? tr("common.yes", "Yes") : tr("common.no", "No")}</span>
                    </div>
                  )}
                  {listing.has_pool && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tr("newBuildDetail.sidebar.pool", "Pool")}</span>
                      <span className="font-medium text-primary">{tr("newBuildDetail.sidebar.commonArea", "Common area")}</span>
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
                  {tr("newBuildDetail.sidebar.requestFloorPlans", "Request floor plans")}
                </button>

              {/* Walk Score + Safety + Noise */}
              <PropertyScoresSection
                walkScore={walkScore}
                walkabilityScore={listing?.walkability_score != null ? Number(listing.walkability_score) : null}
                safetyScore={listing?.safety_score != null ? Number(listing.safety_score) : null}
                noiseScore={listing?.noise_score != null ? Number(listing.noise_score) : null}
              />
            </div>

          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
