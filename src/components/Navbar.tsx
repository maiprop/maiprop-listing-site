import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, MessageSquare, User, Menu, X, ChevronDown, Search, Plus, LogOut, LayoutDashboard, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path: string) => location.pathname.startsWith(path) && path !== "/";

  const navLinks = [
    { label: "Buy", href: "/listings?type=buy" },
    { label: "Rent", href: "/listings?type=rent" },
    { label: "Auctions", href: "/auctions", badge: "Live" },
    { label: "Firesale™", href: "/firesale" },
    { label: "Investors", href: "/investor-dashboard", badge: "INVESTORS", badgeStyle: "gold" },
    { label: "Professionals", href: "/professionals" },
  ];

  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "Account";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-xl border-b border-border shadow-card"
          : "bg-background/80 backdrop-blur-sm"
      }`}
    >
      <div className="container flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="font-display font-bold text-sm text-background">m</span>
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent flex items-center justify-center">
              <span className="text-[6px] font-bold text-accent-foreground">AI</span>
            </div>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            mai<span className="gradient-text-cyan">prop</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`relative px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2
                ${isActive(link.href.split("?")[0])
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
            >
              {link.label}
              {link.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold font-semibold animate-pulse">
                  {link.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="hidden lg:flex items-center gap-1">
          {user ? (
            <>
              <Link to="/messages">
                <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <MessageSquare className="w-4 h-4" />
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                </button>
              </Link>
              <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Bell className="w-4 h-4" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors outline-none">
                  <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      : initials}
                  </div>
                  <span className="text-sm text-foreground max-w-[80px] truncate">{displayName}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{profile?.role || "individual"}</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="flex items-center gap-2 cursor-pointer">
                      <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/listings" className="flex items-center gap-2 cursor-pointer">
                      <Building2 className="w-3.5 h-3.5" /> My Listings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/messages" className="flex items-center gap-2 cursor-pointer">
                      <MessageSquare className="w-3.5 h-3.5" /> Messages
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground hover:opacity-90 gap-1.5" asChild>
                <Link to="/listings/new"><Plus className="w-3.5 h-3.5" /> List Property</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
                <Link to="/login">Sign In</Link>
              </Button>
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground hover:opacity-90" asChild>
                <Link to="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="lg:hidden bg-card border-b border-border px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
              {link.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold font-semibold">{link.badge}</span>
              )}
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
        </div>
      )}
    </header>
  );
}
