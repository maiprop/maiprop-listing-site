import { useState, useEffect, lazy, Suspense } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Home, Plus, BarChart2, MessageSquare, Heart, Settings, User,
  Eye, Bell, LogOut, Building2, Gavel, CheckCircle,
  Loader2, Calendar, Trash2, ToggleLeft, ToggleRight, Bookmark,
  Search, Wrench, Shield, CreditCard,
  FolderKanban, Users, Briefcase, TrendingUp, Globe2, Flame,
  ArrowRight, Clock, CheckCircle2, AlertCircle, ExternalLink, Star, Crown,
  Lock, Zap,
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { startOfCurrentMonth } from "@/hooks/usePlanLimits";
import { DashboardPlanCard } from "@/components/DashboardPlanCard";
import { useProfessionalAvailability } from "@/hooks/useProfessionalServices";
import { Progress } from "@/components/ui/progress";
import ContactsCRM from "@/components/ContactsCRM";
import LeadsCRM from "@/components/LeadsCRM";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings, useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useListingViewTrends, useLeadFunnel } from "@/hooks/useAnalytics";
import { useFavorites } from "@/hooks/useFavorites";
import { useViewings } from "@/hooks/useViewings";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { useAuctionAlerts } from "@/hooks/useAuctionAlerts";
import { useMyProfessional, useProfessionalServices, useUpdateProfessional } from "@/hooks/useProfessionalServices";
import { useStartConversation } from "@/hooks/useMessages";
import { PropertyCard } from "@/components/PropertyCard";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getParticipantTypeFromProfile, type ParticipantId } from "@/lib/participantConfig";
import { dbListingToCard } from "@/lib/listingUtils";
import { ProGate } from "@/components/gates/ProGate";

// Lazy-loaded tab components — only mounted when the tab is active
const ViewingsTab = lazy(() => import("./dashboard/ViewingsTab"));
const SavedSearchesTab = lazy(() => import("./dashboard/SavedSearchesTab"));
const AuctionsTab = lazy(() => import("./dashboard/AuctionsTab"));
const ProjectsTab = lazy(() => import("./dashboard/ProjectsTab"));
const PortfoliosTab = lazy(() => import("./dashboard/PortfoliosTab"));
const AnalyticsTab = lazy(() => import("./dashboard/AnalyticsTab"));
const BillingTab = lazy(() => import("./dashboard/BillingTab"));

const TAB_FALLBACK = (
  <div className="p-8 text-center text-muted-foreground">
    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
    Loading...
  </div>
);

function ContactsAndLeadsSection({ initialTab = "contacts" }: { initialTab?: "contacts" | "leads" }) {
  const [tab, setTab] = useState<"contacts" | "leads">(initialTab);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setTab("contacts")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
            tab === "contacts" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4 inline mr-2" /> Contacts
        </button>
        <button
          onClick={() => setTab("leads")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
            tab === "leads" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <Briefcase className="w-4 h-4 inline mr-2" /> Leads
        </button>
      </div>
      {tab === "contacts" ? <ContactsCRM /> : <LeadsCRM />}
    </div>
  );
}

const SAVED_TABS = [
  { label: "All", value: "" }, { label: "Sale", value: "sale" },
  { label: "Rent", value: "rent" }, { label: "Auction", value: "auction" },
  { label: "Quick Sale", value: "firesale" },
] as const;

function SavedPropertiesSection({ favorites, favLoading }: { favorites: any[]; favLoading: boolean }) {
  const [tab, setTab] = useState<string>("");
  const filtered = favorites.filter((f: any) => f.listings && (!tab || f.listings.listing_type === tab));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Saved Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">{favorites.length} saved</p>
        </div>
        <Button variant="outline" className="border-border gap-2 text-sm" asChild>
          <Link to="/listings"><Search className="w-4 h-4" /> Browse More</Link>
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {SAVED_TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              tab === t.value ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"}`}>
            {t.label}
            {t.value && <span className="ml-1.5 text-xs opacity-60">{favorites.filter(f => f.listings?.listing_type === t.value).length}</span>}
          </button>
        ))}
      </div>
      {favLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">{tab ? `No saved ${tab} properties` : "No saved properties yet"}</p>
          <p className="text-sm text-muted-foreground mt-1">Browse listings and tap the heart to save</p>
          <Button variant="outline" className="border-border mt-4" asChild><Link to="/listings">Browse Listings</Link></Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((f: any) => <PropertyCard key={f.id} property={dbListingToCard(f.listings)} />)}
        </div>
      )}
    </div>
  );
}

