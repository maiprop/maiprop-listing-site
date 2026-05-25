import { useCallback, useState, useEffect } from "react";
import { useModal } from "@/hooks/useModal";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  MapPin, Star, CheckCircle, Globe, ExternalLink,
  ChevronLeft, Clock, Users, Briefcase, MessageSquare,
  Calendar, Shield, Loader2, ChevronRight,
  Phone, Euro, Zap, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals, useProfessional } from "@/hooks/useProfessionals";
import { useProfessionalServices, useProfessionalAvailability } from "@/hooks/useProfessionalServices";
import { useListings } from "@/hooks/useListings";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessionalReviews, computeStats } from "@/hooks/useProfessionalReviews";
import { useNavigate } from "react-router-dom";
import SendMessageModal from "@/components/SendMessageModal";
import BookConsultationModal from "@/components/BookConsultationModal";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import RequestCallbackModal from "@/components/RequestCallbackModal";
import { AIServiceMatchModal } from "@/components/AIServiceMatchModal";
import { StarRating, ListingGrid } from "@/components/professionals/ProfileComponents";
import { ProfessionalOverviewTab } from "@/components/professionals/ProfessionalOverviewTab";
import { ProfessionalServicesTab } from "@/components/professionals/ProfessionalServicesTab";
import { ProfessionalReviewsTab } from "@/components/professionals/ProfessionalReviewsTab";

const categoryLabels: Record<string, { label: string; emoji: string; description: string }> = {
  real_estate_agent: { label: "Real Estate Agent", emoji: "🏠", description: "Buy, sell, rent — licensed agents & agencies" },
  architect: { label: "Licensed Architect", emoji: "🏛️", description: "Building design, planning permits, renovation oversight" },
  civil_engineer: { label: "Civil Engineer", emoji: "⚙️", description: "Structural analysis, static reports, building compliance" },
  lawyer: { label: "Real Estate Lawyer", emoji: "⚖️", description: "Conveyancing, title checks, contract review, Golden Visa" },
  notary: { label: "Notary Public", emoji: "📜", description: "Property transfers, wills, authenticated contracts" },
  electrician: { label: "Certified Electrician", emoji: "⚡", description: "Electrical installations, solar, smart home wiring" },
  plumber: { label: "Plumber", emoji: "🔧", description: "Plumbing installation, maintenance, heating systems" },
  contractor: { label: "General Contractor", emoji: "🏗️", description: "Full renovation, new build, project management" },
  property_manager: { label: "Property Manager", emoji: "🏢", description: "Tenant management, maintenance coordination, rent collection" },
  valuer: { label: "Property Valuer", emoji: "📊", description: "Market appraisal, mortgage valuations, investment analysis" },
  interior_designer: { label: "Interior Designer", emoji: "🎨", description: "Space planning, styling, full renovation coordination" },
  financial_advisor: { label: "Financial Advisor", emoji: "💼", description: "Mortgage advice, investment strategy, tax planning" },
  insurance_broker: { label: "Insurance Broker / Insurer", emoji: "🛡️", description: "Property, construction, and liability insurance" },
  utility_certification_provider: { label: "Utility & Technical Certification", emoji: "📄", description: "DEI, electrical, gas certification" },
  esg_sustainability_consultant: { label: "ESG / Sustainability", emoji: "🌱", description: "Green certification, sustainability audits" },
  relocation_immigration_consultant: { label: "Relocation / Immigration", emoji: "✈️", description: "Golden Visa, relocation, housing" },
  facility_manager: { label: "Facility Manager", emoji: "🔑", description: "Building operations, commercial facility management" },
  short_term_rental_operator: { label: "Short-Term Rental Operator", emoji: "🏡", description: "Airbnb, Booking.com management" },
  hotel_hospitality_operator: { label: "Hotel / Hospitality Operator", emoji: "🏨", description: "Hotel operations, hospitality consulting" },
  marketing_agency: { label: "Marketing / Photographer / Media", emoji: "📸", description: "Property photos, virtual tours, listing marketing" },
  crm_listing_data_provider: { label: "CRM / Listing Portal / Data", emoji: "📊", description: "CRM setup, listing syndication" },
  concrete_contractor: { label: "Concrete Contractor", emoji: "🧱", description: "Foundations, structural concrete, finishing" },
  steel_structure_contractor: { label: "Steel Structure Contractor", emoji: "🔩", description: "Steel frames, beams, columns" },
  carpenter: { label: "Carpenter", emoji: "🪚", description: "Joinery, cabinetry, wood flooring" },
  tile_installer: { label: "Tile Installer", emoji: "🔲", description: "Floor and wall tiling" },
  painter: { label: "Painter", emoji: "🖌️", description: "Interior and exterior painting" },
  building_permit_consultant: { label: "Building Permit Consultant", emoji: "📝", description: "Permit applications, expediting" },
  urban_planning_consultant: { label: "Urban Planning Consultant", emoji: "🗺️", description: "Zoning, planning permits" },
  legalization_specialist: { label: "Legalization Specialist", emoji: "📜", description: "Illegal structure legalization" },
  energy_certificate_inspector: { label: "Energy Certificate Inspector (ΠΕΑ)", emoji: "⚡", description: "Energy performance certificates" },
  building_regulation_consultant: { label: "Regulation Compliance", emoji: "✔️", description: "Building compliance audits" },
  fire_protection_consultant: { label: "Fire Protection Consultant", emoji: "🔥", description: "Fire safety, certification" },
  drywall_installer: { label: "Drywall Installer", emoji: "📐", description: "Gypsum partitions, ceilings" },
  waterproofing_specialist: { label: "Waterproofing Specialist", emoji: "💧", description: "Basement, terrace, roof waterproofing" },
  insulation_contractor: { label: "Insulation Contractor", emoji: "🧊", description: "Thermal and acoustic insulation" },
  roofing_contractor: { label: "Roofing Contractor", emoji: "🏠", description: "Roof replacement and maintenance" },
  window_aluminum_installer: { label: "Window / Aluminum Installer", emoji: "🪟", description: "Windows, doors, shutters" },
  elevator_installer: { label: "Elevator Installer", emoji: "🛗", description: "Elevator installation and service" },
  smart_home_installer: { label: "Smart Home Installer", emoji: "📱", description: "Automation, smart systems" },
};

