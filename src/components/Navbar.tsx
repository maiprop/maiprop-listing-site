/* eslint complexity: "off" */
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoImg from "@/assets/logo.png";
import logoDarkImg from "@/assets/logo-dark.png";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Menu, X, ChevronDown, LogOut, LayoutDashboard, Building2, Sun, Moon, Flame, DoorOpen, Search, Zap, Gavel, Calendar, CheckCheck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { getParticipantTypeFromProfile, isInvestorMode, PARTICIPANT_LABELS, type ParticipantId } from "@/lib/participantConfig";
import { formatTimeAgo } from "@/lib/format";
import { isPlatformAdmin, isSellSideRole } from "@/lib/authUtils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { sanitizeRedirectPath } from "@/lib/authRedirect";
import {
  notificationReadAllSchema,
  notificationReadSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";

// Pages that have a full-width dark hero image at the top
const DARK_HERO_ROUTES = ["/"];
type NavAccent = "flame" | "dooropen" | "subtle";
type NavLinkItem = { label: string; href: string; badge?: string; accent?: NavAccent };

export const Navbar = ({ forceScrolled = false }: { forceScrolled?: boolean } = {}) => { // skipcq: JS-R1005
  const [scrolled, setScrolled] = useState(forceScrolled);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();

  const participantType = getParticipantTypeFromProfile(profile);
  const canListProperty = isSellSideRole(profile) || isPlatformAdmin(profile);
  const { eligible: eligibleForQuickSale } = useEligibleForQuickSale();

  const queryClient = useQueryClient();

  const { data: unreadNotifCount = 0 } = useQuery({
    queryKey: ["notifications_unread", user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  type NotifItem = { id: string; title: string; body: string | null; type: string; read: boolean; created_at: string; link: string | null };
  const { data: notifItems = [] } = useQuery<NotifItem[]>({
    queryKey: ["notifications_list", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, type, read, created_at, link")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as NotifItem[];
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const markNotifRead = async (id: string) => {
    if (!user) return;
    // Defence in depth: include user_id ownership filter in addition to id —
    // RLS protects this server-side but the repo rule is to also filter
    // client-side so a malformed/forged id can't be used to update someone
    // else's notification by accident.
    const payload = parseMutationInput(notificationReadSchema, { id }, "notification");
    await supabase.from("notifications").update({ read: true }).eq("id", payload.id).eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["notifications_unread", user.id] });
    queryClient.invalidateQueries({ queryKey: ["notifications_list", user.id] });
  };

  const handleNotificationClick = async (item: NotifItem) => {
    await markNotifRead(item.id);
    if (item.link) navigate(sanitizeRedirectPath(item.link, "/dashboard"));
  };

  const markAllRead = async () => {
    if (!user) return;
    const payload = parseMutationInput(notificationReadAllSchema, { userId: user.id }, "notifications");
    await supabase.from("notifications").update({ read: true }).eq("user_id", payload.userId).eq("read", false);
    queryClient.invalidateQueries({ queryKey: ["notifications_unread", user.id] });
    queryClient.invalidateQueries({ queryKey: ["notifications_list", user.id] });
  };

  const hasDarkHero = DARK_HERO_ROUTES.includes(location.pathname);
  // When transparent AND over a dark hero, force white text; otherwise use semantic tokens
  const isTransparent = !scrolled;
  const forceLight = isTransparent && hasDarkHero;
  const useLightLogo = forceLight || resolvedTheme === "dark";

  useEffect(() => {
    if (forceScrolled) return;
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [forceScrolled]);

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

  const navLinks: NavLinkItem[] = [
    { label: t("listings.types.sale"), href: "/listings?listing_type=sale" },
    { label: t("listings.types.rent"), href: "/listings?listing_type=rent" },
    { label: t("nav.auctions"), href: "/auctions", badge: t("common.live") },
    { label: t("nav.quickSale"), href: "/firesale", accent: "flame" },
    { label: t("nav.openHouses"), href: "/open-houses", accent: "dooropen" },
    { label: t("nav.professionals"), href: "/professionals", accent: "subtle" },
  ];
  const displayName = profile?.display_name || profile?.first_name || user?.email?.split("@")[0] || "Account";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
    {/* Skip-to-main link — visible only on keyboard focus (WCAG 2.1 SC 2.4.1) */}
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:shadow-lg"
    >
      {t("common.skipToMain")}
    </a>
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-card"
          : hasDarkHero
            ? "bg-transparent border-b border-transparent"
            : "bg-background/60 backdrop-blur-md border-b border-border/30"
      }`}
    >
      <div className="container flex items-center justify-between h-16 gap-3 px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <img
            src={useLightLogo ? logoDarkImg : logoImg}
            alt="mAI prop"
            className="h-9 w-auto object-contain transition-all duration-300"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden xl:flex flex-1 min-w-0 items-center justify-center px-2" aria-label="Primary">
          <div className={`flex max-w-full min-w-0 items-center gap-1 rounded-full border p-1 shadow-sm ${
            forceLight
              ? "border-white/20 bg-black/10"
              : "border-border/70 bg-background/75"
          }`}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors
                ${isActive(link.href)
                  ? link.accent === "flame"
                    ? "text-destructive-foreground bg-destructive hover:bg-destructive/90"
                    : link.accent === "dooropen"
                      ? forceLight ? "text-white bg-white/20" : "text-primary bg-primary/10"
                      : forceLight
                        ? "text-white bg-white/20"
                        : "text-primary bg-primary/10"
                  : link.accent === "flame"
                    ? forceLight
                      ? "text-orange-300 hover:text-orange-200 hover:bg-white/10"
                      : "text-destructive hover:text-destructive hover:bg-destructive/10"
                    : link.accent === "dooropen"
                      ? forceLight
                        ? "text-white/80 hover:text-white hover:bg-white/10"
                        : "text-primary/80 hover:text-primary hover:bg-primary/10"
                      : link.accent === "subtle"
                        ? forceLight
                          ? "text-white/80 hover:text-white hover:bg-white/10"
                          : "text-muted-foreground/90 hover:text-foreground hover:bg-secondary"
                        : forceLight
                            ? "text-white/80 hover:text-white hover:bg-white/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {link.accent === "flame" && <Flame className="w-3.5 h-3.5 shrink-0 flame-flicker" />}
                {link.accent === "dooropen" && <DoorOpen className="w-3.5 h-3.5 shrink-0" />}
                {link.label}
                {link.badge && (
                  <span className={`status-live text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                    forceLight ? "bg-white/20 text-white" : "bg-primary/15 text-primary"
                  }`}>
                    {link.badge}
                  </span>
                )}
                {link.accent === "subtle" && (
                  <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${forceLight ? "bg-white/50" : "bg-accent/60"}`} />
                )}
              </Link>
            ))}
          </div>
        </nav>

        {/* Right actions */}
        <div className="hidden xl:flex shrink-0 items-center justify-end gap-2">
          <div className={`flex h-10 items-center gap-0.5 rounded-full border px-1 ${
            forceLight ? "border-white/15 bg-white/10" : "border-border/70 bg-background/75"
          }`}>
            <LanguageSwitcher />
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                forceLight
                  ? "text-white/80 hover:text-white hover:bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              aria-label={t("common.toggleTheme")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors outline-none ${
                  forceLight
                    ? "text-white/80 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`} title={t("notificationsPanel.title")}>
                  <Bell className="w-4 h-4" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-destructive text-[9px] font-black text-white flex items-center justify-center leading-none">
                      {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 bg-card border-border p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {t("notificationsPanel.title")}
                      {unreadNotifCount > 0 && (
                        <span className="text-[10px] font-bold bg-destructive text-white px-1.5 py-0.5 rounded-full">{unreadNotifCount}</span>
                      )}
                    </p>
                    {unreadNotifCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> {t("notificationsPanel.markAllRead")}
                      </button>
                    )}
                  </div>
                  {notifItems.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-muted-foreground/25 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">{t("notificationsPanel.empty")}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border max-h-80 overflow-y-auto">
                      {notifItems.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${!n.read ? "bg-primary/15" : "bg-secondary"}`}>
                              {n.type === "quick_sale" || n.type === "firesale" ? <Flame className="w-3.5 h-3.5 text-destructive" /> :
                               n.type === "auction_alert" || n.type === "auction" ? <Gavel className="w-3.5 h-3.5 text-primary" /> :
                               n.type === "viewing" ? <Calendar className="w-3.5 h-3.5 text-primary" /> :
                               n.type === "open_house" ? <DoorOpen className="w-3.5 h-3.5 text-primary" /> :
                               n.type === "message" ? <MessageSquare className="w-3.5 h-3.5 text-primary" /> :
                               <Bell className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs leading-snug ${!n.read ? "font-semibold text-foreground" : "text-foreground"}`}>{n.title}</p>
                              {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{n.body}</p>}
                              <p className="text-[10px] text-muted-foreground/60 mt-1">{formatTimeAgo(n.created_at)}</p>
                            </div>
                            {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className={`flex h-10 items-center gap-2 rounded-full border px-1.5 pr-2.5 transition-colors outline-none ${
                  forceLight ? "border-white/15 bg-white/10 hover:bg-white/15" : "border-border/70 bg-background/75 hover:bg-secondary"
                }`}>
                  <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt={`${displayName} profile photo`} className="w-full h-full rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      : initials}
                  </div>
                  <span className={`hidden max-w-[96px] truncate text-sm font-semibold 2xl:inline ${forceLight ? "text-white" : "text-foreground"}`}>{displayName}</span>
                  <ChevronDown className={`w-3 h-3 ${forceLight ? "text-white/60" : "text-muted-foreground"}`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-semibold truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {isPlatformAdmin(profile) ? t("common.admin") : PARTICIPANT_LABELS[participantType as ParticipantId] ?? (profile?.role || t("common.buyerRenter"))}
                    </p>
                    <Link
                      to="/pricing"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/15"
                    >
                      <Zap className="w-3 h-3" />{" "}
                      {subscriptionLoading
                        ? t("dashboard.billing")
                        : isPro
                          ? t("common.proActive")
                          : t("common.upgrade")}
                    </Link>
                    {isInvestorMode(profile) && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">
                        <Flame className="w-3 h-3" /> {t("nav.investorDashboard")}
                      </p>
                    )}
                  </div>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="flex items-center gap-2 cursor-pointer">
                      <LayoutDashboard className="w-3.5 h-3.5" /> {t("nav.dashboard")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/listings" className="flex items-center gap-2 cursor-pointer">
                      <Search className="w-3.5 h-3.5" /> {t("nav.listings")}
                    </Link>
                  </DropdownMenuItem>
                  {canListProperty && (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard/listings" className="flex items-center gap-2 cursor-pointer">
                        <Building2 className="w-3.5 h-3.5" /> {t("dashboard.myListings")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/messages" className="flex items-center gap-2 cursor-pointer">
                      <MessageSquare className="w-3.5 h-3.5" /> {t("nav.messages")}
                    </Link>
                  </DropdownMenuItem>
                  {eligibleForQuickSale && (
                    <DropdownMenuItem asChild>
                      <Link to="/investor-dashboard" className="flex items-center gap-2 cursor-pointer">
                        <Flame className="w-3.5 h-3.5" /> {t("nav.quickSale")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isPlatformAdmin(profile) && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="w-3.5 h-3.5" /> {t("nav.adminDashboard")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> {t("nav.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Keep the upgrade CTA visible, while active Pro status lives in the account menu. */}
              {!isPro && !subscriptionLoading && (
                <Link
                  to="/pricing"
                  className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-bold transition-all ${
                    forceLight
                      ? "bg-white/15 border-white/30 text-white/90 hover:bg-white/25"
                      : "bg-primary/10 border-primary/25 text-primary hover:bg-primary/20"
                  }`}
                >
                  <Zap className="w-3 h-3" /> {t("common.upgrade")}
                </Link>
              )}
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={`h-10 rounded-full ${forceLight ? "text-white/90 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-foreground"}`}
                asChild
              >
                <Link to="/login">{t("nav.signIn")}</Link>
              </Button>
              <Button size="sm" className="h-10 rounded-full bg-gradient-primary border-0 text-primary-foreground hover:opacity-90" asChild>
                <Link to="/signup">{t("common.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button — 44px touch target */}
        <button
          className={`xl:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${
            forceLight ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t("common.closeMenu") : t("common.openMenu")}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="xl:hidden fixed top-16 left-0 right-0 z-50 max-h-[calc(100svh-4rem-var(--bottom-nav-h,56px)-env(safe-area-inset-bottom,0px))] overflow-y-auto bg-card/95 backdrop-blur-xl border-b border-border px-4 py-4 space-y-1 shadow-elevated">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`flex items-center gap-2 min-h-[44px] px-3 py-2.5 rounded-lg text-sm transition-colors ${
                link.accent === "flame"
                  ? isActive(link.href)
                    ? "text-destructive-foreground bg-destructive font-semibold"
                    : "text-destructive hover:text-destructive hover:bg-destructive/10"
                  : link.accent === "dooropen"
                    ? "text-primary/80 hover:text-primary hover:bg-primary/10"
                    : link.accent === "subtle"
                      ? "text-muted-foreground/80 hover:text-foreground hover:bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              {link.accent === "flame" && <span>🔥</span>}
              {link.accent === "dooropen" && <DoorOpen className="w-4 h-4 shrink-0" />}
              {link.label}
              {link.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{link.badge}</span>
              )}
              {link.accent === "subtle" && <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />}
            </Link>
          ))}
          <div className="pt-2 flex gap-2">
            {user ? (
              <>
                <Button variant="outline" size="sm" className="flex-1 border-border" asChild>
                  <Link to="/dashboard" onClick={() => setMobileOpen(false)}>{t("nav.dashboard")}</Link>
                </Button>
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground" onClick={handleSignOut}>
                  {t("nav.signOut")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="flex-1 border-border" asChild>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>{t("nav.signIn")}</Link>
                </Button>
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground" asChild>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>{t("nav.signUp")}</Link>
                </Button>
              </>
            )}
          </div>
          <div className="pt-2 border-t border-border space-y-1">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? t("common.lightMode") : t("common.darkMode")}
            </button>
            <div className="px-1">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
    </header>
    </>
  );
};
export default Navbar;
