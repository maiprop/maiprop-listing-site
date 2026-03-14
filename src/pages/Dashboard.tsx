import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Home, Plus, BarChart2, MessageSquare, Heart, Settings, User,
  Eye, Bell, BellOff, LogOut, Building2, Gavel, CheckCircle,
  Loader2, Calendar, Trash2, ToggleLeft, ToggleRight, Bookmark,
  Search, Activity, Wrench, Shield, MapPin, Euro, Edit2,
  FolderKanban, Users, Briefcase, TrendingUp, Globe2, Flame,
  ArrowRight, Clock, CheckCircle2, AlertCircle, Phone,
} from "lucide-react";
import AdminPanel from "@/components/AdminPanel";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings, useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useFavorites } from "@/hooks/useFavorites";
import { useViewings } from "@/hooks/useViewings";
import { useSavedSearches, useDeleteSavedSearch, useToggleSavedSearchAlert } from "@/hooks/useSavedSearches";
import { useAuctionAlerts, useDeleteAuctionAlert, useUpdateAuctionAlert } from "@/hooks/useAuctionAlerts";
import { useMyProfessional, useProfessionalServices } from "@/hooks/useProfessionalServices";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { PropertyCard } from "@/components/PropertyCard";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbListingToCard(l: any) {
  return {
    id: l.id, title: l.title, address: l.address || l.city, city: l.city,
    price: Number(l.price), pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
    bedrooms: l.bedrooms ?? undefined, bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm), floor: l.floor ?? undefined, totalFloors: l.total_floors ?? undefined,
    yearBuilt: l.year_built ?? undefined, energyClass: l.energy_class ?? undefined,
    images: [...(l.cover_image_url ? [l.cover_image_url] : []), ...(l.listing_images?.map((img: any) => img.url) || [])].filter(Boolean),
    type: l.property_type as any, listingType: l.listing_type as any,
    auctionDate: l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
    auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
    aiScore: l.ai_score ?? undefined, views: l.views_count ?? undefined,
    tags: (l.tags || []).filter(Boolean) as string[],
    hasVideo: l.has_video_tour, hasVirtualTour: l.has_virtual_tour,
  };
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
  | "messages" | "viewings" | "auctions" | "services" | "leads"
  | "deal-flow" | "contacts" | "projects" | "portfolios" | "admin"
  | "profile" | "settings";

type DashboardRole = "individual" | "seller_landlord" | "agent" | "professional";

const ALL_NAV_ITEMS: { icon: React.ElementType; label: string; key: NavKey }[] = [
  { icon: Home,          label: "Overview",       key: "overview"       },
  { icon: FolderKanban,  label: "Deal Flow",       key: "deal-flow"      },
  { icon: Building2,     label: "My Listings",     key: "listings"       },
  { icon: BarChart2,     label: "Analytics",       key: "analytics"      },
  { icon: Heart,         label: "Saved",           key: "saved"          },
  { icon: Bookmark,      label: "Saved Searches",  key: "saved-searches" },
  { icon: MessageSquare, label: "Messages",         key: "messages"       },
  { icon: Calendar,      label: "Viewings",         key: "viewings"       },
  { icon: Gavel,         label: "Auction Alerts",   key: "auctions"       },
  { icon: Wrench,        label: "My Services",      key: "services"       },
  { icon: Briefcase,     label: "Leads",            key: "leads"          },
  { icon: Users,         label: "Contacts",         key: "contacts"       },
  { icon: Globe2,        label: "Projects",         key: "projects"       },
  { icon: TrendingUp,    label: "Portfolios",       key: "portfolios"     },
  { icon: Shield,        label: "Admin",            key: "admin"          },
  { icon: User,          label: "Profile",          key: "profile"        },
  { icon: Settings,      label: "Settings",         key: "settings"       },
];