// ── Consultation requests hook (for Leads module) ──────────────────────────────
function useMyLeads(professionalId: string | undefined) {
  return useQuery({
    queryKey: ["consultation_requests", professionalId],
    queryFn: async () => {
      if (!professionalId) return [];
      const { data, error } = await supabase
        .from("consultation_requests")
        .select("*")
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!professionalId,
  });
}

function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("consultation_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["consultation_requests"] }); toast.success("Status updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Nav key type ───────────────────────────────────────────────────────────────
type NavKey =
  | "overview" | "listings" | "analytics" | "saved" | "saved-searches"
  | "messages" | "viewings" | "auctions" | "open-houses" | "services" | "booking" | "leads"
  | "deal-flow" | "contacts" | "projects" | "portfolios"
  | "billing" | "profile" | "settings";

type DashboardRole = "individual" | "seller_landlord" | "agent" | "professional" | "developer" | "investor" | "institutional" | "admin";

const ALL_NAV_ITEMS: { icon: React.ElementType; label: string; key: NavKey; href?: string }[] = [
  { icon: Home,          label: "Overview",       key: "overview"       },
  { icon: FolderKanban,  label: "Investor Dashboard", key: "deal-flow", href: "/investor-dashboard" },
  { icon: Building2,     label: "My Listings",     key: "listings"       },
  { icon: BarChart2,     label: "Analytics",       key: "analytics"      },
  { icon: Heart,         label: "Saved",           key: "saved"          },
  { icon: Bookmark,      label: "Saved Searches",  key: "saved-searches" },
  { icon: MessageSquare, label: "Messages",         key: "messages"       },
  { icon: Calendar,      label: "Viewings",         key: "viewings"       },
  { icon: Gavel,         label: "Auction Alerts",   key: "auctions"       },
  { icon: Calendar,      label: "Open Houses",      key: "open-houses"    },
  { icon: Wrench,        label: "My Services",      key: "services"       },
  { icon: FolderKanban,  label: "Booking",          key: "booking"        },
  { icon: Briefcase,     label: "Leads",            key: "leads"          },
  { icon: Users,         label: "Contacts",         key: "contacts"       },
  { icon: Globe2,        label: "Projects",         key: "projects"       },
  { icon: TrendingUp,    label: "Portfolios",       key: "portfolios"     },
  { icon: CreditCard,    label: "Billing",          key: "billing"        },
  { icon: User,          label: "Profile",          key: "profile"        },
  { icon: Settings,      label: "Settings",         key: "settings"       },
];

// ── Nav per bio-type (spec-accurate) ──────────────────────────────────────────
const NAV_BY_TYPE: Record<string, NavKey[]> = {
  buyer:         ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  seller:        ["overview", "listings", "saved", "saved-searches", "messages", "viewings", "open-houses", "billing", "profile", "settings"],
  agent:         ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "leads", "contacts", "billing", "profile", "settings"],
  developer:     ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "leads", "contacts", "projects", "portfolios", "billing", "profile", "settings"],
  professional:  ["overview", "services", "booking", "leads", "contacts", "analytics", "messages", "viewings", "billing", "profile", "settings"],
  investor:      ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  institutional: ["overview", "saved", "saved-searches", "listings", "messages", "viewings", "auctions", "open-houses", "contacts", "billing", "profile", "settings"],
  admin:         ["overview", "deal-flow", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "services", "booking", "leads", "contacts", "projects", "portfolios", "billing", "profile", "settings"],
};

