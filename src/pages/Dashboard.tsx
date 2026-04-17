import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Plus, Heart,
  Eye, LogOut, Building2, Gavel, CheckCircle,
  Loader2, Calendar, Trash2, ToggleLeft, ToggleRight,
  Search, Wrench, Shield,
  FolderKanban, Users, Briefcase, Flame,
  Clock, ExternalLink, Crown,
  Lock, Bookmark, ArrowRight,
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { startOfCurrentMonth } from "@/hooks/usePlanLimits";
import { DashboardPlanCard } from "@/components/DashboardPlanCard";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings, useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useFavorites } from "@/hooks/useFavorites";
import { useViewings } from "@/hooks/useViewings";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { useAuctionAlerts } from "@/hooks/useAuctionAlerts";
import { useMyProfessional, useProfessionalServices } from "@/hooks/useProfessionalServices";
import { useMyConsultationRequests } from "@/hooks/useConsultations";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getParticipantTypeFromProfile, PARTICIPANT_LABELS, type ParticipantId } from "@/lib/participantConfig";
import { ProGate } from "@/components/gates/ProGate";
// â”€â”€ Extracted subcomponents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { useTranslation } from "react-i18next";
import { type NavKey, type DashboardRole, getNavItemsForBioType, NAV_LABEL_KEYS } from "@/lib/dashboardNav";
import { ContactsAndLeadsSection } from "./dashboard/ContactsAndLeadsSection";
import { SavedPropertiesSection } from "./dashboard/SavedPropertiesSection";
import { ProfileCompletionCard } from "@/components/dashboard/ProfileCompletionCard";
import { BookingCalendarSection } from "@/components/dashboard/BookingCalendarSection";
import { BuyerOpenHousesCard } from "@/components/dashboard/BuyerOpenHousesCard";
import { ProfessionalProfileEditor } from "@/components/dashboard/ProfessionalProfileEditor";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { SettingsSection } from "@/components/dashboard/SettingsSection";

// Lazy-loaded tab components â€” only mounted when the tab is active
const ViewingsTab = lazy(() => import("./dashboard/ViewingsTab"));
const SavedSearchesTab = lazy(() => import("./dashboard/SavedSearchesTab"));
const AuctionsTab = lazy(() => import("./dashboard/AuctionsTab"));
const ProjectsTab = lazy(() => import("./dashboard/ProjectsTab"));
const PortfoliosTab = lazy(() => import("./dashboard/PortfoliosTab"));
const AnalyticsTab = lazy(() => import("./dashboard/AnalyticsTab"));
const BillingTab = lazy(() => import("./dashboard/BillingTab"));

/** Lazy-tab fallback with a 5-second timeout before showing a retry link */
function TabFallback() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="p-8 text-center text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
      {slow ? (
        <p className="text-sm mt-2">
          Taking longer than expected.{" "}
          <button className="text-primary underline" onClick={() => window.location.reload()}>Refresh</button>
        </p>
      ) : (
        <p className="text-sm">Loading...</p>
      )}
    </div>
  );
}


