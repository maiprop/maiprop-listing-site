import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Home, Plus, BarChart2, MessageSquare, Heart, Settings, User,
  Eye, Bell, BellOff, LogOut, Building2, Gavel, CheckCircle,
  Loader2, Calendar, Trash2, ToggleLeft, ToggleRight, Bookmark, Search, Activity, Wrench, Shield, MapPin, Euro, Edit2
} from "lucide-react";
import { OSSyncPanel } from "@/components/OSSyncPanel";
import AdminPanel from "@/components/AdminPanel";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings, useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useFavorites } from "@/hooks/useFavorites";
import { useViewings } from "@/hooks/useViewings";
import { useSavedSearches, useDeleteSavedSearch, useToggleSavedSearchAlert } from "@/hooks/useSavedSearches";
import { useAuctionAlerts, useDeleteAuctionAlert, useUpdateAuctionAlert } from "@/hooks/useAuctionAlerts";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { PropertyCard } from "@/components/PropertyCard";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbListingToCard(l: any) {
  return {
    id: l.id,
    title: l.title,
    address: l.address || l.city,
    city: l.city,
    price: Number(l.price),
    pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
    bedrooms: l.bedrooms ?? undefined,
    bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm),
    floor: l.floor ?? undefined,
    totalFloors: l.total_floors ?? undefined,
    yearBuilt: l.year_built ?? undefined,
    energyClass: l.energy_class ?? undefined,
    images: [
      ...(l.cover_image_url ? [l.cover_image_url] : []),
      ...(l.listing_images?.map((img: any) => img.url) || []),
    ].filter(Boolean),
    type: l.property_type as any,
    listingType: l.listing_type as any,
    auctionDate: l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
    auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
    aiScore: l.ai_score ?? undefined,
    views: l.views_count ?? undefined,
    tags: (l.tags || []).filter(Boolean) as string[],
    hasVideo: l.has_video_tour,
    hasVirtualTour: l.has_virtual_tour,
  };
}

const SAVED_TABS = [
  { label: "All", value: "" },
  { label: "Sale", value: "sale" },
  { label: "Rent", value: "rent" },
  { label: "Auction", value: "auction" },
  { label: "Quick Sale", value: "firesale" },
] as const;

