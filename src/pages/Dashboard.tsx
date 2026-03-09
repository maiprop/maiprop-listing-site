import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Home, Plus, BarChart2, MessageSquare, Heart, Settings, User,
  Eye, Bell, BellOff, LogOut, Building2, Gavel, CheckCircle,
  Loader2, Calendar, Trash2, ToggleLeft, ToggleRight, Bookmark, Search, Activity, Wrench
} from "lucide-react";
import { OSSyncPanel } from "@/components/OSSyncPanel";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings, useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useFavorites } from "@/hooks/useFavorites";
import { useViewings } from "@/hooks/useViewings";
import { useSavedSearches, useDeleteSavedSearch, useToggleSavedSearchAlert } from "@/hooks/useSavedSearches";
import { PropertyCard } from "@/components/PropertyCard";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";
import { toast } from "sonner";

const navItems = [
  { icon: Home, label: "Overview", key: "overview" },
  { icon: Building2, label: "My Listings", key: "listings" },
  { icon: BarChart2, label: "Analytics", key: "analytics" },
  { icon: Heart, label: "Saved", key: "saved" },
  { icon: Bookmark, label: "Saved Searches", key: "saved-searches" },
  { icon: MessageSquare, label: "Messages", key: "messages" },
  { icon: Calendar, label: "Viewings", key: "viewings" },
  { icon: Gavel, label: "Auctions", key: "auctions" },
  { icon: Activity, label: "OS Sync", key: "os-sync" },
  { icon: User, label: "Profile", key: "profile" },
  { icon: Settings, label: "Settings", key: "settings" },
];

export default function Dashboard() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { profile, user, signOut, updateProfile } = useAuth();
  const [activeSection, setActiveSection] = useState(section || "overview");

  const { data: myListings = [], isLoading: listingsLoading } = useMyListings();
  const { data: favorites = [], isLoading: favLoading } = useFavorites();
  const { data: viewings = [], isLoading: viewingsLoading } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const { data: savedSearches = [], isLoading: savedSearchesLoading } = useSavedSearches();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const deleteSavedSearch = useDeleteSavedSearch();
  const toggleAlert = useToggleSavedSearchAlert();

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
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Saved Properties</h1>
              {favLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : favorites.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No saved properties</p>
                  <p className="text-sm text-muted-foreground mt-1">Browse listings and save your favorites</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favorites.map((f: any) => f.listings && (
                    <div key={f.id} className="glass-card rounded-xl overflow-hidden">
                      <img src={f.listings.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60"} alt="" className="w-full h-40 object-cover" />
                      <div className="p-4">
                        <p className="font-semibold text-sm">{f.listings.title}</p>
                        <p className="text-xs text-muted-foreground">{f.listings.city} · €{Number(f.listings.price).toLocaleString()}</p>
                        <Button size="sm" variant="outline" className="border-border mt-3 w-full text-xs" asChild>
                          <Link to={`/property/${f.listing_id}`}>View Property</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

          {/* OS SYNC */}
          {activeSection === "os-sync" && <OSSyncPanel />}

          {(activeSection === "analytics" || activeSection === "auctions" || activeSection === "settings") && (
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
