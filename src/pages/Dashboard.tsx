import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Home, Plus, BarChart2, MessageSquare, Heart, Settings, User,
  TrendingUp, Eye, Bell, LogOut, Building2, Gavel, Star, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { mockProperties } from "@/data/mockProperties";
import { PropertyCard } from "@/components/PropertyCard";

type UserRole = "individual" | "agent" | "professional";

const navItems = [
  { icon: Home, label: "Overview", key: "overview" },
  { icon: Building2, label: "My Listings", key: "listings" },
  { icon: BarChart2, label: "Analytics", key: "analytics" },
  { icon: Heart, label: "Saved", key: "saved" },
  { icon: MessageSquare, label: "Messages", key: "messages", badge: 3 },
  { icon: Gavel, label: "Auctions", key: "auctions" },
  { icon: Bell, label: "Alerts", key: "alerts" },
  { icon: User, label: "Profile", key: "profile" },
  { icon: Settings, label: "Settings", key: "settings" },
];

const statsAgent = [
  { label: "Active Listings", value: "12", change: "+2", icon: Building2, color: "text-primary" },
  { label: "Total Views", value: "4,820", change: "+12%", icon: Eye, color: "text-brand-emerald" },
  { label: "Saved by Users", value: "238", change: "+8%", icon: Heart, color: "text-destructive" },
  { label: "Avg. Days Listed", value: "18", change: "-3", icon: TrendingUp, color: "text-brand-gold" },
];

export default function Dashboard() {
  const { section } = useParams();
  const [activeSection, setActiveSection] = useState(section || "overview");
  const [userRole] = useState<UserRole>("agent");

  const myListings = mockProperties.slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 flex">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 hidden md:flex flex-col bg-card border-r border-border min-h-screen sticky top-16 h-[calc(100vh-4rem)]">
          {/* User info */}
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground">N</div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">Nikos Papadopoulos</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">{userRole}</span>
                  <CheckCircle className="w-3 h-3 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === item.key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
                {item.badge && (
                  <span className="ml-auto w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6 max-w-full overflow-hidden">
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold">Good morning, Nikos 👋</h1>
                  <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your listings today.</p>
                </div>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
                  <Link to="/listings/new">
                    <Plus className="w-4 h-4" /> New Listing
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statsAgent.map(stat => (
                  <div key={stat.label} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <div className={`font-display text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-brand-emerald mt-1">{stat.change} this month</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold">Active Listings</h2>
                  <Button variant="outline" size="sm" className="border-border" onClick={() => setActiveSection("listings")}>View All</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myListings.map(p => <PropertyCard key={p.id} property={p} />)}
                </div>
              </div>
            </div>
          )}

          {activeSection === "listings" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold">My Listings</h1>
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2">
                  <Plus className="w-4 h-4" /> New Listing
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockProperties.slice(0, 6).map(p => <PropertyCard key={p.id} property={p} />)}
              </div>
            </div>
          )}

          {activeSection === "saved" && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Saved Properties</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockProperties.slice(0, 4).map(p => <PropertyCard key={p.id} property={p} />)}
              </div>
            </div>
          )}

          {activeSection === "analytics" && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold">Analytics</h1>
              <div className="glass-card rounded-xl p-8 flex items-center justify-center aspect-[16/6]">
                <div className="text-center">
                  <BarChart2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Advanced analytics powered by mAI Prop OS</p>
                  <p className="text-xs text-muted-foreground mt-1">Connect Lovable Cloud to enable live charts</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === "messages" && (
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-bold">Messages</h1>
              <div className="space-y-2">
                {["Maria K.", "Eleni S.", "Alexandros P."].map((name, i) => (
                  <div key={name} className="glass-card rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground shrink-0">
                      {name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{name}</div>
                      <div className="text-xs text-muted-foreground truncate">Re: Penthouse Kolonaki — Is the property still available?</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{["2m", "1h", "3h"][i]} ago</div>
                    {i === 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeSection === "profile" || activeSection === "settings" || activeSection === "alerts" || activeSection === "auctions") && (
            <div className="glass-card rounded-xl p-12 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                  <Settings className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-semibold capitalize">{activeSection}</p>
                <p className="text-sm text-muted-foreground mt-1">This section will be available with Lovable Cloud enabled</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