function SavedPropertiesSection({ favorites, favLoading }: { favorites: any[]; favLoading: boolean }) {
  const [tab, setTab] = useState<string>("");

  const filtered = favorites.filter((f: any) => {
    if (!f.listings) return false;
    if (!tab) return true;
    return f.listings.listing_type === tab;
  });

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

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {SAVED_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              tab === t.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {t.label}
            {t.value && (
              <span className="ml-1.5 text-xs opacity-60">
                {favorites.filter(f => f.listings?.listing_type === t.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {favLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">
            {tab ? `No saved ${tab} properties` : "No saved properties yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Browse listings and tap the heart to save</p>
          <Button variant="outline" className="border-border mt-4" asChild>
            <Link to="/listings">Browse Listings</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((f: any) => (
            <PropertyCard key={f.id} property={dbListingToCard(f.listings)} />
          ))}
        </div>
      )}
    </div>
  );
}

const navItems = [
  { icon: Home, label: "Overview", key: "overview" },
  { icon: Building2, label: "My Listings", key: "listings" },
  { icon: BarChart2, label: "Analytics", key: "analytics" },
  { icon: Heart, label: "Saved", key: "saved" },
  { icon: Bookmark, label: "Saved Searches", key: "saved-searches" },
  { icon: MessageSquare, label: "Messages", key: "messages" },
  { icon: Calendar, label: "Viewings", key: "viewings" },
  { icon: Gavel, label: "Auctions", key: "auctions" },
  { icon: Wrench, label: "My Services", key: "services" },
  { icon: Activity, label: "OS Sync", key: "os-sync" },
  { icon: Shield, label: "Admin", key: "admin" },
  { icon: User, label: "Profile", key: "profile" },
  { icon: Settings, label: "Settings", key: "settings" },
];

export default function Dashboard() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { profile, user, signOut, updateProfile } = useAuth();
  const [activeSection, setActiveSection] = useState(section || "overview");
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<any>(null);

  const { data: myListings = [], isLoading: listingsLoading } = useMyListings();
  const { data: favorites = [], isLoading: favLoading } = useFavorites();
  const { data: viewings = [], isLoading: viewingsLoading } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const { data: savedSearches = [], isLoading: savedSearchesLoading } = useSavedSearches();
  const { data: auctionAlerts = [], isLoading: alertsLoading } = useAuctionAlerts();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const deleteSavedSearch = useDeleteSavedSearch();
  const toggleAlert = useToggleSavedSearchAlert();
  const deleteAuctionAlert = useDeleteAuctionAlert();
  const toggleAuctionAlert = useUpdateAuctionAlert();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const toggleListingStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    updateListing.mutate({ id, updates: { status: newStatus } });
  };

  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "User";
  const roleLabel = profile?.role || "individual";

  const stats = [
    { label: "Active Listings", value: myListings.filter(l => l.status === "active").length, icon: Building2, color: "text-primary" },
    { label: "Total Views", value: myListings.reduce((sum, l) => sum + (l.views_count || 0), 0), icon: Eye, color: "text-brand-emerald" },
    { label: "Saved Properties", value: favorites.length, icon: Heart, color: "text-destructive" },
    { label: "Upcoming Viewings", value: viewings.filter(v => v.status === "confirmed" || v.status === "pending").length, icon: Calendar, color: "text-brand-gold" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 flex">
        {/* Sidebar */}
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
                      : null
                  }
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              <button key={item.key} onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === item.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 max-w-full overflow-hidden">

          {/* OVERVIEW */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold">Good morning, {displayName} 👋</h1>
                  <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your account.</p>
                </div>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setActiveSection("listings")}>
                  <Plus className="w-4 h-4" /> New Listing
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map(stat => (
                  <div key={stat.label} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <div className={`font-display text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  </div>
                ))}
              </div>
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
            </div>
          )}

          {/* MY LISTINGS */}
          {activeSection === "listings" && (
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
                        <button onClick={() => toggleListingStatus(l.id, l.status)}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          {l.status === "active" ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { if (confirm("Delete this listing?")) deleteListing.mutate(l.id); }}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SAVED */}
          {activeSection === "saved" && (
            <SavedPropertiesSection favorites={favorites} favLoading={favLoading} />
          )}

          {/* MESSAGES */}
          {activeSection === "messages" && (
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-bold">Messages</h1>
              <Button className="bg-gradient-primary border-0 text-primary-foreground" asChild>
                <Link to="/messages">Open Full Inbox</Link>
              </Button>
            </div>
          )}

          {/* SAVED SEARCHES */}
          {activeSection === "saved-searches" && (
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
                  <Button variant="outline" className="border-border mt-4" asChild>
                    <Link to="/listings">Browse Listings</Link>
                  </Button>
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
                            {filterCount > 0
                              ? Object.entries(s.filters).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")
                              : "All listings"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Saved {new Date(s.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Toggle email alerts */}
                          <button
                            onClick={() => toggleAlert.mutate({ id: s.id, emailAlerts: !s.email_alerts })}
                            title={s.email_alerts ? "Disable email alerts" : "Enable email alerts"}
                            className={`p-2 rounded-lg border transition-colors ${
                              s.email_alerts
                                ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                                : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
                            }`}
                          >
                            {s.email_alerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                          </button>
                          {/* Run search */}
                          <Button size="sm" variant="outline" className="border-border text-xs gap-1.5" asChild>
                            <Link to={`/listings?${params.toString()}`}>
                              <Search className="w-3 h-3" /> Run
                            </Link>
                          </Button>
                          {/* Delete */}
                          <button
                            onClick={() => { if (confirm("Delete this saved search?")) deleteSavedSearch.mutate(s.id); }}
                            className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          >
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

          {/* VIEWINGS */}
          {activeSection === "viewings" && (
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

          {/* PROFILE */}
          {activeSection === "profile" && (
            <ProfileEditor profile={profile} onUpdate={updateProfile} />
          )}

          {/* MY SERVICES (professionals) */}
          {activeSection === "services" && <ProfessionalServicesEditor />}

          {/* OS SYNC */}
          {activeSection === "os-sync" && <OSSyncPanel />}

          {/* ADMIN */}
          {activeSection === "admin" && <AdminPanel />}

          {/* AUCTION ALERTS */}
          {activeSection === "auctions" && (
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
                  <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2"
                    onClick={() => { setEditingAlert(null); setAlertModalOpen(true); }}>
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
                          {a.city && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                              <MapPin className="w-3 h-3" />{a.city}
                            </span>
                          )}
                          {a.property_type && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 capitalize">{a.property_type}</span>
                          )}
                          {(a.min_price || a.max_price) && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                              <Euro className="w-3 h-3" />
                              {a.min_price ? `€${Number(a.min_price).toLocaleString()}` : "Any"} – {a.max_price ? `€${Number(a.max_price).toLocaleString()}` : "Any"}
                            </span>
                          )}
                          {!a.city && !a.property_type && !a.min_price && !a.max_price && (
                            <span className="text-xs text-muted-foreground">All auctions</span>
                          )}
                        </div>
                        {a.court_name && <p className="text-xs text-muted-foreground truncate">{a.court_name}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${a.active ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"}`}>
                            {a.active ? "Active" : "Paused"}
                          </span>
                          {a.email_notify && <span className="text-xs text-muted-foreground">📧 Email on</span>}
                          <span className="text-xs text-muted-foreground">Created {new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => toggleAuctionAlert.mutate({ id: a.id, updates: { active: !a.active } })}
                          title={a.active ? "Pause alert" : "Activate alert"}
                          className={`p-2 rounded-lg border transition-colors ${
                            a.active
                              ? "border-brand-gold/30 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20"
                              : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {a.active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </button>
                        {/* Edit */}
                        <button
                          onClick={() => { setEditingAlert(a); setAlertModalOpen(true); }}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => { if (confirm("Delete this alert?")) deleteAuctionAlert.mutate(a.id); }}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeSection === "analytics" || activeSection === "settings") && (
            <div className="glass-card rounded-xl p-12 flex items-center justify-center">
              <div className="text-center">
                <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold capitalize">{activeSection}</p>
                <p className="text-sm text-muted-foreground mt-1">Coming soon — connect to mAI Prop OS for advanced analytics</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Auction alert modal */}
      <AuctionAlertModal
        open={alertModalOpen}
        onClose={() => { setAlertModalOpen(false); setEditingAlert(null); }}
        editAlert={editingAlert}
      />
    </div>
  );
}

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