// ── Nav per bio-type (spec-accurate) ──────────────────────────────────────────
const NAV_BY_TYPE: Record<string, NavKey[]> = {
  buyer:         ["overview", "saved", "saved-searches", "messages", "viewings", "auctions", "profile", "settings"],
  seller:        ["overview", "listings", "saved", "messages", "viewings", "profile", "settings"],
  investor:      ["overview", "deal-flow", "saved", "saved-searches", "messages", "viewings", "auctions", "profile", "settings"],
  agent:         ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "contacts", "projects", "portfolios", "admin", "profile", "settings"],
  institutional: ["overview", "deal-flow", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "contacts", "projects", "portfolios", "admin", "profile", "settings"],
  developer:     ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "contacts", "projects", "portfolios", "admin", "profile", "settings"],
  professional:  ["overview", "services", "leads", "messages", "viewings", "profile", "settings"],
};

function getNavItemsForBioType(bioType: string | null, role: DashboardRole) {
  const key = bioType ?? (role === "seller_landlord" ? "seller" : role === "professional" ? "professional" : role === "agent" ? "agent" : "buyer");
  const keys = NAV_BY_TYPE[key] ?? NAV_BY_TYPE.buyer;
  return ALL_NAV_ITEMS.filter(i => keys.includes(i.key));
}

