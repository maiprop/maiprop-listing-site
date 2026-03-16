import { useState, useEffect } from "react";
import logoImg from "@/assets/logo.png";
import logoDarkImg from "@/assets/logo-dark.png";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, MessageSquare, User, Menu, X, ChevronDown, Plus, LogOut, LayoutDashboard, Building2, Sun, Moon, Home, List, Gavel, Flame, Zap, Sparkles, Shield, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { isPlatformAdmin } from "@/lib/authUtils";

// Pages that have a full-width dark hero image at the top
const DARK_HERO_ROUTES = ["/"];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { isPro } = useSubscription();
  const { theme, setTheme } = useTheme();

  const participantType = getParticipantTypeFromProfile(profile);
  const isDeveloper = participantType === "developer";
  const canListProperty = ["seller", "agent", "institutional", "developer"].includes(participantType);
  const hasDarkHero = DARK_HERO_ROUTES.includes(location.pathname);
  // When transparent AND over a dark hero, force white text; otherwise use semantic tokens
  const isTransparent = !scrolled;
  const forceLight = isTransparent && hasDarkHero;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (href: string) => {
    const [path, qs] = href.split("?");
    if (path !== "/" && !location.pathname.startsWith(path)) return false;
    if (qs) {
      const params = new URLSearchParams(qs);
      const current = new URLSearchParams(location.search);
      for (const [k, v] of params.entries()) {
        if (current.get(k) !== v) return false;
      }
    }
    return path !== "/" || location.pathname === "/";
  };

  const navLinks = [
    { label: "Buy", href: "/listings?listing_type=sale" },
    { label: "Rent", href: "/listings?listing_type=rent" },
    { label: "Auctions", href: "/auctions", badge: "Live" },
    { label: "Quick Sale™", href: "/firesale", accent: "flame" },
    { label: "Open Houses", href: "/open-houses", accent: "dooropen" },
    { label: "Professionals", href: "/professionals", accent: "subtle" },
  ];

  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "Account";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-card"
          : hasDarkHero
            ? "bg-transparent border-b border-transparent"
            : "bg-background/60 backdrop-blur-md border-b border-border/30"
      }`}
    >
      <div className="container flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <img
            src={forceLight || theme === "dark" ? logoDarkImg : logoImg}
            alt="maiProp — Real estate | Real decisions."
            className="h-10 w-auto object-contain transition-all duration-300"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`relative px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5
                ${isActive(link.href)
                  ? link.accent === "flame"
                    ? "text-destructive bg-destructive/10"
                    : link.accent === "dooropen"
                      ? forceLight ? "text-white bg-white/20" : "text-emerald-600 bg-emerald-500/10"
                      : forceLight
                        ? "text-white bg-white/20"
                        : "text-primary bg-primary/10"
                  : link.accent === "flame"
                    ? forceLight
                      ? "text-orange-300 hover:text-orange-200 hover:bg-white/10"
                      : "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    : link.accent === "dooropen"
                      ? forceLight
                        ? "text-emerald-200 hover:text-white hover:bg-white/10"
                        : "text-emerald-600/80 hover:text-emerald-600 hover:bg-emerald-500/10"
                      : link.accent === "subtle"
                        ? forceLight
                          ? "text-white/80 hover:text-white hover:bg-white/10"
                          : "text-accent/90 hover:text-accent hover:bg-accent/10"
                        : forceLight
                            ? "text-white/80 hover:text-white hover:bg-white/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
            >
              {link.accent === "flame" && <span className="text-sm">🔥</span>}
              {link.accent === "dooropen" && <DoorOpen className="w-3.5 h-3.5 shrink-0" />}
              {link.label}
              {link.badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold animate-pulse ${
                  forceLight ? "bg-white/20 text-white" : "bg-brand-gold/20 text-brand-gold"
                }`}>
                  {link.badge}
                </span>
              )}
              {link.accent === "subtle" && (
                <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${forceLight ? "bg-white/50" : "bg-accent/60"}`} />
              )}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`p-2 rounded-lg transition-colors ${
              forceLight
                ? "text-white/80 hover:text-white hover:bg-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {user ? (
            <>
              <Link to="/messages">
                <button className={`relative p-2 rounded-lg transition-colors ${
                  forceLight
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`} title="Messages">
                  <MessageSquare className="w-4 h-4" />
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                </button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger className={`relative p-2 rounded-lg transition-colors outline-none ${
                  forceLight
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`} title="Notifications">
                  <Bell className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 bg-card border-border p-4">
                  <p className="text-sm font-medium mb-1">Notifications</p>
                  <p className="text-xs text-muted-foreground">No notifications yet. Activity alerts and updates coming soon.</p>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors outline-none ${
                  forceLight ? "hover:bg-white/10" : "hover:bg-secondary"
                }`}>
                  <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      : initials}
                  </div>
                  <span className={`text-sm max-w-[80px] truncate ${forceLight ? "text-white" : "text-foreground"}`}>{displayName}</span>
                  <ChevronDown className={`w-3 h-3 ${forceLight ? "text-white/60" : "text-muted-foreground"}`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                    {isPlatformAdmin(profile) ? "Admin" : (profile?.role as string) === "seller_landlord" ? "Seller / Landlord" : (profile?.role as string) === "agent" ? "Agent" : (profile?.role as string) === "professional" ? "Professional" : (profile?.role as string) === "investor" ? "Investor" : (profile?.role as string) === "institutional" ? "Institutional" : (profile?.role as string) === "developer" ? "Developer" : (profile?.role as string) === "individual" ? "Buyer / Renter" : (profile?.role || "Buyer / Renter")}
                  </p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="flex items-center gap-2 cursor-pointer">
                      <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  {canListProperty && (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard/listings" className="flex items-center gap-2 cursor-pointer">
                        <Building2 className="w-3.5 h-3.5" /> My Listings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/messages" className="flex items-center gap-2 cursor-pointer">
                      <MessageSquare className="w-3.5 h-3.5" /> Messages
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/open-houses" className="flex items-center gap-2 cursor-pointer">
                      <DoorOpen className="w-3.5 h-3.5 text-emerald-600" /> Open Houses
                    </Link>
                  </DropdownMenuItem>
                  {(participantType === "investor" || participantType === "institutional") && (
                    <DropdownMenuItem asChild>
                      <Link to="/investor-dashboard" className="flex items-center gap-2 cursor-pointer">
                        <Flame className="w-3.5 h-3.5" /> Investor Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isPlatformAdmin(profile) && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="w-3.5 h-3.5" /> Admin
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {canListProperty && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground hover:opacity-90 gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> List Property <ChevronDown className="w-3 h-3 opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link to="/listings/new" className="flex items-center gap-2 cursor-pointer">
                        <Home className="w-3.5 h-3.5" /> Regular Listing
                      </Link>
                    </DropdownMenuItem>
                    {isDeveloper && (
                      <DropdownMenuItem asChild>
                        <Link to="/listings/new-building" className="flex items-center gap-2 cursor-pointer">
                          <Building2 className="w-3.5 h-3.5" /> New Building
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Pro badge / CTA */}
              {isPro ? (
                <Link
                  to="/pricing"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    forceLight
                      ? "bg-brand-gold/30 border-brand-gold/50 text-yellow-200"
                      : "bg-brand-gold/15 border-brand-gold/40 text-brand-gold"
                  }`}
                >
                  <Zap className="w-3 h-3" /> Pro ✓
                </Link>
              ) : (
                <Link
                  to="/pricing"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 ${
                    forceLight
                      ? "bg-brand-gold/20 border-brand-gold/40 text-yellow-200 hover:bg-brand-gold/30"
                      : "bg-brand-gold/10 border-brand-gold/30 text-brand-gold hover:bg-brand-gold/20"
                  }`}
                >
                  <Zap className="w-3 h-3" /> Pro
                </Link>
              )}
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={forceLight ? "text-white/90 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-foreground"}
                asChild
              >
                <Link to="/login">Sign In</Link>
              </Button>
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground hover:opacity-90" asChild>
                <Link to="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button — 44px touch target */}
        <button
          className={`lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${
            forceLight ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="lg:hidden bg-card/95 backdrop-blur-xl border-b border-border px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`flex items-center gap-2 min-h-[44px] px-3 py-2.5 rounded-lg text-sm transition-colors ${
                link.accent === "flame"
                  ? "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                  : link.accent === "dooropen"
                    ? "text-emerald-600/80 hover:text-emerald-600 hover:bg-emerald-500/10"
                    : link.accent === "subtle"
                      ? "text-accent/80 hover:text-accent hover:bg-accent/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              {link.accent === "flame" && <span>🔥</span>}
              {link.accent === "dooropen" && <DoorOpen className="w-4 h-4 shrink-0" />}
              {link.label}
              {link.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold font-semibold">{link.badge}</span>
              )}
              {link.accent === "subtle" && <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />}
            </Link>
          ))}
          <div className="pt-2 flex gap-2">
            {user ? (
              <>
                <Button variant="outline" size="sm" className="flex-1 border-border" asChild>
                  <Link to="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                </Button>
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground" onClick={handleSignOut}>
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="flex-1 border-border" asChild>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>Sign In</Link>
                </Button>
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground" asChild>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>Sign Up</Link>
                </Button>
              </>
            )}
          </div>
          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              Switch to {theme === "dark" ? "Light" : "Dark"} Mode
            </button>
          </div>
        </div>
      )}
    </header>

      {/* ── Mobile Bottom Nav — 44px touch targets, text-xs for readability ─ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-card/60 border-t border-border/40 pb-safe" aria-label="Main navigation">
        <div className="flex items-stretch min-h-[64px]">
          {[
            { to: "/", icon: Home, label: "Home" },
            { to: "/listings", icon: List, label: "Listings" },
            { to: "/auctions", icon: Gavel, label: "Auctions" },
            { to: "/firesale", icon: Flame, label: "Quick Sale", accent: "text-destructive" },
            { to: "/open-houses", icon: DoorOpen, label: "Open Houses", accent: "text-emerald-600" },
            { to: "/ai-assistant", icon: Sparkles, label: "AI" },
            { to: user ? "/dashboard" : "/signup", icon: user ? LayoutDashboard : User, label: user ? "Dashboard" : "Get Started" },
          ].map(({ to, icon: Icon, label, accent }) => {
            const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] py-2 text-xs font-semibold transition-colors active:opacity-80 ${
                  active ? "text-primary" : accent || "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