export default function ProfessionalProfile() { // skipcq: JS-R1005 - Route shell coordinates profile data, actions, tabs, and modals; sections are delegated below.
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: pro, isLoading } = useProfessional(id || "");
  const { data: allProfessionals = [] } = useProfessionals();
  const professionalIsPro = (pro?.subscription_tier || "").toLowerCase() === "pro";
  const { data: dbServices = [] } = useProfessionalServices(professionalIsPro ? id || "" : "");
  const { data: dbAvailability = [] } = useProfessionalAvailability(professionalIsPro ? id || "" : "");
  const queryClient = useQueryClient();
  const { data: agentListings = [] } = useListings(
    { owner_id: pro?.user_id, status: "active" },
    { enabled: !!pro?.user_id && pro?.category === "real_estate_agent" }
  );
  const saleListings = agentListings.filter((l) => l.listing_type !== "rent");
  const rentListings = agentListings.filter((l) => l.listing_type === "rent");
  const listingPrices = agentListings
    .map((l) => Number(l.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const averageActiveDealSize = listingPrices.length > 0
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(listingPrices.reduce((sum, price) => sum + price, 0) / listingPrices.length)
    : null;
  const propertyTypeCounts = agentListings.reduce<Record<string, number>>((acc, listing) => {
    const key = listing.property_type || "property";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topTypologies = Object.entries(propertyTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, count]) => `${type.replace(/_/g, " ")} ${count}`)
    .join(", ");
  const areaCounts = agentListings.reduce<Record<string, number>>((acc, listing) => {
    const key = listing.city || listing.region || "Greece";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const mainServiceArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || pro?.city || "Greece";
  const mainDealType = saleListings.length === rentListings.length
    ? "Balanced sale/rent"
    : saleListings.length > rentListings.length
      ? "Sale"
      : "Rent";
  const agentPortfolioKpis = {
    averageDealSize: pro?.average_deal_size || averageActiveDealSize || "Not enough data",
    typologyMix: topTypologies || "Not enough data",
    mainServiceArea,
    mainDealType: agentListings.length > 0 ? mainDealType : "Not enough data",
  };

  // Realtime: invalidate agent listings when any listing changes for this agent
  useEffect(() => {
    if (!pro?.user_id) return;
    const channel = supabase
      .channel(`agent-listings:${pro.user_id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "listings",
        filter: `owner_id=eq.${pro.user_id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["listings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pro?.user_id, queryClient]);

  const { data: reviews = [] } = useProfessionalReviews(id || "");
  const reviewStats = computeStats(reviews);

  const [activeTab, setActiveTab] = useState<"overview" | "services" | "reviews" | "listings">("overview");
  const modal = useModal<"msg" | "consult" | "callback" | "aiMatch">();
  const navigate = useNavigate();
  const { user } = useAuth();
  const startConversation = useStartConversation();

  const catInfo = pro ? categoryLabels[pro.category] || { label: pro.category, emoji: "👤", description: "" } : null;
  const isRealEstateAgent = pro?.category === "real_estate_agent";

  const displayName = pro?.display_name || "Professional";
  const signInReturnPath = `/professionals/${pro?.id || id || ""}`;
  const requireSignedIn = useCallback((action: string) => {
    toast.error(`Please sign in to ${action}.`);
    navigate("/login", { state: { from: { pathname: signInReturnPath } } });
  }, [navigate, signInReturnPath]);
  const openProtectedModal = useCallback((key: "msg" | "consult" | "callback") => {
    if (!user) {
      const action =
        key === "consult"
          ? "book a consultation"
          : key === "callback"
            ? "request a callback"
            : "send an inquiry";
      requireSignedIn(action);
      return;
    }
    modal.open(key);
  }, [modal, requireSignedIn, user]);

  useEffect(() => {
    if (!pro || searchParams.get("contact") !== "1") return;
    if (professionalIsPro) {
      if (user) modal.open("msg");
      else requireSignedIn("send an inquiry");
    }
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete("contact");
      return next;
    }, { replace: true });
  }, [modal, pro, professionalIsPro, requireSignedIn, searchParams, setSearchParams, user]);

  const handleOpenChat = async () => {
    if (!user) {
      requireSignedIn("chat with this professional");
      return;
    }
    if (!pro?.user_id) {
      toast.error("This professional cannot receive messages yet.");
      return;
    }
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: pro.user_id });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch (_err: unknown) {
      toast.error("Could not open chat.");
    }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!pro) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Professional not found.</p>
        <Link to="/professionals" className="text-primary hover:underline text-sm">← Back to Directory</Link>
      </div>
    </div>
  );

  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const rating = Number(pro.rating) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {modal.isOpen("aiMatch") && (
        <AIServiceMatchModal
          onClose={() => modal.close()}
          onNavigate={(cat) => navigate(`/professionals?category=${cat}`)}
        />
      )}
      <div className="pt-16">

        {/* ── Hero ── */}
        <div className="bg-card border-b border-border">
          <div className="container py-6 sm:py-8">
            <Link to="/professionals" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 sm:mb-6 w-fit transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back to Directory
            </Link>

            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-28 h-28 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-4xl text-primary-foreground overflow-hidden shadow-lg ring-2 ring-primary/20">
                  {pro.avatar_url
                    ? <img src={pro.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    : initials}
                </div>
                {pro.verified && (
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md">
                    <CheckCircle className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h1 className="font-display text-2xl md:text-3xl font-bold">{displayName}</h1>
                      {pro.verified
                        ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
                            <CheckCircle className="w-3 h-3" /> Verified
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Pending Verification
                          </span>
                      }
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald font-semibold border border-brand-emerald/20">Available</span>
                    </div>
                    <p className="flex items-center gap-2 text-muted-foreground text-sm">
                      <span className="text-lg">{catInfo?.emoji}</span>
                      <span className="font-medium text-foreground">{pro.title || catInfo?.label}</span>
                    </p>
                    {catInfo?.description && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">{catInfo.description}</p>
                    )}
                    {pro.city && (
                      <div className="flex items-center gap-1 mt-2 text-muted-foreground text-sm">
                        <MapPin className="w-3.5 h-3.5 text-primary/60" />
                        <span>{pro.city}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <StarRating rating={rating} />
                        <span className="font-bold text-sm">{rating > 0 ? rating.toFixed(1) : "—"}</span>
                        <span className="text-xs text-muted-foreground">({pro.reviews_count || 0} reviews)</span>
                      </div>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-sm text-muted-foreground">{pro.projects_count || 0} completed projects</span>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-sm text-muted-foreground">{pro.experience_years || 0} yrs exp.</span>
                    </div>
                  </div>

                  {/* CTA buttons */}
                  <div className="flex flex-col gap-2 w-full sm:shrink-0 sm:min-w-[160px]">
                    {professionalIsPro ? (
                      <>
                        {user ? (
                          <Button
                            className="bg-gradient-primary border-0 text-primary-foreground gap-2 w-full"
                            onClick={handleOpenChat}
                            disabled={startConversation.isPending}
                          >
                            {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Chat
                          </Button>
                        ) : (
                          <Button
                            className="bg-gradient-primary border-0 text-primary-foreground gap-2 w-full"
                            onClick={() => requireSignedIn("send an inquiry")}
                          >
                            <MessageSquare className="w-4 h-4" /> Send Inquiry
                          </Button>
                        )}
                        <Button variant="outline" className="border-border gap-2 w-full" onClick={() => openProtectedModal("consult")}>
                          <Calendar className="w-4 h-4" /> Book Consultation
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                        Contact details only. Booking, messaging, callbacks, services and portfolio tools unlock when this professional upgrades to Pro.
                      </div>
                    )}
                    {pro.website_url && (
                      <a href={pro.website_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1">
                        <Globe className="w-3.5 h-3.5" /> Visit Website <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Specialty chips */}
                {pro.specialties && pro.specialties.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-4">
                    {pro.specialties.map((s: string) => (
                      <span key={s} className="px-3 py-1 rounded-full bg-gradient-accent text-accent-foreground text-xs font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Stats bar ── */}
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border ${isRealEstateAgent ? (professionalIsPro ? "md:grid-cols-4 lg:grid-cols-6" : "md:grid-cols-3") : "md:grid-cols-5"}`}>
              {(isRealEstateAgent
                ? professionalIsPro
                  ? [
                      { icon: Star, label: "Rating", value: rating > 0 ? `${rating.toFixed(1)} / 5.0` : "New", color: "text-brand-gold" },
                      { icon: Zap, label: "Expertise", value: pro.specialties?.length ? pro.specialties.slice(0, 2).join(", ") : "Multi-market", color: "text-primary" },
                      { icon: Euro, label: "Avg Deal Size", value: pro.average_deal_size || "—", color: "text-brand-gold" },
                      { icon: Building2, label: "Avg Portfolio", value: pro.average_portfolio_asset_size || "—", color: "text-accent" },
                      { icon: Briefcase, label: "Deals Done", value: pro.projects_count || 0, color: "text-primary" },
                      { icon: Clock, label: "Experience", value: pro.experience_years ? `${pro.experience_years} yrs` : "—", color: "text-brand-emerald" },
                    ]
                  : [
                      { icon: Star, label: "Rating", value: rating > 0 ? `${rating.toFixed(1)} / 5.0` : "New", color: "text-brand-gold" },
                      { icon: Building2, label: "Active Listings", value: agentListings.length, color: "text-primary" },
                      { icon: Clock, label: "Experience", value: pro.experience_years ? `${pro.experience_years} yrs` : "—", color: "text-brand-emerald" },
                    ]
                : [
                    { icon: Star, label: "Rating", value: rating > 0 ? `${rating.toFixed(1)} / 5.0` : "New", color: "text-brand-gold" },
                    { icon: Briefcase, label: "Projects Done", value: pro.projects_count || 0, color: "text-primary" },
                    { icon: Users, label: "Client Reviews", value: pro.reviews_count || 0, color: "text-accent" },
                    { icon: Clock, label: "Experience", value: pro.experience_years ? `${pro.experience_years} yrs` : "—", color: "text-brand-emerald" },
                    { icon: Euro, label: "From (per hr)", value: pro.hourly_rate ? `€${pro.hourly_rate}` : "On Request", color: "text-brand-gold" },
                  ]
              ).map(stat => (
                <div key={stat.label} className="glass-card rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div>
                    <div className={`font-display font-bold text-lg leading-none ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="container py-5 sm:py-8 pb-24 lg:pb-10">
          <div className="grid lg:grid-cols-3 gap-5 sm:gap-8">

            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tabs */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit flex-wrap">
                {(["overview", ...(professionalIsPro ? ["services", ...(isRealEstateAgent ? ["listings" as const] : []), "reviews"] : [])] as ("overview" | "services" | "listings" | "reviews")[]).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all capitalize font-medium ${
                      activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {tab}
                    {tab === "listings" && agentListings.length > 0 && (
                      <span className="ml-1.5 text-xs bg-primary/15 text-primary rounded-full px-1.5 py-0.5">{agentListings.length}</span>
                    )}
                    {tab === "reviews" && reviewStats.total > 0 && (
                      <span className="ml-1.5 text-xs bg-brand-gold/15 text-brand-gold rounded-full px-1.5 py-0.5">{reviewStats.total}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Overview ── */}
              {activeTab === "overview" && (
                <ProfessionalOverviewTab
                  pro={pro}
                  isRealEstateAgent={isRealEstateAgent}
                  professionalIsPro={professionalIsPro}
                  agentListingsCount={agentListings.length}
                  agentPortfolioKpis={agentPortfolioKpis}
                />
              )}

              {/* ── Services ── */}
              {activeTab === "services" && professionalIsPro && (
                <ProfessionalServicesTab
                  dbServices={dbServices}
                  dbAvailability={dbAvailability}
                  professionalIsPro={professionalIsPro}
                  user={user}
                  onOpenModal={openProtectedModal}
                />
              )}

              {/* ── Listings ── */}
              {activeTab === "listings" && professionalIsPro && (
                <div className="space-y-4">
                  {agentListings.length === 0 ? (
                    <div className="glass-card rounded-xl p-6 text-center py-8 text-sm text-muted-foreground">
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No active listings at the moment.
                    </div>
                  ) : (
                    <>
                      {saleListings.length > 0 && (
                        <div className="glass-card rounded-xl p-6">
                          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-brand-gold" /> For Sale
                            <span className="ml-1 text-xs bg-brand-gold/15 text-brand-gold rounded-full px-2 py-0.5">{saleListings.length}</span>
                          </h2>
                          <ListingGrid listings={saleListings} />
                        </div>
                      )}
                      {rentListings.length > 0 && (
                        <div className="glass-card rounded-xl p-6">
                          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-brand-emerald" /> For Rent
                            <span className="ml-1 text-xs bg-brand-emerald/15 text-brand-emerald rounded-full px-2 py-0.5">{rentListings.length}</span>
                          </h2>
                          <ListingGrid listings={rentListings} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Reviews ── */}
              {activeTab === "reviews" && professionalIsPro && (
                <ProfessionalReviewsTab
                  professionalId={id || ""}
                  proCategory={pro.category}
                  displayName={displayName}
                  user={user}
                  reviewStats={reviewStats}
                />
              )}
            </div>

            {/* ── Sidebar ── */}
            <div className="space-y-4">
              {/* Contact card */}
              <div className="glass-card rounded-xl p-5 border border-primary/20 lg:sticky lg:top-24">
                <h3 className="font-display font-semibold mb-4">Contact {displayName.split(" ")[0]}</h3>
                <div className="space-y-2.5">
                    {professionalIsPro ? (
                      <>
                      {user ? (
                        <Button
                          className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
                          onClick={handleOpenChat}
                          disabled={startConversation.isPending}
                        >
                          {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Chat
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
                          onClick={() => requireSignedIn("send an inquiry")}
                        >
                          <MessageSquare className="w-4 h-4" /> Send Inquiry
                        </Button>
                      )}
                      <Button variant="outline" className="w-full border-border gap-2" onClick={() => openProtectedModal("consult")}>
                        <Calendar className="w-4 h-4" /> Book Consultation
                      </Button>
                      <Button variant="outline" className="w-full border-border gap-2 text-muted-foreground" onClick={() => openProtectedModal("callback")}>
                        <Phone className="w-4 h-4" /> Request Callback
                      </Button>
                    </>
                    ) : (
                    <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                      This free profile shows public contact details only. Client actions are available on Pro profiles.
                    </div>
                  )}
                  {!!pro.hourly_rate && (
                    <div className="text-center text-xs text-muted-foreground pt-1">
                      Consultation from <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                    </div>
                  )}
                </div>

              </div>

              {/* Credentials */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Credentials</h3>
                <div className="space-y-2.5">
                  <div className={`flex items-center gap-2 text-sm ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`}>
                    <CheckCircle className={`w-4 h-4 shrink-0 ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`} />
                    {pro.verified ? "Identity Verified" : "Pending Verification"}
                  </div>
                  {pro.license_number && (
                    <div className="flex items-center gap-2 text-sm text-brand-emerald">
                      <Shield className="w-4 h-4 shrink-0" /> Licensed Professional
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 shrink-0 text-brand-gold" />
                    {pro.reviews_count || 0} verified client reviews
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="w-4 h-4 shrink-0 text-primary/60" />
                    {pro.projects_count || 0} completed projects
                  </div>
                </div>
              </div>

              {/* Similar professionals */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Similar Professionals</h3>
                <div className="space-y-3">
                  {(Array.isArray(allProfessionals) ? allProfessionals : [])
                    .filter((p) => p.category === pro.category && p.id !== pro.id)
                    .slice(0, 3)
                    .map((peer) => {
                      const peerName = peer.display_name || "Professional";
                      return (
                        <Link key={peer.id} to={`/professionals/${peer.id}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-sm text-primary-foreground shrink-0 overflow-hidden">
                            {peer.avatar_url ? <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" /> : peerName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium group-hover:text-primary transition-colors truncate">{peerName}</div>
                            <div className="text-xs text-muted-foreground">{peer.city || "Greece"}</div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </Link>
                      );
                    })}
                  {(Array.isArray(allProfessionals) ? allProfessionals : []).filter((p) => p.category === pro.category && p.id !== pro.id).length === 0 && (
                    <p className="text-xs text-muted-foreground">No others in this category yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />

      {/* ── Modals ── */}
      <SendMessageModal
        open={modal.isOpen("msg")}
        onClose={() => modal.close()}
        professional={{ id: pro.id, user_id: pro.user_id, display_name: pro.display_name, title: pro.title }}
      />
      <BookConsultationModal
        open={modal.isOpen("consult")}
        onClose={() => modal.close()}
        allowVideoCall={!!(pro?.video_link || dbServices.some(s => s.video_enabled))}
        professional={{ id: pro.id, user_id: pro.user_id, display_name: pro.display_name, title: pro.title, category: pro.category, hourly_rate: pro.hourly_rate, video_link: pro.video_link }}
      />
      <RequestCallbackModal
        open={modal.isOpen("callback")}
        onClose={() => modal.close()}
        professional={{ id: pro.id, display_name: pro.display_name, title: pro.title }}
      />
    </div>
  );
}