// â”€â”€ Main Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Dashboard() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, user, signOut, updateProfile, refreshProfile, loading, profileLoading } = useAuth();
  const { isPro } = useSubscription();
  const { eligible: eligibleForQuickSale } = useEligibleForQuickSale();
  const role: DashboardRole = (profile?.role as DashboardRole) || "buyer";
  const bioType = getParticipantTypeFromProfile(profile);

  const navItems = useMemo(
    () => getNavItemsForBioType(bioType, role, isPro, eligibleForQuickSale),
    [bioType, role, isPro, eligibleForQuickSale]
  );
  const sectionNavItems = useMemo(() => navItems.filter(i => !("href" in i && i.href) && !i.locked), [navItems]);
  const defaultSection = (sectionNavItems[0]?.key ?? "overview") as NavKey;
  const [activeSection, setActiveSection] = useState<NavKey>((section as NavKey) || defaultSection);
  const [listingFilter, setListingFilter] = useState<"all" | "off_market" | "pre_sale">("all");

  // Quick Sale access application status (invitation_requests) for buyers / non-investors
  const { data: invitationRequestStatus = "none" } = useQuery<"none" | "pending" | "approved" | "rejected">({
    queryKey: ["invitation-request-status", user?.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await supabase.from("invitation_requests")
        .select("status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as { status?: string } | null;
      if (row?.status === "pending") return "pending";
      if (row?.status === "approved") return "approved";
      if (row?.status === "rejected") return "rejected";
      return "none";
    },
    enabled: !!user && role !== "admin",
  });

  useEffect(() => {
    const valid = sectionNavItems.some(i => i.key === activeSection);
    if (!valid && sectionNavItems.length) setActiveSection(sectionNavItems[0].key as NavKey);
  }, [role, bioType, activeSection, sectionNavItems]);

  const { data: myListings = [], isLoading: listingsLoading } = useMyListings();
  const { data: favorites = [], isLoading: favLoading } = useFavorites();
  const { data: viewings = [] } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const { data: savedSearches = [] } = useSavedSearches();
  const { data: auctionAlerts = [] } = useAuctionAlerts();
  const { data: myProfessional } = useMyProfessional();
  const { data: professionalServices = [] } = useProfessionalServices(myProfessional?.id || "");
  const { data: leads = [], isLoading: _leadsLoading } = useMyConsultationRequests();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const toggleListingStatus = (id: string, currentStatus: string) => {
    updateListing.mutate({ id, updates: { status: currentStatus === "active" ? "paused" : "active" } });
  };

  const displayName = useMemo(
    () => profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "User",
    [profile, user]
  );
  const roleLabel = useMemo(
    () => role === "admin" ? "Admin" : (PARTICIPANT_LABELS[bioType as ParticipantId] ?? "Buyer / Renter"),
    [role, bioType]
  );

  const isInvestorLike = role === "investor" || role === "institutional";
  const isSellSide = role === "agent" || role === "developer";
  const isSellerLike = role === "seller" || bioType === "seller" || isSellSide;

  const upcomingViewingsCount = useMemo(
    () => viewings.filter(v => v.status === "confirmed" || v.status === "pending").length,
    [viewings]
  );
  const ownViewingsCount = useMemo(
    () => ownViewings.filter(v => v.status === "confirmed" || v.status === "pending").length,
    [ownViewings]
  );
  const pendingLeadsCount = useMemo(
    () => leads.filter(l => l.status === "pending").length,
    [leads]
  );

  const stats = useMemo(() => {
    const activeListings = myListings.filter(l => l.status === "active").length;
    const totalViews = myListings.reduce((s, l) => s + (l.views_count || 0), 0);
    const sellSideStats = [
      { label: "Active Listings", value: activeListings, icon: Building2, color: "text-primary" },
      { label: "Total Views", value: totalViews, icon: Eye, color: "text-brand-emerald" },
      { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" },
      { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" },
    ];
    const statsByType: Record<string, { label: string; value: number; icon: React.ElementType; color: string }[]> = {
      buyer:        [{ label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Auction Alerts", value: auctionAlerts.filter(a => a.active).length, icon: Gavel, color: "text-brand-gold" }],
      seller:       sellSideStats,
      agent:        sellSideStats,
      developer:    sellSideStats,
      professional: [{ label: "Services", value: professionalServices.length, icon: Wrench, color: "text-primary" }, { label: "Pending Leads", value: pendingLeadsCount, icon: Briefcase, color: "text-brand-gold" }, { label: "Total Leads", value: leads.length, icon: Users, color: "text-primary" }],
      admin:        sellSideStats,
    };
    const key = role === "admin" ? "admin" : (bioType ?? (role === "seller" ? "seller" : role === "professional" ? "professional" : role === "agent" ? "agent" : role === "developer" ? "developer" : role === "investor" ? "buyer" : role === "institutional" ? "seller" : "buyer"));
    return statsByType[key] ?? statsByType.buyer;
  }, [myListings, favorites, savedSearches, auctionAlerts, upcomingViewingsCount, ownViewingsCount, professionalServices, pendingLeadsCount, leads, bioType, role]);

  const planUsage = useMemo(() => {
    const monthStart = startOfCurrentMonth().toISOString();
    return {
      savedSearches: savedSearches.length,
      searchAlerts: savedSearches.filter(s => s.email_alerts).length,
      viewingsThisMonth: (bioType === "buyer" || (role === "buyer" && !isSellerLike))
        ? viewings.filter(v => v.created_at >= monthStart).length
        : ownViewings.filter(v => v.created_at >= monthStart).length,
      auctionAlerts: auctionAlerts.filter(a => a.active).length,
      listings: myListings.length,
    };
  }, [savedSearches, viewings, ownViewings, auctionAlerts, myListings, bioType, role, isSellerLike]);

  const showPlanCard = useMemo(
    () => ["buyer", "seller", "agent", "developer", "professional"].includes(bioType ?? "") || role === "seller",
    [bioType, role]
  );

  // Auth loading guard â€” show spinner while session/profile resolves
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] pt-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Session expired or lost â€” offer recovery
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] pt-16 gap-4 text-center px-4">
          <p className="text-muted-foreground text-sm">Your session has expired or could not be loaded.</p>
          <Button onClick={handleSignOut}>Sign out and try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 flex">
        {/* Sidebar â€” desktop */}
        <aside className="w-60 shrink-0 hidden md:flex flex-col bg-card border-r border-border min-h-screen sticky top-16 h-[calc(100vh-4rem)]">
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground">
                {displayName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{displayName}</div>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">{roleLabel}</span>
                  {invitationRequestStatus === "pending" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/25 font-bold uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Pending
                    </span>
                  )}
                  {invitationRequestStatus === "rejected" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-bold uppercase tracking-wide">
                      Not approved
                    </span>
                  )}
                  {profile?.verified
                    ? <CheckCircle className="w-3 h-3 text-primary" />
                    : profile?.role === "professional"
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 font-semibold">â³ Pending</span>
                      : null}
                </div>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              item.locked ? (
                <div
                  key={item.key}
                  aria-label={`${t(NAV_LABEL_KEYS[item.key])} â€” available on Pro`}
                  role="presentation"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/40 cursor-not-allowed select-none"
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t(NAV_LABEL_KEYS[item.key])}</span>
                  <Lock className="w-3 h-3 ml-auto shrink-0 text-muted-foreground/40" aria-hidden="true" />
                  <span className="sr-only">(Pro only)</span>
                </div>
              ) : "href" in item && item.href ? (
                <Link key={item.key} to={item.href}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
                    "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t(NAV_LABEL_KEYS[item.key])}
                </Link>
              ) : (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  aria-current={activeSection === item.key ? "page" : undefined}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
                    activeSection === item.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t(NAV_LABEL_KEYS[item.key])}
                  {item.key === "leads" && pendingLeadsCount > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-brand-gold text-background rounded-full px-1.5 py-0.5 min-w-[18px] text-center" aria-label={`${pendingLeadsCount} pending`}>{pendingLeadsCount}</span>
                  )}
                </button>
              )
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile horizontal nav */}
        <div className="md:hidden fixed bottom-14 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border overflow-x-auto scrollbar-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-stretch h-11 min-w-max">
            {navItems.map(item => (
              item.locked ? (
                <div
                  key={item.key}
                  title="Available on Pro"
                  className="flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold text-muted-foreground/40 whitespace-nowrap min-w-[56px] relative cursor-not-allowed select-none"
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {t(NAV_LABEL_KEYS[item.key])}
                  <Lock className="absolute top-0.5 right-1.5 w-2.5 h-2.5 text-muted-foreground/40" />
                </div>
              ) : "href" in item && item.href ? (
                <Link key={item.key} to={item.href}
                  className="flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold transition-colors whitespace-nowrap min-w-[56px] relative text-muted-foreground hover:text-foreground">
                  <item.icon className="w-3.5 h-3.5" />
                  {t(NAV_LABEL_KEYS[item.key])}
                </Link>
              ) : (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={cn("flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold transition-colors whitespace-nowrap min-w-[56px] relative",
                    activeSection === item.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                  )}>
                  <item.icon className="w-3.5 h-3.5" />
                  {t(NAV_LABEL_KEYS[item.key])}
                  {item.key === "leads" && pendingLeadsCount > 0 && (
                    <span className="absolute top-0.5 right-1.5 text-[8px] font-bold bg-brand-gold text-background rounded-full w-3.5 h-3.5 flex items-center justify-center">{pendingLeadsCount}</span>
                  )}
                </button>
              )
            ))}
            <button onClick={handleSignOut} className="flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold text-muted-foreground whitespace-nowrap min-w-[56px]">
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 max-w-full overflow-hidden pb-28 md:pb-6">

          {/* â”€â”€ OVERVIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "overview" && navItems.some(i => i.key === "overview") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold">Good morning, {displayName} ðŸ‘‹</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {isInvestorLike ? "Your investment pipeline and deal opportunities." :
                     bioType === "developer" ? "Manage your project listings and showcases." :
                     role === "seller" || bioType === "seller" ? "Manage your listings and viewings." :
                     isSellSide ? "Here's what's happening with your listings and leads." :
                     role === "professional" ? "Your services and incoming client leads." :
                     "Here's your search activity and alerts."}
                  </p>
                </div>
                {role === "professional" && (
                  <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setActiveSection("leads")}>
                    <Briefcase className="w-4 h-4" /> View Leads {pendingLeadsCount > 0 && `(${pendingLeadsCount})`}
                  </Button>
                )}
                {!isInvestorLike && !isSellerLike && (role === "buyer" || bioType === "buyer") && (
                  <Button variant="outline" className="border-border gap-2" asChild>
                    <Link to="/listings"><Search className="w-4 h-4" /> Browse Listings</Link>
                  </Button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map(stat => (
                  <div key={stat.label} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={cn("w-4 h-4", stat.color)} />
                    </div>
                    <div className={cn("font-display text-2xl font-bold", stat.color)}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Plan & Usage card */}
              {showPlanCard && (
                <DashboardPlanCard
                  audience={(bioType ?? "buyer") as ParticipantId}
                  isPro={isPro}
                  usage={planUsage}
                />
              )}

              {/* Admin overview â€” unified Admin Dashboard */}
              {role === "admin" && (
                <div className="glass-card rounded-xl p-5 border border-primary/20 bg-primary/5">
                  <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-primary"><Shield className="w-4 h-4" /> Admin Dashboard</h2>
                  <p className="text-sm text-muted-foreground mb-3">Quick Saleâ„¢ pipeline, subscribers, pricing, OS sync, and open house management.</p>
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-1.5" asChild>
                    <Link to="/admin"><Shield className="w-3.5 h-3.5" /> Open Admin</Link>
                  </Button>
                </div>
              )}

              {/* Investor / Institutional overview cards */}
              {isInvestorLike && (
                <div className="grid md:grid-cols-2 gap-5">
                  <div className="glass-card rounded-xl p-5 border border-brand-gold/20 bg-brand-gold/5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-brand-gold"><FolderKanban className="w-4 h-4" /> Deal Flow</h2>
                    <p className="text-sm text-muted-foreground mb-3">Your private pipeline of off-market and Quick Saleâ„¢ opportunities.</p>
                    <Button size="sm" className="bg-gradient-gold border-0 text-background font-semibold gap-1.5" asChild>
                      <Link to="/investor-dashboard"><FolderKanban className="w-3.5 h-3.5" /> Open Dashboard</Link>
                    </Button>
                  </div>
                  <div className="glass-card rounded-xl p-5 border border-brand-emerald/20 bg-brand-emerald/5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-brand-emerald"><Calendar className="w-4 h-4" /> Open Houses</h2>
                    <p className="text-sm text-muted-foreground mb-3">Register for exclusive property open houses and submit sealed bids.</p>
                    <Button size="sm" variant="outline" className="border-brand-emerald/40 text-brand-emerald hover:bg-brand-emerald/10 gap-1.5" onClick={() => setActiveSection("open-houses")}>
                      <ExternalLink className="w-3.5 h-3.5" /> My Open Houses
                    </Button>
                  </div>
                  <div className="glass-card rounded-xl p-5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2"><Gavel className="w-4 h-4 text-brand-gold" /> Auction Alerts</h2>
                    <p className="text-sm text-muted-foreground mb-3">Get notified when new auctions match your criteria.</p>
                    <Button variant="outline" size="sm" className="border-brand-gold/40 text-brand-gold" onClick={() => setActiveSection("auctions")}>
                      {auctionAlerts.length > 0 ? `Manage ${auctionAlerts.length} Alerts` : "Create Alert"}
                    </Button>
                  </div>
                  <div className="glass-card rounded-xl p-5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2"><Heart className="w-4 h-4 text-destructive" /> Saved Deals</h2>
                    <p className="text-sm text-muted-foreground mb-3">{favorites.length > 0 ? `${favorites.length} saved â€” tap to view.` : "Save listings you like to compare and track."}</p>
                    <Button variant="outline" size="sm" className="border-border" onClick={() => setActiveSection("saved")}>View Saved</Button>
                  </div>
                </div>
              )}

              {/* Buyer overview */}
              {(role === "buyer" || bioType === "buyer") && !isInvestorLike && !isSellerLike && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="glass-card rounded-xl p-6 border border-destructive/20">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-destructive" /> Quick Saleâ„¢ Access</h2>
                      <p className="text-sm text-muted-foreground mb-3">
                        {invitationRequestStatus === "pending" && "Your application for Quick Saleâ„¢ deal access is under review. We'll notify you within 48 hours."}
                        {invitationRequestStatus === "approved" && "You have access to the Quick Saleâ„¢ deal flow. View exclusive off-market opportunities."}
                        {invitationRequestStatus === "rejected" && "Your application was not approved. You may browse auctions and saved searches."}
                        {invitationRequestStatus === "none" && "Apply for access to exclusive Quick Saleâ„¢ deals. Invitation-only."}
                      </p>
                      {invitationRequestStatus === "approved" ? (
                        <Button size="sm" className="bg-gradient-gold border-0 text-background" asChild><Link to="/investor-dashboard">Open Deal Flow</Link></Button>
                      ) : invitationRequestStatus === "none" ? (
                        <Button variant="outline" size="sm" className="border-destructive/40 text-destructive" asChild><Link to="/investor-dashboard">Apply for Access</Link></Button>
                      ) : null}
                    </div>
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-destructive" /> Saved Properties</h2>
                      <p className="text-sm text-muted-foreground mb-3">{favorites.length > 0 ? `${favorites.length} saved â€” open Saved to view.` : "Save listings you like to find them here."}</p>
                      <Button variant="outline" size="sm" className="border-border" onClick={() => setActiveSection("saved")}>View Saved</Button>
                    </div>
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Gavel className="w-4 h-4 text-brand-gold" /> Auction Alerts</h2>
                      <p className="text-sm text-muted-foreground mb-3">Get notified when new auctions match your criteria.</p>
                      <Button variant="outline" size="sm" className="border-brand-gold/40 text-brand-gold" onClick={() => setActiveSection("auctions")}>
                        {auctionAlerts.length > 0 ? "Manage Alerts" : "Create Alert"}
                      </Button>
                    </div>
                    <BuyerOpenHousesCard onOpen={() => setActiveSection("open-houses")} />
                  </div>
                  {/* Investor mode cross-sell */}
                  {bioType === "buyer" && !profile?.investor_mode && (
                    <div className="glass-card rounded-xl border border-amber-500/20 p-4 flex items-center gap-4">
                      <Flame className="w-8 h-8 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">Investor mode</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Get access to below-market deals, auction pipeline &amp; quick sales.</p>
                      </div>
                      <Button size="sm" className="shrink-0 text-xs h-8 bg-amber-500 hover:bg-amber-600 border-0 text-white"
                        onClick={async () => {
                          if (!user?.id) return;
                          const { error } = await supabase.from("profiles").update({ investor_mode: true }).eq("user_id", user.id);
                          if (error) { toast.error("Could not enable investor mode"); return; }
                          await refreshProfile();
                          toast.success("Investor mode enabled!");
                        }}>
                        Enable
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Seller / Agent overview */}
              {isSellerLike && (
                <>
                  {/* Developer Pro upgrade CTA */}
                  {bioType === "developer" && !isPro && (
                    <div className="glass-card rounded-xl border border-orange-500/30 p-5 bg-orange-500/5">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold">Developer tools require Pro</h3>
                          <p className="text-sm text-muted-foreground mt-1 mb-3">
                            Unlimited listings, project showcases, pre-sale management, and featured placement are all part of the Developer Pro plan.
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 border-0 text-white" asChild>
                              <Link to="/pricing?audience=developer">Start 7-day free trial â†’</Link>
                            </Button>
                            <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-400" asChild>
                              <Link to="/listings/new-building">Preview listing tools</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!isPro && (
                    <div className="glass-card rounded-xl p-5 border border-primary/30 bg-primary/5 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="font-semibold text-sm">Unlock the full Dashboard</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Analytics, CRM, priority ads & more with Pro.</p>
                      </div>
                      <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" asChild><Link to="/pricing">Upgrade to Pro</Link></Button>
                    </div>
                  )}
                  {myListings.length > 0 ? (
                    <div>
                      <h2 className="font-display font-semibold mb-4">Your Active Listings</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {myListings.slice(0, 3).map(l => (
                          <div key={l.id} className="glass-card rounded-xl overflow-hidden">
                            <img src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60"} alt="" className="w-full h-36 object-cover" />
                            <div className="p-4">
                              <p className="font-semibold text-sm truncate">{l.title}</p>
                              <p className="text-xs text-muted-foreground">{l.city} Â· â‚¬{Number(l.price).toLocaleString()}</p>
                              <div className="flex gap-2 mt-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${l.status === "active" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"}`}>{l.status}</span>
                                <span className="text-xs text-muted-foreground">{l.views_count} views</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" className="border-border mt-3" onClick={() => setActiveSection("listings")}>View all listings</Button>
                    </div>
                  ) : (
                    <div className="glass-card rounded-xl p-10 text-center">
                      <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-semibold">No listings yet</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first listing to get started</p>
                      <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => setActiveSection("listings")}>
                        <Plus className="w-4 h-4 mr-2" /> Create Listing
                      </Button>
                    </div>
                  )}
                  {/* Seller â†’ buyer cross-sell */}
                  {bioType === "seller" && (
                    <div className="glass-card rounded-xl border border-border p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Search className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">Looking for your next home?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Browse listings while you sell â€” all in one place.</p>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0 border-border text-xs h-8" asChild>
                        <Link to="/listings">Browse â†’</Link>
                      </Button>
                    </div>
                  )}
                  {/* Agent profile completion nudge */}
                  {(bioType === "agent" || bioType === "developer") && (
                    <ProfileCompletionCard bioType={bioType} profile={profile} proServices={professionalServices} pro={myProfessional} />
                  )}
                </>
              )}

              {/* Professional overview */}
              {role === "professional" && (
                <div className="space-y-5">
                  <div className="grid md:grid-cols-3 gap-5">
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /> My Services</h2>
                      <p className="text-sm text-muted-foreground mb-3">{professionalServices.length > 0 ? `${professionalServices.length} service(s) configured.` : "Add the services you offer so clients can find and book you."}</p>
                      <Button variant="outline" size="sm" className="border-border" onClick={() => setActiveSection("services")}>
                        {professionalServices.length > 0 ? "Edit Services" : "Add Services"}
                      </Button>
                    </div>
                    <div className="glass-card rounded-xl p-6 border border-brand-gold/20">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-brand-gold" /> Incoming Leads
                        {pendingLeadsCount > 0 && (
                          <span className="ml-auto text-xs font-bold bg-brand-gold text-background rounded-full px-2 py-0.5">{pendingLeadsCount} new</span>
                        )}
                      </h2>
                      <p className="text-sm text-muted-foreground mb-3">{leads.length > 0 ? `${leads.length} total request(s).` : "Client consultation and callback requests will appear here."}</p>
                      <Button variant="outline" size="sm" className="border-brand-gold/40 text-brand-gold hover:bg-brand-gold/10" onClick={() => setActiveSection("leads")}>
                        View Leads <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                    <div className="glass-card rounded-xl p-6 border border-primary/20">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Calendar & Calls</h2>
                      <p className="text-sm text-muted-foreground mb-3">Manage your availability, video links, and calendar sync for client bookings.</p>
                      <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => setActiveSection("services")}>
                        Configure <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Professional profile completion nudge */}
                  <ProfileCompletionCard bioType="professional" profile={profile} proServices={professionalServices} pro={myProfessional} />
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ LEADS & CONTACTS CRM â€” all users who need contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "leads" && navItems.some(i => i.key === "leads") && (
            <ContactsAndLeadsSection initialTab="leads" />
          )}

          {/* â”€â”€ MY LISTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "listings" && navItems.some(i => i.key === "listings") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="font-display text-2xl font-bold">My Listings</h1>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                  <Link to="/listings/new"><Plus className="w-4 h-4" /> Create Listing</Link>
                </Button>
              </div>
              {(["agent", "seller", "developer", "institutional"] as string[]).includes(role) && myListings.some(l => l.is_off_market || l.is_pre_sale) && (
                <div className="flex gap-2 flex-wrap text-xs">
                  {(
                    [
                      { key: "all" as const, label: `All (${myListings.length})` },
                      { key: "off_market" as const, label: `ðŸ”’ Off-market (${myListings.filter(l => l.is_off_market).length})` },
                      { key: "pre_sale" as const,  label: `ðŸ—ï¸ Pre-sale (${myListings.filter(l => l.is_pre_sale).length})` },
                    ] satisfies { key: "all" | "off_market" | "pre_sale"; label: string }[]
                  ).map(f => (
                    <button key={f.key}
                      onClick={() => setListingFilter(f.key)}
                      className={`px-3 py-1.5 rounded-full border font-medium transition-colors ${listingFilter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground"}`}
                    >{f.label}</button>
                  ))}
                </div>
              )}
              {listingsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : myListings.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No listings yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">Start by creating your first property listing</p>
                  <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                    <Link to={bioType === "developer" ? "/listings/new-building" : "/listings/new"}><Plus className="w-4 h-4" /> Create First Listing</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(listingFilter === "off_market" ? myListings.filter(l => l.is_off_market)
                    : listingFilter === "pre_sale" ? myListings.filter(l => l.is_pre_sale)
                    : myListings
                  ).map(l => (
                    <div key={l.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                      <img src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&q=60"} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{l.title}</p>
                          {l.is_featured && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30">â­ Featured</span>}
                          {(l.tags || []).includes("exclusive") && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">Exclusive</span>}
                          {l.is_off_market && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">ðŸ”’ Off-market</span>}
                          {l.is_pre_sale && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">ðŸ—ï¸ Pre-sale</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{l.city} Â· â‚¬{Number(l.price).toLocaleString()} Â· {l.sqm}mÂ²</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${l.status === "active" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"}`}>{l.status}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {isSellSide && (
                          <>
                            <button
                              onClick={() => updateListing.mutate({ id: l.id, updates: { is_featured: !l.is_featured } })}
                              className={cn("p-2 rounded-lg transition-colors", l.is_featured ? "bg-brand-gold/20 text-brand-gold" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}
                              title={l.is_featured ? "Featured (click to remove)" : "Add featured badge"}
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              defaultValue={l.priority_placement ?? 0}
                              onBlur={e => {
                                const v = Math.min(10, Math.max(0, Number(e.target.value) || 0));
                                if (v !== (l.priority_placement ?? 0)) updateListing.mutate({ id: l.id, updates: { priority_placement: v } });
                              }}
                              className="w-12 px-1.5 py-1 rounded-lg border border-border bg-secondary text-xs text-center"
                              title="Priority 0â€“10"
                            />
                          </>
                        )}
                        <span className="text-xs text-muted-foreground mr-2">{l.views_count} views</span>
                        <button onClick={() => toggleListingStatus(l.id, l.status)} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          {l.status === "active" ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { if (confirm("Delete this listing?")) deleteListing.mutate(l.id); }} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ SAVED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "saved" && navItems.some(i => i.key === "saved") && (
            <SavedPropertiesSection favorites={favorites} favLoading={favLoading} />
          )}

          {/* â”€â”€ MESSAGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "messages" && navItems.some(i => i.key === "messages") && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Messages</h1>
              <p className="text-sm text-muted-foreground -mt-2">Chat with agents and property owners.</p>
              <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                <Link to="/messages">Open Full Inbox</Link>
              </Button>
            </div>
          )}

          {/* â”€â”€ SAVED SEARCHES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "saved-searches" && navItems.some(i => i.key === "saved-searches") && (
            <Suspense fallback={<TabFallback />}>
              <SavedSearchesTab />
            </Suspense>
          )}

          {/* â”€â”€ VIEWINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "viewings" && navItems.some(i => i.key === "viewings") && (
            <Suspense fallback={<TabFallback />}>
              <ViewingsTab />
            </Suspense>
          )}

          {/* â”€â”€ AUCTION ALERTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "auctions" && navItems.some(i => i.key === "auctions") && (
            <Suspense fallback={<TabFallback />}>
              <AuctionsTab />
            </Suspense>
          )}

          {/* â”€â”€ PROFILE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "profile" && navItems.some(i => i.key === "profile") && (
            role === "professional"
              ? <ProfessionalProfileEditor onSwitchToSettings={() => setActiveSection("settings")} />
              : <ProfileEditor profile={profile} onUpdate={updateProfile} onSwitchToSettings={() => setActiveSection("settings")} />
          )}

          {/* â”€â”€ MY SERVICES â€” professional â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "services" && navItems.some(i => i.key === "services") && <ProfessionalServicesEditor />}

          {/* â”€â”€ BOOKING / CALENDAR â€” professional â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "booking" && navItems.some(i => i.key === "booking") && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                  <FolderKanban className="w-6 h-6 text-primary" /> Booking &amp; Calendar
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Your consultations and scheduled viewings in one place.</p>
              </div>
              <BookingCalendarSection
                viewings={ownViewings}
                leads={leads}
                onGoToLeads={() => setActiveSection("leads")}
                onGoToViewings={() => setActiveSection("viewings")}
                onGoToServices={() => setActiveSection("services")}
              />
            </div>
          )}

          {/* â”€â”€ CONTACTS & LEADS CRM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "contacts" && navItems.some(i => i.key === "contacts") && (
            <ProGate>
              <ContactsAndLeadsSection initialTab="contacts" />
            </ProGate>
          )}

          {/* â”€â”€ OPEN HOUSES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "open-houses" && navItems.some(i => i.key === "open-houses") && (
            <OpenHouseDashboardSection myListings={myListings} />
          )}

          {/* â”€â”€ PROJECTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "projects" && navItems.some(i => i.key === "projects") && (
            <ProGate feature="Developer projects">
              <Suspense fallback={<TabFallback />}>
                <ProjectsTab />
              </Suspense>
            </ProGate>
          )}

          {/* â”€â”€ PORTFOLIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "portfolios" && navItems.some(i => i.key === "portfolios") && (
            <ProGate feature="Portfolio management">
              <Suspense fallback={<TabFallback />}>
                <PortfoliosTab />
              </Suspense>
            </ProGate>
          )}

          {/* â”€â”€ ANALYTICS â€” full analytics dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "analytics" && navItems.some(i => i.key === "analytics") && (
            <Suspense fallback={<TabFallback />}>
              <AnalyticsTab />
            </Suspense>
          )}

          {/* â”€â”€ BILLING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "billing" && navItems.some(i => i.key === "billing") && (
            <Suspense fallback={<TabFallback />}>
              <BillingTab />
            </Suspense>
          )}

          {/* â”€â”€ SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeSection === "settings" && navItems.some(i => i.key === "settings") && (
            <SettingsSection
              roleLabel={roleLabel}
              onUpdate={updateProfile}
              refreshProfile={refreshProfile}
              currentType={bioType}
              hasActiveSub={isPro}
            />
          )}

        </main>
      </div>

    </div>
  );
}

// â”€â”€ [Components moved to src/components/dashboard/ and src/pages/dashboard/] â”€â”€
