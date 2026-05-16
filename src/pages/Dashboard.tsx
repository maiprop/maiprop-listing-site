import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Heart,
  Eye, Building2, Gavel,
  Loader2, Calendar,
  Search, Wrench, Shield,
  FolderKanban, Users, Briefcase, Flame,
  ExternalLink,
  Bookmark, ArrowRight, Settings,
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { startOfCurrentMonth } from "@/hooks/usePlanLimits";
import { DashboardPlanCard } from "@/components/DashboardPlanCard";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { useMyListings } from "@/hooks/useListings";
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
import { getExplicitParticipantTypeFromProfile, getParticipantTypeFromProfile, PARTICIPANT_LABELS, type ParticipantId } from "@/lib/participantConfig";
import { ProGate } from "@/components/gates/ProGate";
// ── Extracted subcomponents ───────────────────────────────────────────────────
import { type NavKey, type DashboardRole, type NavItemResolved, getNavItemsForBioType } from "@/lib/dashboardNav";
import { ContactsAndLeadsSection } from "./dashboard/ContactsAndLeadsSection";
import { MyListingsSection } from "./dashboard/MyListingsSection";
import { SavedPropertiesSection } from "./dashboard/SavedPropertiesSection";
import { ProfileCompletionCard } from "@/components/dashboard/ProfileCompletionCard";
import { BookingCalendarSection } from "@/components/dashboard/BookingCalendarSection";
import { BuyerOpenHousesCard } from "@/components/dashboard/BuyerOpenHousesCard";
import { ProfessionalProfileEditor } from "@/components/dashboard/ProfessionalProfileEditor";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardMobileNav } from "@/components/dashboard/DashboardMobileNav";

// Lazy-loaded tab components — only mounted when the tab is active
const ViewingsTab = lazy(() => import("./dashboard/ViewingsTab"));
const SavedSearchesTab = lazy(() => import("./dashboard/SavedSearchesTab"));
const AuctionsTab = lazy(() => import("./dashboard/AuctionsTab"));
const ProjectsTab = lazy(() => import("./dashboard/ProjectsTab"));
const PortfoliosTab = lazy(() => import("./dashboard/PortfoliosTab"));
const AnalyticsTab = lazy(() => import("./dashboard/AnalyticsTab"));
const BillingTab = lazy(() => import("./dashboard/BillingTab"));
const DataInputTab = lazy(() => import("./dashboard/DataInputTab"));

/** Lazy-tab fallback with a 5-second timeout before showing a retry link */
const TabFallback = () => {
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
};


// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() { // skipcq: JS-R1005
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // (t no longer needed - moved to nav components)
  const { profile, user, signOut, updateProfile, refreshProfile, loading, profileLoading } = useAuth();
  const { isPro } = useSubscription();
  const { eligible: eligibleForQuickSale } = useEligibleForQuickSale();
  const role: DashboardRole = (profile?.role as DashboardRole) || "buyer";
  const roleSwitchInProgress = profileRoleSwitchInProgress(profile);
  const bioType = roleSwitchInProgress
    ? null
    : (getExplicitParticipantTypeFromProfile(profile) ?? getParticipantTypeFromProfile(profile));
  const hasInvestorAccess =
    !roleSwitchInProgress && (
      role === "investor" ||
      role === "institutional" ||
      (eligibleForQuickSale && role === "buyer" && bioType === "buyer")
    );

  const navItems = useMemo<NavItemResolved[]>(
    () => roleSwitchInProgress
      ? [{ key: "settings", label: "Settings", icon: Settings, locked: false }]
      : getNavItemsForBioType(bioType, role, isPro, eligibleForQuickSale),
    [bioType, role, isPro, eligibleForQuickSale, roleSwitchInProgress]
  );
  const sectionNavItems = useMemo(() => navItems.filter(i => !("href" in i && i.href) && !i.locked), [navItems]);
  const defaultSection = (sectionNavItems[0]?.key ?? "overview") as NavKey;
  const querySection = searchParams.get("tab") as NavKey | null;
  const requestedSection = (section as NavKey | undefined) || querySection || undefined;
  const requestedSectionIsAvailable = requestedSection === "settings" || sectionNavItems.some((item) => item.key === requestedSection);
  const [activeSection, setActiveSection] = useState<NavKey>(
    requestedSectionIsAvailable && requestedSection ? requestedSection : defaultSection,
  );

  // Quick Sale access application status (invitation_requests) for buyers / non-investors
  const { data: invitationRequestStatus = "none" } = useQuery<"none" | "pending" | "approved" | "rejected">({
    queryKey: ["invitation-request-status", user?.id],
    queryFn: async () => {
      if (!user) return "none";
      const { data } = await supabase.from("invitation_requests")
        .select("status")
        .eq("user_id", user.id)
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
    const validForRole = navItems.some(i => i.key === activeSection);
    if (!validForRole && sectionNavItems.length) setActiveSection(sectionNavItems[0].key as NavKey);
  }, [role, bioType, activeSection, navItems, sectionNavItems]);

  useEffect(() => {
    if (!requestedSection) return;
    const routeSection = requestedSection;
    if (routeSection === "settings" && activeSection !== "settings") {
      setActiveSection("settings");
      return;
    }
    const routeSectionIsAvailable = sectionNavItems.some((item) => item.key === routeSection);
    if (routeSectionIsAvailable && activeSection !== routeSection) {
      setActiveSection(routeSection);
    }
  }, [activeSection, requestedSection, sectionNavItems]);

  const { data: myListings = [] } = useMyListings();
  const { data: favorites = [], isLoading: favLoading } = useFavorites();
  const { data: viewings = [] } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const { data: savedSearches = [] } = useSavedSearches();
  const { data: auctionAlerts = [] } = useAuctionAlerts();
  const { data: myProfessional } = useMyProfessional();
  const { data: professionalServices = [] } = useProfessionalServices(myProfessional?.id || "");
  const { data: leads = [], isLoading: _leadsLoading } = useMyConsultationRequests();

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const displayName = useMemo(
    () => profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "User",
    [profile, user]
  );
  const roleLabel = useMemo(
    () => roleSwitchInProgress
      ? "Switching Account Type"
      : role === "admin"
      ? "Admin"
      : hasInvestorAccess
        ? "Investor"
        : (PARTICIPANT_LABELS[bioType as ParticipantId] ?? "Buyer / Renter"),
    [role, bioType, hasInvestorAccess, roleSwitchInProgress]
  );

  const isInvestorLike = hasInvestorAccess;
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
      investor:     [{ label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Auction Alerts", value: auctionAlerts.filter(a => a.active).length, icon: Gavel, color: "text-brand-gold" }],
      institutional:[{ label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Auction Alerts", value: auctionAlerts.filter(a => a.active).length, icon: Gavel, color: "text-brand-gold" }],
      admin:        sellSideStats,
    };
    const key = role === "admin"
      ? "admin"
      : hasInvestorAccess
        ? (role === "institutional" ? "institutional" : "investor")
        : (bioType ?? (role === "seller" ? "seller" : role === "professional" ? "professional" : role === "agent" ? "agent" : role === "developer" ? "developer" : "buyer"));
    return statsByType[key] ?? statsByType.buyer;
  }, [myListings, favorites, savedSearches, auctionAlerts, upcomingViewingsCount, ownViewingsCount, professionalServices, pendingLeadsCount, leads, bioType, role, hasInvestorAccess]);

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
    () => !hasInvestorAccess && (["buyer", "seller", "agent", "developer", "professional"].includes(bioType ?? "") || role === "seller"),
    [bioType, role, hasInvestorAccess]
  );

  // Auth loading guard — show spinner while session/profile resolves
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

  // Session expired or lost — offer recovery
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
        {/* Sidebar - desktop */}
        <DashboardSidebar
          navItems={navItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
          onSignOut={handleSignOut}
          displayName={displayName}
          roleLabel={roleLabel}
          invitationRequestStatus={invitationRequestStatus}
          profileVerified={!!profile?.verified}
          profileRole={profile?.role}
          pendingLeadsCount={pendingLeadsCount}
        />

        {/* Mobile horizontal nav */}
        <DashboardMobileNav
          navItems={navItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
          onSignOut={handleSignOut}
          pendingLeadsCount={pendingLeadsCount}
        />

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 max-w-full overflow-hidden pb-28 md:pb-6">

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {activeSection === "overview" && navItems.some(i => i.key === "overview") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold">Good morning, {displayName} 👋</h1>
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

              {/* Admin overview — unified Admin Dashboard */}
              {role === "admin" && (
                <div className="glass-card rounded-xl p-5 border border-primary/20 bg-primary/5">
                  <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-primary"><Shield className="w-4 h-4" /> Admin Dashboard</h2>
                  <p className="text-sm text-muted-foreground mb-3">Quick Sale™ pipeline, subscribers, pricing, OS sync, and open house management.</p>
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
                    <p className="text-sm text-muted-foreground mb-3">Your private pipeline of off-market and Quick Sale™ opportunities.</p>
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
                    <p className="text-sm text-muted-foreground mb-3">{favorites.length > 0 ? `${favorites.length} saved — tap to view.` : "Save listings you like to compare and track."}</p>
                    <Button variant="outline" size="sm" className="border-border" onClick={() => setActiveSection("saved")}>View Saved</Button>
                  </div>
                </div>
              )}

              {/* Buyer overview */}
              {(role === "buyer" || bioType === "buyer") && !isInvestorLike && !isSellerLike && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="glass-card rounded-xl p-6 border border-destructive/20">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-destructive" /> Quick Sale™ Access</h2>
                      <p className="text-sm text-muted-foreground mb-3">
                        {invitationRequestStatus === "pending" && "Your application for Quick Sale™ deal access is under review. We'll notify you within 48 hours."}
                        {invitationRequestStatus === "approved" && "Your Quick Sale™ application is approved. Complete payment to activate deal-flow access."}
                        {invitationRequestStatus === "rejected" && "Your application was not approved. You may browse auctions and saved searches."}
                        {invitationRequestStatus === "none" && "Apply for access to exclusive Quick Sale™ deals. Invitation-only."}
                      </p>
                      {invitationRequestStatus === "approved" ? (
                        <Button size="sm" className="bg-gradient-gold border-0 text-background" asChild><Link to="/pricing">View Investor Plans</Link></Button>
                      ) : invitationRequestStatus === "none" ? (
                        <Button variant="outline" size="sm" className="border-destructive/40 text-destructive" asChild><Link to="/investor-dashboard">Apply for Access</Link></Button>
                      ) : null}
                    </div>
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-destructive" /> Saved Properties</h2>
                      <p className="text-sm text-muted-foreground mb-3">{favorites.length > 0 ? `${favorites.length} saved — open Saved to view.` : "Save listings you like to find them here."}</p>
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
                          const { error } = await updateProfile({ investor_mode: true });
                          if (error) { toast.error("Could not enable investor mode"); return; }
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
                              <Link to="/pricing?audience=developer">Start 7-day free trial →</Link>
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
                              <p className="text-xs text-muted-foreground">{l.city} · €{Number(l.price).toLocaleString()}</p>
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
                  {/* Seller → buyer cross-sell */}
                  {bioType === "seller" && (
                    <div className="glass-card rounded-xl border border-border p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Search className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">Looking for your next home?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Browse listings while you sell — all in one place.</p>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0 border-border text-xs h-8" asChild>
                        <Link to="/listings">Browse →</Link>
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

          {/* ── LEADS & CONTACTS CRM — all users who need contacts ───────────── */}
          {activeSection === "leads" && navItems.some(i => i.key === "leads") && (
            <ProGate>
              <ContactsAndLeadsSection initialTab="leads" />
            </ProGate>
          )}

          {/* ── MY LISTINGS ──────────────────────────────────────────────── */}
          {activeSection === "listings" && navItems.some(i => i.key === "listings") && (
            <MyListingsSection bioType={bioType} role={role} />
          )}

          {/* ── SAVED ────────────────────────────────────────────────────── */}
          {activeSection === "saved" && navItems.some(i => i.key === "saved") && (
            <SavedPropertiesSection favorites={favorites} favLoading={favLoading} />
          )}

          {/* ── MESSAGES ─────────────────────────────────────────────────── */}
          {activeSection === "messages" && navItems.some(i => i.key === "messages") && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Messages</h1>
              <p className="text-sm text-muted-foreground -mt-2">Chat with agents and property owners.</p>
              <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                <Link to="/messages">Open Full Inbox</Link>
              </Button>
            </div>
          )}

          {/* ── SAVED SEARCHES ───────────────────────────────────────────── */}
          {activeSection === "saved-searches" && navItems.some(i => i.key === "saved-searches") && (
            navItems.find(i => i.key === "saved-searches")?.locked
              ? <ProGate />
              : <Suspense fallback={<TabFallback />}><SavedSearchesTab /></Suspense>
          )}

          {/* ── VIEWINGS ─────────────────────────────────────────────────── */}
          {activeSection === "viewings" && navItems.some(i => i.key === "viewings") && (
            <Suspense fallback={<TabFallback />}>
              <ViewingsTab />
            </Suspense>
          )}

          {/* ── AUCTION ALERTS ───────────────────────────────────────────── */}
          {activeSection === "auctions" && navItems.some(i => i.key === "auctions") && (
            <Suspense fallback={<TabFallback />}>
              <AuctionsTab />
            </Suspense>
          )}

          {/* ── PROFILE ──────────────────────────────────────────────────── */}
          {activeSection === "profile" && navItems.some(i => i.key === "profile") && (
            role === "professional"
              ? <ProfessionalProfileEditor onSwitchToSettings={() => setActiveSection("settings")} />
              : <ProfileEditor profile={profile} onUpdate={updateProfile} onSwitchToSettings={() => setActiveSection("settings")} />
          )}

          {/* ── MY SERVICES — professional ───────────────────────────────── */}
          {activeSection === "services" && navItems.some(i => i.key === "services") && <ProfessionalServicesEditor />}

          {/* ── BOOKING / CALENDAR — professional ───────────────────────── */}
          {activeSection === "booking" && navItems.some(i => i.key === "booking") && (
            <ProGate>
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
            </ProGate>
          )}

          {/* ── CONTACTS & LEADS CRM ───────────────────────────────────── */}
          {activeSection === "contacts" && navItems.some(i => i.key === "contacts") && (
            <ProGate>
              <ContactsAndLeadsSection initialTab="contacts" />
            </ProGate>
          )}

          {/* ── OPEN HOUSES ─────────────────────────────────────────────── */}
          {activeSection === "open-houses" && navItems.some(i => i.key === "open-houses") && (
            navItems.find(i => i.key === "open-houses")?.locked
              ? <ProGate />
              : <OpenHouseDashboardSection myListings={myListings} />
          )}

          {/* ── PROJECTS ─────────────────────────────────────────────────── */}
          {activeSection === "projects" && navItems.some(i => i.key === "projects") && (
            <ProGate feature="Developer projects">
              <Suspense fallback={<TabFallback />}>
                <ProjectsTab />
              </Suspense>
            </ProGate>
          )}

          {/* ── PORTFOLIOS ───────────────────────────────────────────────── */}
          {activeSection === "portfolios" && navItems.some(i => i.key === "portfolios") && (
            <ProGate feature="Portfolio management">
              <Suspense fallback={<TabFallback />}>
                <PortfoliosTab />
              </Suspense>
            </ProGate>
          )}

          {/* ── ANALYTICS — full analytics dashboard ──────────────────── */}
          {activeSection === "analytics" && navItems.some(i => i.key === "analytics") && (
            <Suspense fallback={<TabFallback />}>
              <AnalyticsTab />
            </Suspense>
          )}

          {/* ── DATA INPUT (agent loyalty) ──────────────────────────── */}
          {activeSection === "data-input" && navItems.some(i => i.key === "data-input") && (
            <Suspense fallback={<TabFallback />}>
              <DataInputTab />
            </Suspense>
          )}

          {/* ── BILLING ──────────────────────────────────────────────── */}
          {activeSection === "billing" && navItems.some(i => i.key === "billing") && (
            <Suspense fallback={<TabFallback />}>
              <BillingTab />
            </Suspense>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────── */}
          {activeSection === "settings" && (
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

// ── [Components moved to src/components/dashboard/ and src/pages/dashboard/] ──