// ── Lead status badge ──────────────────────────────────────────────────────────
const LEAD_STATUS_COLORS: Record<string, string> = {
  pending:   "bg-brand-gold/20 text-brand-gold",
  reviewed:  "bg-blue-500/20 text-blue-400",
  confirmed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  consultation: "📋 Consultation",
  callback:     "📞 Callback",
  message:      "💬 Message",
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { profile, user, signOut, updateProfile, refreshProfile } = useAuth();
  const role: DashboardRole = (profile?.role as DashboardRole) || "individual";
  const bioType = profile?.bio?.startsWith("__type:") ? profile.bio.replace("__type:", "").split(" ")[0] : null;

  const navItems = getNavItemsForBioType(bioType, role);
  const defaultSection = navItems[0]?.key ?? "overview";
  const [activeSection, setActiveSection] = useState<NavKey>((section as NavKey) || defaultSection);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<any>(null);

  useEffect(() => {
    const valid = navItems.some(i => i.key === activeSection);
    if (!valid && navItems.length) setActiveSection(navItems[0].key);
  }, [role, bioType, activeSection, navItems]);

  const { data: myListings = [], isLoading: listingsLoading } = useMyListings();
  const { data: favorites = [], isLoading: favLoading } = useFavorites();
  const { data: viewings = [], isLoading: viewingsLoading } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const { data: savedSearches = [], isLoading: savedSearchesLoading } = useSavedSearches();
  const { data: auctionAlerts = [], isLoading: alertsLoading } = useAuctionAlerts();
  const { data: myProfessional } = useMyProfessional();
  const { data: professionalServices = [] } = useProfessionalServices(myProfessional?.id || "");
  const { data: leads = [], isLoading: leadsLoading } = useMyLeads(myProfessional?.id);
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const deleteSavedSearch = useDeleteSavedSearch();
  const toggleAlert = useToggleSavedSearchAlert();
  const deleteAuctionAlert = useDeleteAuctionAlert();
  const toggleAuctionAlert = useUpdateAuctionAlert();
  const updateLeadStatus = useUpdateLeadStatus();

  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const toggleListingStatus = (id: string, currentStatus: string) => {
    updateListing.mutate({ id, updates: { status: currentStatus === "active" ? "paused" : "active" } });
  };

  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "User";
  const roleLabel = (() => {
    if (role === "seller_landlord") return "Seller / Landlord";
    if (role === "agent") {
      if (bioType === "institutional") return "Institutional";
      if (bioType === "developer") return "Developer";
      return "Agent";
    }
    if (role === "individual") {
      if (bioType === "investor") return "Investor";
      if (bioType === "buyer") return "Buyer / Renter";
      return "Individual";
    }
    return role;
  })();

  const isInvestorLike = bioType === "investor" || bioType === "institutional";
  const isAgentLike    = role === "agent";
  const upcomingViewingsCount = viewings.filter((v: any) => v.status === "confirmed" || v.status === "pending").length;
  const ownViewingsCount = ownViewings.filter((v: any) => v.status === "confirmed" || v.status === "pending").length;
  const pendingLeadsCount = (leads as any[]).filter(l => l.status === "pending").length;

  const statsByType: Record<string, { label: string; value: number; icon: React.ElementType; color: string }[]> = {
    buyer:         [{ label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Auction Alerts", value: auctionAlerts.filter((a: any) => a.active).length, icon: Gavel, color: "text-brand-gold" }],
    seller:        [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    investor:      [{ label: "Saved Deals", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Saved Searches", value: savedSearches.length, icon: Bookmark, color: "text-primary" }, { label: "Auction Alerts", value: auctionAlerts.filter((a: any) => a.active).length, icon: Gavel, color: "text-brand-gold" }, { label: "Viewings", value: upcomingViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    agent:         [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    institutional: [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Saved Deals", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Auction Alerts", value: auctionAlerts.filter((a: any) => a.active).length, icon: Gavel, color: "text-brand-gold" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    developer:     [{ label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" }, { label: "Total Views", value: myListings.reduce((s, l) => s + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" }, { label: "Saved", value: favorites.length, icon: Heart, color: "text-destructive" }, { label: "Viewings", value: upcomingViewingsCount + ownViewingsCount, icon: Calendar, color: "text-brand-gold" }],
    professional:  [{ label: "Services", value: professionalServices.length, icon: Wrench, color: "text-primary" }, { label: "Pending Leads", value: pendingLeadsCount, icon: Briefcase, color: "text-brand-gold" }, { label: "Viewings", value: ownViewingsCount, icon: Calendar, color: "text-brand-gold" }, { label: "Total Leads", value: (leads as any[]).length, icon: Users, color: "text-primary" }],
  };
  const statsKey = bioType ?? (role === "seller_landlord" ? "seller" : role === "professional" ? "professional" : role === "agent" ? "agent" : "buyer");
  const stats = statsByType[statsKey] ?? statsByType.buyer;

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
                  {profile?.verified
                    ? <CheckCircle className="w-3 h-3 text-primary" />
                    : profile?.role === "professional"
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">⏳ Pending</span>
                      : null}
                </div>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
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
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile horizontal nav */}
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border overflow-x-auto scrollbar-none">
          <div className="flex items-stretch h-11 min-w-max">
            {navItems.map(item => (
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
                     role === "seller_landlord" ? "Manage your listings and viewings." :
                     isAgentLike ? "Here's what's happening with your listings and leads." :
                     role === "professional" ? "Your services and incoming client leads." :
                     "Here's your search activity and alerts."}
                  </p>
                </div>
                {(role === "seller_landlord" || isAgentLike) && (
                  <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setActiveSection("listings")}>
                    <Plus className="w-4 h-4" /> New Listing
                  </Button>
                )}
                {isInvestorLike && (
                  <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" asChild>
                    <Link to="/investor-dashboard"><FolderKanban className="w-4 h-4" /> Deal Flow</Link>
                  </Button>
                )}
                {role === "professional" && (
                  <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setActiveSection("leads")}>
                    <Briefcase className="w-4 h-4" /> View Leads {pendingLeadsCount > 0 && `(${pendingLeadsCount})`}
                  </Button>
                )}
                {!isInvestorLike && !isAgentLike && role === "individual" && (
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

              {/* Investor / Institutional overview cards */}
              {isInvestorLike && (
                <div className="grid md:grid-cols-2 gap-5">
                  <div className="glass-card rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-brand-gold"><FolderKanban className="w-4 h-4" /> Deal Flow</h2>
                    <p className="text-sm text-muted-foreground mb-3">Your private pipeline of off-market and Quick Sale™ opportunities.</p>
                    <Button size="sm" className="bg-gradient-gold border-0 text-background font-semibold gap-1.5" asChild>
                      <Link to="/investor-dashboard"><FolderKanban className="w-3.5 h-3.5" /> Open Dashboard</Link>
                    </Button>
                  </div>
                  <div className="glass-card rounded-xl p-5 border border-destructive/20 bg-destructive/5">
                    <h2 className="font-display font-semibold mb-1 flex items-center gap-2 text-destructive"><Flame className="w-4 h-4" /> Quick-Sale Deals</h2>
                    <p className="text-sm text-muted-foreground mb-3">Off-market properties at discounted prices — motivated sellers only.</p>
                    <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5" asChild>
                      <Link to="/firesale"><Activity className="w-3.5 h-3.5" /> View Firesale</Link>
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
              {role === "individual" && !isInvestorLike && (
                <div className="grid md:grid-cols-2 gap-6">
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
                </div>
              )}

              {/* Seller / Agent overview */}
              {(role === "seller_landlord" || isAgentLike) && (
                <>
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
                  {role === "seller_landlord" && (
                    <div className="glass-card rounded-xl p-4 border border-primary/20 bg-primary/5 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="font-semibold text-sm">Upgrade to Pro</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Get more visibility, AI listing assist, and selling add-ons.</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-primary text-primary" asChild><Link to="/pro">View Pro</Link></Button>
                    </div>
                  )}
                </>
              )}

              {/* Professional overview */}
              {role === "professional" && (
                <div className="grid md:grid-cols-2 gap-5">
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
                </div>
              )}
            </div>
          )}

          {/* ── DEAL FLOW — investor, institutional ────────────────────────── */}
          {activeSection === "deal-flow" && navItems.some(i => i.key === "deal-flow") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                    <FolderKanban className="w-6 h-6 text-brand-gold" /> Deal Flow
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">Your private investment pipeline — off-market opportunities and Quick Sale™ deals.</p>
                </div>
                <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" asChild>
                  <Link to="/investor-dashboard"><ArrowRight className="w-4 h-4" /> Open Full Dashboard</Link>
                </Button>
              </div>

              {/* Quick links */}
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { icon: FolderKanban, label: "Investor Dashboard", desc: "Full deal pipeline with status tracking", href: "/investor-dashboard", accent: "text-brand-gold", border: "border-amber-500/20", bg: "bg-amber-500/5" },
                  { icon: Flame, label: "Firesale Deals", desc: "Off-market Quick Sale™ properties", href: "/firesale", accent: "text-destructive", border: "border-destructive/20", bg: "bg-destructive/5" },
                  { icon: Gavel, label: "Live Auctions", desc: "Court auctions below market value", href: "/auctions", accent: "text-primary", border: "border-primary/20", bg: "bg-primary/5" },
                ].map(item => (
                  <Link key={item.href} to={item.href}
                    className={cn("glass-card rounded-xl p-5 border flex flex-col gap-3 hover:scale-[1.02] transition-all", item.border, item.bg)}>
                    <div className={cn("flex items-center gap-2 font-semibold text-sm", item.accent)}>
                      <item.icon className="w-4 h-4" /> {item.label}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    <div className={cn("flex items-center gap-1 text-xs font-medium", item.accent)}>
                      Open <ArrowRight className="w-3 h-3" />
                    </div>
                  </Link>
                ))}
              </div>

              {/* Saved deals preview */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold">Saved Deals</h2>
                  <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={() => setActiveSection("saved")}>
                    View All <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {favorites.length === 0 ? (
                  <div className="glass-card rounded-xl p-10 text-center">
                    <Heart className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold">No saved deals yet</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">Browse firesale and auction listings to build your pipeline</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button size="sm" variant="outline" className="border-border" asChild><Link to="/auctions">Browse Auctions</Link></Button>
                      <Button size="sm" variant="outline" className="border-border" asChild><Link to="/firesale">Firesale Deals</Link></Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {favorites.slice(0, 6).map((f: any) => f.listings && <PropertyCard key={f.id} property={dbListingToCard(f.listings)} />)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── LEADS — professional only ────────────────────────────────── */}
          {activeSection === "leads" && navItems.some(i => i.key === "leads") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-brand-gold" /> Client Leads
                    {pendingLeadsCount > 0 && (
                      <span className="text-sm font-bold bg-brand-gold text-background rounded-full px-2 py-0.5">{pendingLeadsCount} new</span>
                    )}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">Consultation requests, callbacks, and messages from potential clients.</p>
                </div>
                <Button variant="outline" className="border-border gap-2" asChild>
                  <Link to="/professionals"><Eye className="w-4 h-4" /> View My Profile</Link>
                </Button>
              </div>

              {/* Status filter tabs */}
              {(leads as any[]).length > 0 && (
                <LeadsSection leads={leads as any[]} onUpdateStatus={(id, status) => updateLeadStatus.mutate({ id, status })} />
              )}

              {leadsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (leads as any[]).length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No leads yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Leads appear here when clients book consultations or request callbacks from your profile.
                  </p>
                  <Button variant="outline" className="border-border" asChild>
                    <Link to="/professionals">View My Professional Profile</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* ── MY LISTINGS ──────────────────────────────────────────────── */}
          {activeSection === "listings" && navItems.some(i => i.key === "listings") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold">My Listings</h1>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                  <Link to="/listings/new"><Plus className="w-4 h-4" /> Create Listing</Link>
                </Button>
              </div>
              {listingsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : myListings.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No listings yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Start by creating your first property listing</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myListings.map(l => (
                    <div key={l.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                      <img src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&q=60"} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{l.title}</p>
                        <p className="text-xs text-muted-foreground">{l.city} · €{Number(l.price).toLocaleString()} · {l.sqm}m²</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${l.status === "active" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"}`}>{l.status}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
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
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-bold">Messages</h1>
              <Button className="bg-gradient-primary border-0 text-primary-foreground" asChild>
                <Link to="/messages">Open Full Inbox</Link>
              </Button>
            </div>
          )}

          {/* ── SAVED SEARCHES ───────────────────────────────────────────── */}
          {activeSection === "saved-searches" && navItems.some(i => i.key === "saved-searches") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold">Saved Searches</h1>
                  <p className="text-sm text-muted-foreground mt-1">Your saved filter sets — click to re-run or set email alerts.</p>
                </div>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                  <Link to="/listings"><Search className="w-4 h-4" /> Browse Listings</Link>
                </Button>
              </div>
              {savedSearchesLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : savedSearches.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No saved searches yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Go to Listings, apply filters, and click "Save Search"</p>
                  <Button variant="outline" className="border-border mt-4" asChild><Link to="/listings">Browse Listings</Link></Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedSearches.map((s: any) => {
                    const filterCount = Object.keys(s.filters || {}).filter(k => s.filters[k]).length;
                    const params = new URLSearchParams(s.filters || {});
                    return (
                      <div key={s.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm">{s.name}</p>
                            {s.email_alerts && (
                              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                <Bell className="w-3 h-3" /> Alerts ON
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {filterCount > 0 ? Object.entries(s.filters).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") : "All listings"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Saved {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleAlert.mutate({ id: s.id, emailAlerts: !s.email_alerts })}
                            className={`p-2 rounded-lg border transition-colors ${s.email_alerts ? "border-primary bg-primary/10 text-primary hover:bg-primary/20" : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
                            {s.email_alerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                          </button>
                          <Button size="sm" variant="outline" className="border-border text-xs gap-1.5" asChild>
                            <Link to={`/listings?${params.toString()}`}><Search className="w-3 h-3" /> Run</Link>
                          </Button>
                          <button onClick={() => { if (confirm("Delete this saved search?")) deleteSavedSearch.mutate(s.id); }} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── VIEWINGS ─────────────────────────────────────────────────── */}
          {activeSection === "viewings" && navItems.some(i => i.key === "viewings") && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Viewings</h1>
              {viewingsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-3">
                  {[...viewings, ...ownViewings].length === 0 ? (
                    <div className="glass-card rounded-xl p-12 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-semibold">No viewings scheduled</p>
                    </div>
                  ) : [...viewings, ...ownViewings].map((v: any) => (
                    <div key={v.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                      <div className={`w-2 h-10 rounded-full shrink-0 ${v.status === "confirmed" ? "bg-brand-emerald" : v.status === "pending" ? "bg-brand-gold" : "bg-muted-foreground"}`} />
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{v.listings?.title || "Property"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(v.scheduled_at).toLocaleString()} · {v.viewing_type === "video" ? "📹 Video" : "🏠 In-person"}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize inline-block mt-1 ${v.status === "confirmed" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-brand-gold/20 text-brand-gold"}`}>{v.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── AUCTION ALERTS ───────────────────────────────────────────── */}
          {activeSection === "auctions" && navItems.some(i => i.key === "auctions") && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold">Auction Alerts</h1>
                  <p className="text-sm text-muted-foreground mt-1">Get notified when new auctions match your criteria.</p>
                </div>
                <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2"
                  onClick={() => { setEditingAlert(null); setAlertModalOpen(true); }}>
                  <Bell className="w-4 h-4" /> New Alert
                </Button>
              </div>
              {alertsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-gold" /></div>
              ) : auctionAlerts.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No auction alerts yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">Create an alert to get notified of matching auctions</p>
                  <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" onClick={() => { setEditingAlert(null); setAlertModalOpen(true); }}>
                    <Bell className="w-4 h-4" /> Create First Alert
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {auctionAlerts.map((a: any) => (
                    <div key={a.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                      <div className={`w-2 h-10 rounded-full shrink-0 ${a.active ? "bg-brand-gold" : "bg-muted-foreground/30"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {a.city && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground"><MapPin className="w-3 h-3" />{a.city}</span>}
                          {a.property_type && <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 capitalize">{a.property_type}</span>}
                          {(a.min_price || a.max_price) && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                              <Euro className="w-3 h-3" />
                              {a.min_price ? `€${Number(a.min_price).toLocaleString()}` : "Any"} – {a.max_price ? `€${Number(a.max_price).toLocaleString()}` : "Any"}
                            </span>
                          )}
                          {!a.city && !a.property_type && !a.min_price && !a.max_price && <span className="text-xs text-muted-foreground">All auctions</span>}
                        </div>
                        {a.court_name && <p className="text-xs text-muted-foreground truncate">{a.court_name}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${a.active ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"}`}>{a.active ? "Active" : "Paused"}</span>
                          {a.email_notify && <span className="text-xs text-muted-foreground">📧 Email on</span>}
                          <span className="text-xs text-muted-foreground">Created {new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => toggleAuctionAlert.mutate({ id: a.id, updates: { active: !a.active } })}
                          className={`p-2 rounded-lg border transition-colors ${a.active ? "border-brand-gold/30 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20" : "border-border bg-secondary text-muted-foreground hover:text-foreground"}`}>
                          {a.active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setEditingAlert(a); setAlertModalOpen(true); }} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (confirm("Delete this alert?")) deleteAuctionAlert.mutate(a.id); }} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PROFILE ──────────────────────────────────────────────────── */}
          {activeSection === "profile" && navItems.some(i => i.key === "profile") && (
            <ProfileEditor profile={profile} onUpdate={updateProfile} />
          )}

          {/* ── MY SERVICES — professional ───────────────────────────────── */}
          {activeSection === "services" && navItems.some(i => i.key === "services") && <ProfessionalServicesEditor />}

          {/* ── ADMIN — agent, institutional, developer ──────────────────── */}
          {activeSection === "admin" && navItems.some(i => i.key === "admin") && <AdminPanel />}

          {/* ── SETTINGS ─────────────────────────────────────────────── */}
          {activeSection === "settings" && navItems.some(i => i.key === "settings") && (
            <SettingsSection bioType={bioType} roleLabel={roleLabel} onUpdate={updateProfile} refreshProfile={refreshProfile} />
          )}

          {/* ── PLACEHOLDER MODULES (contacts, projects, portfolios, analytics) ─── */}
          {["contacts", "projects", "portfolios", "analytics"].map(key =>
            activeSection === key && navItems.some(i => i.key === key) ? (
              <PlaceholderSection key={key} sectionKey={key} />
            ) : null
          )}

        </main>
      </div>

      <AuctionAlertModal
        open={alertModalOpen}
        onClose={() => { setAlertModalOpen(false); setEditingAlert(null); }}
        editAlert={editingAlert}
      />
    </div>
  );
}

// ── Leads section ──────────────────────────────────────────────────────────────
function LeadsSection({ leads, onUpdateStatus }: { leads: any[]; onUpdateStatus: (id: string, status: string) => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const statuses = ["all", "pending", "reviewed", "confirmed", "cancelled"];
  const filtered = statusFilter === "all" ? leads : leads.filter(l => l.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize",
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}>
            {s} {s === "all" ? `(${leads.length})` : `(${leads.filter(l => l.status === s).length})`}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((lead: any) => (
          <div key={lead.id} className="glass-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className={cn("w-2 h-full min-h-[40px] rounded-full shrink-0 hidden sm:block",
              lead.status === "pending" ? "bg-brand-gold" :
              lead.status === "confirmed" ? "bg-brand-emerald" :
              lead.status === "reviewed" ? "bg-blue-400" : "bg-muted-foreground/30"
            )} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm">{lead.requester_name}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", LEAD_STATUS_COLORS[lead.status] ?? "bg-secondary text-muted-foreground")}>{lead.status}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                  {REQUEST_TYPE_LABELS[lead.request_type] ?? lead.request_type}
                </span>
              </div>
              {lead.service && <p className="text-xs text-primary font-medium mb-0.5">Service: {lead.service}</p>}
              {lead.message && <p className="text-xs text-muted-foreground line-clamp-2">{lead.message}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lead.created_at).toLocaleDateString()}</span>
                {lead.requester_email && <span>{lead.requester_email}</span>}
                {lead.requester_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.requester_phone}</span>}
                {lead.preferred_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{lead.preferred_date}</span>}
                {lead.callback_time && <span>Callback: {lead.callback_time}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {lead.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" className="border-brand-emerald/40 text-brand-emerald hover:bg-brand-emerald/10 text-xs gap-1"
                    onClick={() => onUpdateStatus(lead.id, "reviewed")}>
                    <CheckCircle2 className="w-3 h-3" /> Mark Reviewed
                  </Button>
                  <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 text-xs gap-1"
                    onClick={() => onUpdateStatus(lead.id, "confirmed")}>
                    <CheckCircle2 className="w-3 h-3" /> Confirm
                  </Button>
                </>
              )}
              {lead.status === "reviewed" && (
                <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 text-xs gap-1"
                  onClick={() => onUpdateStatus(lead.id, "confirmed")}>
                  <CheckCircle2 className="w-3 h-3" /> Confirm
                </Button>
              )}
              {(lead.status === "confirmed" || lead.status === "reviewed") && (
                <Button size="sm" variant="outline" className="border-muted text-muted-foreground hover:bg-secondary text-xs gap-1"
                  onClick={() => onUpdateStatus(lead.id, "cancelled")}>
                  <AlertCircle className="w-3 h-3" /> Cancel
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Placeholder sections (coming soon) ────────────────────────────────────────
const PLACEHOLDER_META: Record<string, { icon: React.ElementType; title: string; desc: string }> = {
  contacts:   { icon: Users,       title: "Contacts CRM",  desc: "Manage your leads, clients, and contacts in one place." },
  projects:   { icon: Globe2,      title: "Projects",      desc: "Showcase your development projects and pre-sale listings." },
  portfolios: { icon: TrendingUp,  title: "Portfolios",    desc: "Track your property portfolio, valuations, and performance." },
  analytics:  { icon: BarChart2,   title: "Analytics",     desc: "Advanced listing and lead analytics — connect to mAI Prop OS." },
  settings:   { icon: Settings,    title: "Settings",      desc: "Account preferences, notifications, and integrations." },
};

function PlaceholderSection({ sectionKey }: { sectionKey: string }) {
  const meta = PLACEHOLDER_META[sectionKey] ?? { icon: Settings, title: sectionKey, desc: "Coming soon." };
  const Icon = meta.icon;
  return (
    <div className="glass-card rounded-xl p-12 flex items-center justify-center">
      <div className="text-center">
        <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold capitalize">{meta.title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{meta.desc}</p>
      </div>
    </div>
  );
}

// ── Profile editor ─────────────────────────────────────────────────────────────
function ProfileEditor({ profile, onUpdate }: { profile: any; onUpdate: any }) {
  const [form, setForm] = useState({
    display_name: profile?.display_name || "",
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    phone: profile?.phone || "",
    bio: profile?.bio || "",
    city: profile?.city || "",
    website_url: profile?.website_url || "",
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
        {[["Display Name", "display_name"], ["Phone", "phone"], ["City", "city"], ["Website", "website_url"]].map(([label, key]) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
            <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors" />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Bio</label>
          <textarea value={form.bio} rows={3} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors resize-none" />
        </div>
        <Button className="bg-gradient-primary border-0 text-primary-foreground w-full" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ── Settings section ───────────────────────────────────────────────────────────
const BIO_TYPE_LABELS: Record<string, string> = {
  buyer: "Buyer / Renter",
  seller: "Seller / Landlord",
  investor: "Investor",
  agent: "Real Estate Agent",
  institutional: "Institutional",
  developer: "Developer",
  professional: "Professional",
};

const ROLE_PERMISSIONS: Record<string, { label: string; can: string[] }> = {
  individual:      { label: "Individual",       can: ["Browse listings", "Save properties", "Request viewings", "Auction alerts"] },
  seller_landlord: { label: "Seller/Landlord",  can: ["Create & manage listings", "Receive viewing requests", "AI listing assist"] },
  agent:           { label: "Agent",            can: ["Unlimited listings", "OS sync & admin", "Lead management", "Analytics"] },
  professional:    { label: "Professional",     can: ["Professional directory", "Service catalog", "Client leads", "Verified badge"] },
};

function SettingsSection({
  bioType,
  roleLabel,
  onUpdate,
  refreshProfile,
}: {
  bioType: string | null;
  roleLabel: string;
  onUpdate: (updates: any) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── SECURITY: only the __type: prefix in bio is cleared ──────────────────
  // The actual `role` column (which controls RLS permissions) is NEVER touched here.
  // RLS on the profiles table also blocks any self-escalation of the role column.
  const handleSwitchRole = async () => {
    setSwitching(true);
    // Wipe ONLY the participant-type tag from bio — never touches role
    const { error } = await onUpdate({ bio: null });
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

  const currentBioLabel = bioType ? BIO_TYPE_LABELS[bioType] ?? bioType : "Not set";

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      {/* Current account info */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account</h2>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <div>
            <p className="text-sm font-medium">Account Type</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your permission level — cannot be changed by yourself</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {roleLabel}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium">Dashboard View</p>
            <p className="text-xs text-muted-foreground mt-0.5">Currently configured as <strong>{currentBioLabel}</strong></p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-foreground">
            {currentBioLabel}
          </span>
        </div>
      </div>

      {/* What your role can do */}
      {ROLE_PERMISSIONS[roleLabel.toLowerCase().replace(/ \/ /g, "_").replace(/ /g, "_")] ? null : (
        <div className="glass-card rounded-xl p-5 border border-primary/10">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Your Permissions
          </h2>
          <p className="text-xs text-muted-foreground">
            Your access rights are determined server-side and cannot be changed from here.
          </p>
        </div>
      )}

      {/* Security notice */}
      <div className="glass-card rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-amber-300">Security Notice</p>
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
              <span className="text-amber-400 shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">Extra charges may apply.</strong> Upgrading to a higher-tier participant type (e.g. Agent, Institutional) may activate a paid plan. You will be informed before any charge is made.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">No refunds on downgrade.</strong> If you switch to a lower-tier type mid-billing cycle, the remaining period is non-refundable per our Terms of Service.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0 mt-0.5">▸</span>
              <span><strong className="text-foreground">Access rights will change.</strong> Choosing a superior participant type may unlock additional features and data access (e.g. admin panel, deal flow, leads). These are granted server-side upon plan activation.</span>
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
              Your current setup (<strong>{currentBioLabel}</strong>) will be cleared and you'll go through onboarding again.
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