// Free tier: same nav as pro — gating happens inside the section content, not by hiding nav items
const NAV_BY_TYPE_FREE: Record<string, NavKey[]> = {
  buyer:         ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  seller:        ["overview", "listings", "saved", "messages", "viewings", "open-houses", "billing", "profile", "settings"],
  agent:         ["overview", "listings", "saved", "messages", "viewings", "auctions", "open-houses", "leads", "billing", "profile", "settings"],
  developer:     ["overview", "listings", "messages", "leads", "billing", "profile", "settings"],
  professional:  ["overview", "services", "leads", "messages", "billing", "profile", "settings"],
  investor:      ["overview", "saved", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  institutional: ["overview", "saved", "listings", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  admin:         ["overview", "deal-flow", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "services", "booking", "leads", "contacts", "projects", "portfolios", "billing", "profile", "settings"],
};

function getNavItemsForBioType(bioType: string | null, role: DashboardRole, isPro: boolean, eligibleForQuickSale = false) {
  if (role === "admin") return ALL_NAV_ITEMS.filter(i => NAV_BY_TYPE.admin.includes(i.key));
  const key = bioType ?? (
    role === "seller_landlord" ? "seller" :
    role === "professional"   ? "professional" :
    role === "agent"          ? "agent" :
    role === "developer"      ? "developer" :
    role === "investor"       ? "investor" :
    role === "institutional"  ? "institutional" :
    "buyer"
  );
  const navMap = !isPro && key !== "admin" ? NAV_BY_TYPE_FREE : NAV_BY_TYPE;
  let keys = navMap[key] ?? navMap.buyer;
  if (eligibleForQuickSale && key === "buyer" && !keys.includes("deal-flow")) {
    keys = [...keys, "deal-flow"];
  }
  return ALL_NAV_ITEMS.filter(i => keys.includes(i.key));
}

// ── Lead status badge ──────────────────────────────────────────────────────────
const LEAD_STATUS_COLORS: Record<string, string> = {
  pending:   "bg-brand-gold/20 text-brand-gold",
  reviewed:  "bg-brand-purple/20 text-brand-purple",
  confirmed: "bg-primary/20 text-primary",
  cancelled: "bg-muted text-muted-foreground",
};


// ── Profile Completion nudge card (agent / professional) ─────────────────────
function ProfileCompletionCard({ bioType, profile }: { bioType: string; profile: any }) {
  const steps = bioType === "agent" ? [
    { label: "Add profile photo",        done: !!profile?.avatar_url,    gain: "+15% leads" },
    { label: "Add license number",       done: !!profile?.license_number, gain: "Verified badge" },
    { label: "Set your working areas",   done: !!profile?.city,           gain: "+20% leads" },
    { label: "Complete bio",             done: (profile?.bio?.length ?? 0) > 50, gain: "+10% trust" },
  ] : [
    { label: "Add profile photo",        done: !!profile?.avatar_url,    gain: "+15% leads" },
    { label: "Add service catalog",      done: false,                     gain: "+25% leads" },
    { label: "Set availability hours",   done: false,                     gain: "+20% leads" },
    { label: "Upload license/certificate", done: false,                  gain: "Verified badge" },
    { label: "Connect video room",       done: false,                     gain: "+10% conversion" },
  ];

  const completed = steps.filter(s => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);
  if (pct === 100) return null;

  return (
    <div className="glass-card rounded-xl border border-primary/20 p-4 bg-primary/5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">Complete your profile</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Get more leads by completing your profile</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-primary">{pct}%</span>
          <p className="text-[10px] text-muted-foreground">complete</p>
        </div>
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full mb-3">
        <div className="h-1.5 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {steps.filter(s => !s.done).slice(0, 3).map(s => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
              {s.label}
            </div>
            <span className="text-primary font-medium">{s.gain}</span>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" className="w-full mt-3 border-primary/30 text-primary text-xs h-8"
        onClick={() => {}}>
        Complete profile →
      </Button>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { profile, user, signOut, updateProfile, refreshProfile } = useAuth();
  const { isPro } = useSubscription();
  const { eligible: eligibleForQuickSale } = useEligibleForQuickSale();
  const role: DashboardRole = (profile?.role as DashboardRole) || "individual";
  const bioType = getParticipantTypeFromProfile(profile);

  const navItems = getNavItemsForBioType(bioType, role, isPro, eligibleForQuickSale);
  const sectionNavItems = navItems.filter(i => !("href" in i && i.href));
  const defaultSection = (sectionNavItems[0]?.key ?? "overview") as NavKey;
  const [activeSection, setActiveSection] = useState<NavKey>((section as NavKey) || defaultSection);
  const [listingFilter, setListingFilter] = useState<"all" | "off_market" | "pre_sale">("all");

  // Quick Sale access application status (invitation_requests) for buyers / non-investors
  const [invitationRequestStatus, setInvitationRequestStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  useEffect(() => {
    if (!user) return;
    if (role === "admin") return;
    supabase
      .from("invitation_requests" as any)
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { status?: string } | null;
        if (row?.status === "pending") setInvitationRequestStatus("pending");
        else if (row?.status === "approved") setInvitationRequestStatus("approved");
        else if (row?.status === "rejected") setInvitationRequestStatus("rejected");
      });
  }, [user, role]);

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
  const listingIds = myListings.map((l: any) => l.id).filter(Boolean);
  const { data: viewTrends = [] } = useListingViewTrends(listingIds);
  const { data: leadFunnel } = useLeadFunnel(myProfessional?.id);
  const { data: professionalServices = [] } = useProfessionalServices(myProfessional?.id || "");
  const { data: leads = [], isLoading: _leadsLoading } = useMyLeads(myProfessional?.id);
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const _updateLeadStatus = useUpdateLeadStatus();
  const _startConversation = useStartConversation();

  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const toggleListingStatus = (id: string, currentStatus: string) => {
    updateListing.mutate({ id, updates: { status: currentStatus === "active" ? "paused" : "active" } });
  };

  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "User";
  const roleLabel = (() => {
    if (role === "admin") return "Admin";
    if (role === "seller_landlord" || bioType === "seller") return "Seller / Landlord";
    if (role === "agent" || bioType === "agent") return "Agent";
    if (role === "professional" || bioType === "professional") return "Professional";
    if (role === "developer" || bioType === "developer") return "Developer";
    if (bioType === "buyer") return "Buyer / Renter";
    return "Buyer / Renter";
  })();

  const isInvestorLike = false;
  const isSellSide = role === "agent" || role === "developer";
  const isSellerLike = role === "seller_landlord" || bioType === "seller" || isSellSide;
  const upcomingViewingsCount = viewings.filter((v: any) => v.status === "confirmed" || v.status === "pending").length;
  const ownViewingsCount = ownViewings.filter((v: any) => v.status === "confirmed" || v.status === "pending").length;
  const pendingLeadsCount = (leads as any[]).filter(l => l.status === "pending").length;

  const statsByType: Record<string, { label: string; value: number; icon: React.ElementType; color: string }[]> = {
    buyer:         [{ label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Auction Alerts", value: auctionAlerts.filter((a: any) => a.active).length, icon: Gavel, color: "text-brand-gold" }],
    seller:        [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    agent:         [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    developer:     [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    professional:  [{ label: "Services", value: professionalServices.length, icon: Wrench, color: "text-primary" }, { label: "Pending Leads", value: pendingLeadsCount, icon: Briefcase, color: "text-brand-gold" }, { label: "Total Leads", value: (leads as any[]).length, icon: Users, color: "text-primary" }],
    admin:         [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
  };
  const statsKey = bioType ?? (role === "admin" ? "admin" : role === "seller_landlord" ? "seller" : role === "professional" ? "professional" : role === "agent" ? "agent" : role === "developer" ? "developer" : "buyer");
  const stats = statsByType[statsKey] ?? statsByType.buyer;

  const monthStart = startOfCurrentMonth().toISOString();
  const viewingsThisMonthAsRequester = (viewings as any[]).filter((v: any) => v.created_at >= monthStart).length;
  const viewingsThisMonthAsOwner = (ownViewings as any[]).filter((v: any) => v.created_at >= monthStart).length;
  const planUsage = {
    savedSearches: savedSearches.length,
    searchAlerts: (savedSearches as any[]).filter((s: any) => s.email_alerts).length,
    viewingsThisMonth: (bioType === "buyer" || (role === "individual" && !isSellerLike)) ? viewingsThisMonthAsRequester : viewingsThisMonthAsOwner,
    auctionAlerts: auctionAlerts.filter((a: any) => a.active).length,
    listings: myListings.length,
  };
  const showPlanCard = ["buyer", "seller", "agent", "developer", "professional"].includes(bioType ?? "") || role === "seller_landlord";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 flex">
        {/* Sidebar — desktop */}
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
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 font-semibold">⏳ Pending</span>
                      : null}
                </div>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              "href" in item && item.href ? (
                <Link key={item.key} to={item.href}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
                    "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              ) : (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
                    activeSection === item.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                  {item.key === "leads" && pendingLeadsCount > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-brand-gold text-background rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{pendingLeadsCount}</span>
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
              "href" in item && item.href ? (
                <Link key={item.key} to={item.href}
                  className="flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold transition-colors whitespace-nowrap min-w-[56px] relative text-muted-foreground hover:text-foreground">
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              ) : (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={cn("flex flex-col items-center justify-center gap-0.5 px-3.5 text-[9px] font-semibold transition-colors whitespace-nowrap min-w-[56px] relative",
                    activeSection === item.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                  )}>
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
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

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {activeSection === "overview" && navItems.some(i => i.key === "overview") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold">Good morning, {displayName} 👋</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {isInvestorLike ? "Your investment pipeline and deal opportunities." :
                     bioType === "developer" ? "Manage your project listings and showcases." :
                     role === "seller_landlord" || bioType === "seller" ? "Manage your listings and viewings." :
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
                {!isInvestorLike && !isSellerLike && (role === "individual" || bioType === "buyer") && (
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
              {isInvestorLike && !(role === "admin") && (
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
              {(role === "individual" || bioType === "buyer") && !isInvestorLike && !isSellerLike && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="glass-card rounded-xl p-6 border border-destructive/20">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-destructive" /> Quick Sale™ Access</h2>
                      <p className="text-sm text-muted-foreground mb-3">
                        {invitationRequestStatus === "pending" && "Your application for Quick Sale™ deal access is under review. We'll notify you within 48 hours."}
                        {invitationRequestStatus === "approved" && "You have access to the Quick Sale™ deal flow. View exclusive off-market opportunities."}
                        {invitationRequestStatus === "rejected" && "Your application was not approved. You may browse auctions and saved searches."}
                        {invitationRequestStatus === "none" && "Apply for access to exclusive Quick Sale™ deals. Invitation-only."}
                      </p>
                      {invitationRequestStatus === "approved" ? (
                        <Button size="sm" className="bg-gradient-gold border-0 text-background" asChild><Link to="/investor-dashboard">Open Deal Flow</Link></Button>
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
                          await supabase.from("profiles").update({ investor_mode: true }).eq("user_id", user?.id);
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
                    <ProfileCompletionCard bioType={bioType} profile={profile} />
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
                      <p className="text-sm text-muted-foreground mb-3">{(leads as any[]).length > 0 ? `${(leads as any[]).length} total request(s).` : "Client consultation and callback requests will appear here."}</p>
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
                  <ProfileCompletionCard bioType="professional" profile={profile} />
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
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="font-display text-2xl font-bold">My Listings</h1>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                  <Link to="/listings/new"><Plus className="w-4 h-4" /> Create Listing</Link>
                </Button>
              </div>
              {(role === "agent" || role === "seller_landlord") && myListings.some((l: any) => l.is_off_market || l.is_pre_sale) && (
                <div className="flex gap-2 flex-wrap text-xs">
                  {[
                    { key: "all", label: `All (${myListings.length})` },
                    { key: "off_market", label: `🔒 Off-market (${myListings.filter((l:any) => l.is_off_market).length})` },
                    { key: "pre_sale",  label: `🏗️ Pre-sale (${myListings.filter((l:any) => l.is_pre_sale).length})` },
                  ].map(f => (
                    <button key={f.key}
                      onClick={() => setListingFilter(f.key as any)}
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
                  {(listingFilter === "off_market" ? myListings.filter((l:any) => l.is_off_market)
                    : listingFilter === "pre_sale" ? myListings.filter((l:any) => l.is_pre_sale)
                    : myListings
                  ).map((l: any) => (
                    <div key={l.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                      <img src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&q=60"} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{l.title}</p>
                          {l.is_featured && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30">⭐ Featured</span>}
                          {(l.tags || []).includes("exclusive") && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">Exclusive</span>}
                          {l.is_off_market && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">🔒 Off-market</span>}
                          {l.is_pre_sale && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">🏗️ Pre-sale</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{l.city} · €{Number(l.price).toLocaleString()} · {l.sqm}m²</p>
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
                              title="Priority 0–10"
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
            <Suspense fallback={TAB_FALLBACK}>
              <SavedSearchesTab />
            </Suspense>
          )}

          {/* ── VIEWINGS ─────────────────────────────────────────────────── */}
          {activeSection === "viewings" && navItems.some(i => i.key === "viewings") && (
            <Suspense fallback={TAB_FALLBACK}>
              <ViewingsTab />
            </Suspense>
          )}

          {/* ── AUCTION ALERTS ───────────────────────────────────────────── */}
          {activeSection === "auctions" && navItems.some(i => i.key === "auctions") && (
            <Suspense fallback={TAB_FALLBACK}>
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
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                  <FolderKanban className="w-6 h-6 text-primary" /> Booking &amp; Calendar
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Your consultations and scheduled viewings in one place.</p>
              </div>
              <BookingCalendarSection
                viewings={ownViewings}
                leads={leads as any[]}
                onGoToLeads={() => setActiveSection("leads")}
                onGoToViewings={() => setActiveSection("viewings")}
                onGoToServices={() => setActiveSection("services")}
              />
            </div>
          )}

          {/* ── CONTACTS & LEADS CRM ───────────────────────────────────── */}
          {activeSection === "contacts" && navItems.some(i => i.key === "contacts") && (
            <ProGate>
              <ContactsAndLeadsSection initialTab="contacts" />
            </ProGate>
          )}

          {/* ── OPEN HOUSES ─────────────────────────────────────────────── */}
          {activeSection === "open-houses" && navItems.some(i => i.key === "open-houses") && (
            <OpenHouseDashboardSection myListings={myListings} />
          )}

          {/* ── PROJECTS ─────────────────────────────────────────────────── */}
          {activeSection === "projects" && navItems.some(i => i.key === "projects") && (
            <Suspense fallback={TAB_FALLBACK}>
              <ProjectsTab />
            </Suspense>
          )}

          {/* ── PORTFOLIOS ───────────────────────────────────────────────── */}
          {activeSection === "portfolios" && navItems.some(i => i.key === "portfolios") && (
            <Suspense fallback={TAB_FALLBACK}>
              <PortfoliosTab />
            </Suspense>
          )}

          {/* ── ANALYTICS — full analytics dashboard ──────────────────── */}
          {activeSection === "analytics" && navItems.some(i => i.key === "analytics") && (
            <Suspense fallback={TAB_FALLBACK}>
              <AnalyticsTab />
            </Suspense>
          )}

          {/* ── BILLING ──────────────────────────────────────────────── */}
          {activeSection === "billing" && navItems.some(i => i.key === "billing") && (
            <Suspense fallback={TAB_FALLBACK}>
              <BillingTab />
            </Suspense>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────── */}
          {activeSection === "settings" && navItems.some(i => i.key === "settings") && (
            <SettingsSection roleLabel={roleLabel} onUpdate={updateProfile} refreshProfile={refreshProfile} />
          )}

        </main>
      </div>

    </div>
  );
}

// ── Booking / Calendar section (professional) ───────────────────────────────────
function BookingCalendarSection({
  viewings,
  leads,
  onGoToLeads,
  onGoToViewings,
  onGoToServices,
}: {
  viewings: any[];
  leads: any[];
  onGoToLeads: () => void;
  onGoToViewings: () => void;
  onGoToServices: () => void;
}) {
  type AgendaItem = { type: "viewing"; date: string; item: any } | { type: "lead"; date: string; item: any };
  const items: AgendaItem[] = [
    ...viewings
      .filter((v: any) => v.scheduled_at && ["pending", "confirmed"].includes(v.status))
      .map((v: any) => ({ type: "viewing" as const, date: new Date(v.scheduled_at).toISOString().split("T")[0], item: v })),
    ...leads
      .filter((l: any) => l.preferred_date && ["pending", "reviewed", "confirmed"].includes(l.status))
      .map((l: any) => ({ type: "lead" as const, date: l.preferred_date, item: l })),
  ];
  const byDate = items.reduce((acc: Record<string, AgendaItem[]>, it) => {
    if (!acc[it.date]) acc[it.date] = [];
    acc[it.date].push(it);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="border-primary/40 text-primary" onClick={onGoToLeads}>
          View Leads
        </Button>
        <Button variant="outline" size="sm" className="border-border" onClick={onGoToViewings}>
          View Viewings
        </Button>
        <Button variant="outline" size="sm" className="border-border" onClick={onGoToServices}>
          Set Availability
        </Button>
      </div>
      {sortedDates.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No scheduled items</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Consultation requests and viewings will appear here when scheduled.</p>
          <Button variant="outline" className="border-primary/40 text-primary" onClick={onGoToLeads}>
            View Leads
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateStr) => (
            <div key={dateStr}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {new Date(dateStr).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
              <div className="space-y-2">
                {byDate[dateStr].map((it, idx) => (
                  <div key={`${it.type}-${it.item.id}-${idx}`} className="glass-card rounded-xl p-4 flex items-center gap-4">
                    {it.type === "viewing" ? (
                      <>
                        <div className="w-2 h-10 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{it.item.listings?.title || "Viewing"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(it.item.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {it.item.viewing_type === "video" ? "Video" : "In-person"}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${it.item.status === "confirmed" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-brand-gold/20 text-brand-gold"}`}>{it.item.status}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-10 rounded-full bg-brand-gold shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{it.item.requester_name}</p>
                          <p className="text-xs text-muted-foreground">{it.item.service || "Consultation"} · {it.item.request_type}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block capitalize ${LEAD_STATUS_COLORS[it.item.status] ?? "bg-secondary text-muted-foreground"}`}>{it.item.status}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Buyer Open Houses card (with Pro-gating for AI insights) ─────────────────────
function BuyerOpenHousesCard({ onOpen }: { onOpen: () => void }) {
  const { isPro } = useSubscription();
  return (
    <div className="glass-card rounded-xl border border-brand-emerald/20 bg-brand-emerald/5 md:col-span-2 overflow-hidden">
      <div className="p-6">
        <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-emerald" /> Open Houses
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Attend curated property open houses. Register and attend in person or virtually.
        </p>

        {/* Pro-gated AI features preview */}
        <div className="relative mb-4">
          <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2 transition-all", !isPro && "blur-sm pointer-events-none select-none")}>
            {[
              { label: "AI Price Insight", value: "Market −8%", color: "text-brand-emerald" },
              { label: "Similar Deals", value: "4 nearby", color: "text-primary" },
              { label: "Predicted ROI", value: "6.2% / yr", color: "text-brand-gold" },
            ].map(item => (
              <div key={item.label} className="glass-card rounded-lg p-3 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                <p className={cn("font-display text-base font-bold mt-0.5", item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
          {!isPro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/60 backdrop-blur-[2px]">
              <Lock className="w-5 h-5 text-primary" />
              <p className="text-xs font-semibold text-center px-2">AI insights require Pro</p>
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground h-7 px-3 text-xs gap-1.5" asChild>
                <Link to="/pricing"><Zap className="w-3 h-3" /> Upgrade to Pro</Link>
              </Button>
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" className="border-brand-emerald/40 text-brand-emerald hover:bg-brand-emerald/10 gap-1.5" onClick={onOpen}>
          <ExternalLink className="w-3.5 h-3.5" /> Browse Open Houses
        </Button>
      </div>
    </div>
  );
}

// ── Professional profile completion score card ───────────────────────────────────
function ProfessionalProfileCompletion({ myProfessional, onGoToProfile, onGoToServices }: {
  myProfessional?: any;
  onGoToProfile?: () => void;
  onGoToServices?: () => void;
}) {
  const { data: availability = [] } = useProfessionalAvailability(myProfessional?.id ?? "");
  const hasAvailability = availability.length > 0;

  const fields = [
    { key: "photo",        label: "Profile photo",       done: !!myProfessional?.avatar_url,                         hint: "3× more profile views",   action: "profile" },
    { key: "bio",          label: "Bio / About",          done: !!(myProfessional?.bio && myProfessional.bio.length > 20), hint: "Builds trust with clients", action: "profile" },
    { key: "rate",         label: "Hourly rate",          done: !!myProfessional?.hourly_rate,                        hint: "Clients need pricing info",action: "profile" },
    { key: "specialties",  label: "Specialties",          done: (myProfessional?.specialties?.length ?? 0) > 0,       hint: "Appear in filtered searches", action: "profile" },
    { key: "availability", label: "Availability schedule",done: hasAvailability,                                      hint: "Enable direct booking",    action: "services" },
  ];

  const completedCount = fields.filter(f => f.done).length;
  const score = Math.round((completedCount / fields.length) * 100);
  const isComplete = score === 100;

  return (
    <div className={cn(
      "glass-card rounded-xl p-5 border",
      isComplete ? "border-brand-emerald/30 bg-brand-emerald/5" : "border-brand-gold/20 bg-brand-gold/5"
    )}>
      {/* Header + score */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {isComplete
            ? <><CheckCircle2 className="w-4 h-4 text-brand-emerald" /> Profile Complete!</>
            : <><AlertCircle className="w-4 h-4 text-brand-gold" /> Profile Completion</>
          }
        </h3>
        <span className={cn("font-display text-lg font-bold", isComplete ? "text-brand-emerald" : score >= 60 ? "text-brand-gold" : "text-destructive")}>
          {score}%
        </span>
      </div>

      {/* Progress bar */}
      <Progress
        value={score}
        className={cn("h-2 mb-4", isComplete ? "[&>div]:bg-brand-emerald" : score >= 60 ? "[&>div]:bg-brand-gold" : "[&>div]:bg-destructive")}
      />

      {/* Field checklist with edit shortcuts */}
      <ul className="space-y-2">
        {fields.map(f => (
          <li key={f.key} className="flex items-center gap-3 text-sm">
            {f.done
              ? <CheckCircle2 className="w-4 h-4 text-brand-emerald shrink-0" />
              : <AlertCircle className="w-4 h-4 text-brand-gold shrink-0" />
            }
            <span className={cn("flex-1 truncate", f.done ? "text-muted-foreground line-through" : "text-foreground")}>{f.label}</span>
            {!f.done && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline truncate max-w-[140px]">{f.hint}</span>
            )}
            {!f.done && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] font-semibold text-primary border border-primary/20 hover:bg-primary/10 shrink-0"
                onClick={f.action === "services" ? onGoToServices : onGoToProfile}
              >
                <Edit2 className="w-3 h-3 mr-1" /> Fix
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isComplete && (
        <p className="text-xs text-brand-emerald mt-3">
          🎉 You're fully optimised — your profile appears prominently in client searches.
        </p>
      )}
    </div>
  );
}

// ── Analytics section (listing trends, lead funnel, conversion) ─────────────────
function AnalyticsSection({
  myListings,
  leads,
  role,
  listingsLoading,
  viewTrends = [],
  leadFunnel,
  myProfessional,
  onGoToProfile,
  onGoToServices,
}: {
  myListings: any[];
  leads: any[];
  role: string;
  listingsLoading: boolean;
  viewTrends?: { date: string; count: number }[];
  leadFunnel?: { pending: number; reviewed: number; confirmed: number; cancelled: number; total: number; conversionRate?: number };
  myProfessional?: any;
  onGoToProfile?: () => void;
  onGoToServices?: () => void;
}) {
  const totalViews = myListings.reduce((s, l) => s + (l.views_count || 0), 0);
  const activeCount = myListings.filter(l => l.status === "active").length;
  const pendingLeads = leads.filter(l => l.status === "pending").length;
  const totalLeads = leads.length;
  const maxTrendCount = Math.max(1, ...viewTrends.map(t => t.count));

  const stats: { label: string; value: number; color: string }[] = role === "professional" ? [
    { label: "Total Leads", value: totalLeads, color: "text-primary" },
    { label: "Pending Leads", value: pendingLeads, color: "text-brand-gold" },
    { label: "Confirmed", value: leadFunnel?.confirmed ?? 0, color: "text-brand-emerald" },
    { label: "Conversion Rate", value: leadFunnel?.conversionRate ?? 0, color: "text-brand-emerald" },
  ] : [
    { label: "Active Listings", value: activeCount, color: "text-primary" },
    { label: "Total Views", value: totalViews, color: "text-brand-emerald" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" /> Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === "professional" ? "Visibility, lead funnel & conversion KPIs." : "Listing performance & view trends."}
          </p>
        </div>
        {role !== "professional" && (
          <Button variant="outline" className="border-border gap-2" asChild>
            <Link to="/listings"><Search className="w-4 h-4" /> Browse Listings</Link>
          </Button>
        )}
      </div>

      {listingsLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="glass-card rounded-xl p-4">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <div className={cn("font-display text-2xl font-bold mt-1", s.color)}>
                  {s.label.includes("Conversion") ? `${s.value}%` : s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Lead funnel (professionals) */}
          {role === "professional" && leadFunnel && leadFunnel.total > 0 && (
            <div>
              <h2 className="font-display font-semibold mb-3">Lead Funnel</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "pending", label: "Pending", count: leadFunnel.pending, color: "bg-brand-gold/20 text-brand-gold border-brand-gold/30" },
                  { key: "reviewed", label: "Reviewed", count: leadFunnel.reviewed, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                  { key: "confirmed", label: "Confirmed", count: leadFunnel.confirmed, color: "bg-brand-emerald/20 text-brand-emerald border-brand-emerald/30" },
                  { key: "cancelled", label: "Cancelled", count: leadFunnel.cancelled, color: "bg-muted text-muted-foreground border-border" },
                ].map(({ key, label, count, color }) => (
                  <div key={key} className={cn("glass-card rounded-xl p-3 border", color)}>
                    <span className="text-xs font-medium">{label}</span>
                    <div className="font-display text-xl font-bold mt-0.5">{count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visibility & KPI breakdown (professionals — always show) */}
          {role === "professional" && (
            <div className="space-y-4">
              <h2 className="font-display font-semibold">Profile Visibility & KPIs</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Profile Views</p>
                  <p className="font-display text-2xl font-bold text-primary">{myProfessional?.projects_count ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Clients who viewed your profile</p>
                </div>
                <div className="glass-card rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Avg. Rating</p>
                  <p className="font-display text-2xl font-bold text-brand-gold">{myProfessional?.rating ? Number(myProfessional.rating).toFixed(1) : "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">{myProfessional?.reviews_count ?? 0} review(s) from clients</p>
                </div>
                <div className="glass-card rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Conversion Rate</p>
                  <p className="font-display text-2xl font-bold text-brand-emerald">{leadFunnel?.conversionRate ?? 0}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Leads that became confirmed</p>
                </div>
              </div>
              <ProfessionalProfileCompletion myProfessional={myProfessional} onGoToProfile={onGoToProfile} onGoToServices={onGoToServices} />
            </div>
          )}

          {/* View trends (sellers/agents/developers) */}
          {role !== "professional" && viewTrends.length > 0 && (
            <div>
              <h2 className="font-display font-semibold mb-3">Views (last 14 days)</h2>
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-end gap-1 h-24">
                  {viewTrends.map((t) => (
                    <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${t.count} views`}>
                      <div
                        className="w-full min-w-[4px] rounded-t bg-primary/60 transition-all hover:bg-primary"
                        style={{ height: `${Math.max(4, (t.count / maxTrendCount) * 80)}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                        {new Date(t.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {myListings.length > 0 && (
            <div>
              <h2 className="font-display font-semibold mb-4">Listing Performance</h2>
              <div className="space-y-2">
                {myListings.slice(0, 10).map(l => (
                  <div key={l.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground">{l.city} · €{Number(l.price).toLocaleString()}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-display text-lg font-bold text-brand-emerald">{l.views_count ?? 0}</span>
                      <span className="text-xs text-muted-foreground block">views</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {role !== "professional" && myListings.length === 0 && (
            <div className="glass-card rounded-xl p-10 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No listing data yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create listings to see performance analytics here.</p>
              <Button variant="outline" className="border-border mt-4" asChild>
                <Link to="/listings/new">Create Listing</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Professional profile editor ─────────────────────────────────────────────────
function ProfessionalProfileEditor({ onSwitchToSettings }: { onSwitchToSettings?: () => void }) {
  const { data: pro, isLoading } = useMyProfessional();
  const updatePro = useUpdateProfessional();
  const [form, setForm] = useState({
    title: "", bio: "", city: "", hourly_rate: "", license_number: "",
    experience_years: "", website_url: "", specialties: "", languages: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pro) {
      setForm({
        title: pro.title || "",
        bio: pro.bio || "",
        city: pro.city || "",
        hourly_rate: pro.hourly_rate ? String(pro.hourly_rate) : "",
        license_number: pro.license_number || "",
        experience_years: pro.experience_years ? String(pro.experience_years) : "",
        website_url: pro.website_url || "",
        specialties: Array.isArray(pro.specialties) ? pro.specialties.join(", ") : "",
        languages: Array.isArray(pro.languages) ? pro.languages.join(", ") : "",
      });
    }
  }, [pro]);

  const handleSave = async () => {
    if (!pro) return;
    setSaving(true);
    await updatePro.mutateAsync({
      id: pro.id,
      updates: {
        title: form.title || pro.title,
        bio: form.bio || null,
        city: form.city || null,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        license_number: form.license_number || null,
        experience_years: form.experience_years ? parseInt(form.experience_years, 10) : null,
        website_url: form.website_url || null,
        specialties: form.specialties ? form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
        languages: form.languages ? form.languages.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      },
    });
    setSaving(false);
  };

  if (isLoading || !pro) {
    return (
      <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
    );
  }

  const rating = Number(pro.rating) || 0;
  const reviewsCount = pro.reviews_count || 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Professional Profile</h1>
        <Button variant="outline" size="sm" asChild><Link to={`/professionals/${pro.id}`}>View public profile</Link></Button>
      </div>

      {/* Professional details — match ProfessionalProfile page */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profile details</h2>
        {[
          ["Professional Title", "title", "e.g. Licensed Architect"],
          ["City", "city", "e.g. Athens"],
          ["Bio / About", "bio", "Brief description for clients", "textarea"],
          ["Hourly Rate (€)", "hourly_rate", "e.g. 80", "number"],
          ["License Number", "license_number", ""],
          ["Years of Experience", "experience_years", "e.g. 10", "number"],
          ["Specialties (comma-separated)", "specialties", "e.g. Renovation, Permits"],
          ["Languages (comma-separated)", "languages", "e.g. English, Greek"],
          ["Website URL", "website_url", "https://..."],
        ].map(([label, key, placeholder, type]) => (
          <div key={key}>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
            {type === "textarea" ? (
              <textarea value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={4}
                placeholder={placeholder} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            ) : (
              <input type={type || "text"} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
            )}
          </div>
        ))}
        {onSwitchToSettings && (
          <p className="text-xs text-muted-foreground">To change participant type, go to <button type="button" onClick={onSwitchToSettings} className="text-primary hover:underline">Settings</button> → Switch Participant Type.</p>
        )}
        <Button className="bg-gradient-primary border-0 text-primary-foreground w-full" disabled={saving} onClick={handleSave}>
          {saving || updatePro.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>

      {/* Reviews section */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">Reviews</h2>
        <div className="flex items-start gap-6">
          <div className="text-center shrink-0">
            <div className="font-display text-4xl font-bold text-brand-gold">{rating > 0 ? rating.toFixed(1) : "—"}</div>
            <div className="flex gap-0.5 justify-center mt-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`w-4 h-4 ${i <= Math.floor(rating) ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`} />
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{reviewsCount} review{reviewsCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {reviewsCount > 0 ? "Client reviews from completed consultations appear here." : "Reviews from clients will appear here once you complete consultations."}
            </p>
            <Button variant="outline" size="sm" className="mt-3 border-border" asChild>
              <Link to={`/professionals/${pro.id}`}>View your public profile</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Profile editor ─────────────────────────────────────────────────────────────
function ProfileEditor({ profile, onUpdate, onSwitchToSettings }: { profile: any; onUpdate: any; onSwitchToSettings?: () => void }) {
  const [form, setForm] = useState({
    display_name: profile?.display_name || "",
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    phone: profile?.phone || "",
    city: profile?.city || "",
    website_url: profile?.website_url || "",
    video_link: profile?.video_link || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await onUpdate(form);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated!");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl font-bold">Edit Profile</h1>
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[["First Name", "first_name"], ["Last Name", "last_name"]].map(([label, key]) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors" />
            </div>
          ))}
        </div>
        {[["Display Name", "display_name"], ["Phone", "phone"], ["City", "city"], ["Website", "website_url"], ["Video call link (Zoom, Whereby…)", "video_link"]].map(([label, key]) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
            <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors" />
          </div>
        ))}
        {onSwitchToSettings && (
          <p className="text-xs text-muted-foreground">
            To change your participant type (buyer, seller, agent, etc.), go to{" "}
            <button type="button" onClick={onSwitchToSettings} className="text-primary hover:underline font-medium">Settings</button> and use &quot;Switch Participant Type&quot;.
          </p>
        )}
        <Button className="bg-gradient-primary border-0 text-primary-foreground w-full" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}


const ROLE_PERMISSIONS: Record<string, { label: string; can: string[] }> = {
  buyer_renter:    { label: "Buyer / Renter",   can: ["Browse listings", "Save properties", "Request viewings", "Auction alerts"] },
  seller_landlord: { label: "Seller / Landlord", can: ["Create & manage listings", "Receive viewing requests", "AI listing assist"] },
  agent:           { label: "Agent",            can: ["Unlimited listings", "Lead management", "Analytics"] },
  admin:           { label: "Admin",            can: ["Platform admin", "Subscribers", "Pricing", "OS sync", "All dashboards"] },
  developer:       { label: "Developer",       can: ["Listings", "Projects", "Portfolios", "Analytics"] },
  professional:    { label: "Professional",     can: ["Professional directory", "Service catalog", "Client leads", "Verified badge"] },
};

function toRoleKey(label: string): string {
  return label.toLowerCase().replace(/ \/ /g, "_").replace(/ /g, "_").replace(/\s+/g, "_");
}

function SettingsSection({
  roleLabel,
  onUpdate,
  refreshProfile,
}: {
  roleLabel: string;
  onUpdate: (updates: any) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── SECURITY: clears participant_type + bio tag only; role column handled by onboarding ──
  const handleSwitchRole = async () => {
    setSwitching(true);
    const { error } = await onUpdate({ bio: null, participant_type: null } as any);
    if (error) {
      toast.error("Could not reset participant type: " + error.message);
      setSwitching(false);
      return;
    }
    await refreshProfile();
    setSwitching(false);
    toast.success("Participant type cleared — redirecting to setup…");
    navigate("/onboarding");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      {/* Current account info */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account</h2>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium">Account Type</p>
            <p className="text-xs text-muted-foreground mt-0.5">Shown in sidebar — switch below to change</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {roleLabel}
          </span>
        </div>
      </div>

      {/* What your role can do */}
      {(() => {
        const perm = ROLE_PERMISSIONS[toRoleKey(roleLabel)];
        if (perm) {
          return (
            <div className="glass-card rounded-xl p-5 border border-primary/10">
              <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Your Permissions
              </h2>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                {perm.can.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <div className="glass-card rounded-xl p-5 border border-primary/10">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Your Permissions
            </h2>
            <p className="text-xs text-muted-foreground">
              Your access rights are determined server-side and cannot be changed from here.
            </p>
          </div>
        );
      })()}

      {/* Security notice */}
      <div className="glass-card rounded-xl p-5 border border-brand-gold/20 bg-brand-gold/5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-brand-gold">Security Notice</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Switching your participant type <strong>only changes how your dashboard is organised</strong> — it does not
              affect your actual account permissions or data access rights.
              Those are enforced server-side and cannot be changed from the app.
            </p>
          </div>
        </div>
      </div>

      {/* Switch participant type */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Participant Type</h2>
        <p className="text-sm text-muted-foreground">
          Re-run the setup wizard to reconfigure your dashboard view.
        </p>

        {/* Billing & Access warning */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <span>⚡</span> Before you switch — important billing &amp; access notes
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed list-none">
            <li className="flex items-start gap-2">
              <span className="text-brand-gold shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">Extra charges may apply.</strong> Upgrading to a higher-tier participant type (e.g. Agent, Developer) may activate a paid plan. You will be informed before any charge is made.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">No refunds on downgrade.</strong> If you switch to a lower-tier type mid-billing cycle, the remaining period is non-refundable per our Terms of Service.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-brand-emerald shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">Access rights will change.</strong> Choosing a superior participant type may unlock additional features and data access (e.g. deal flow, leads). Admin features live only at /admin and require platform admin. These are granted server-side upon plan activation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">Pricing adjustment.</strong> After selecting your new type, you will be redirected to the Pricing page to choose or update your plan. Switch does not grant admin — only dashboard layout and feature visibility change.</span>
            </li>
          </ul>
        </div>

        {!confirmOpen ? (
          <Button variant="outline" className="border-border gap-2" onClick={() => setConfirmOpen(true)}>
            <Settings className="w-4 h-4" /> Switch Participant Type
          </Button>
        ) : (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-destructive">Confirm switch</p>
            <p className="text-xs text-muted-foreground">
              Your current setup (<strong>{roleLabel}</strong>) will be cleared and you'll go through onboarding again.
              Your listings, saved properties, and messages won't be affected. By proceeding you acknowledge the billing &amp; access notes above.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-border" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-destructive/90 border-0 text-destructive-foreground hover:bg-destructive gap-2"
                disabled={switching}
                onClick={handleSwitchRole}
              >
                {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                I understand — switch my type
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
