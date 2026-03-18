import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Home, Search, Gavel, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type BottomNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPath?: string;
  matchListingType?: "sale" | "rent";
};

const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Browse", href: "/listings?listing_type=sale", matchPath: "/listings", matchListingType: "sale", icon: Search },
  { label: "Auctions", href: "/auctions", icon: Gavel },
  { label: "Account", href: "/dashboard", matchPath: "/dashboard", icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Hide on pages that have their own bottom navigation
  const hiddenRoutes = ["/messages", "/dashboard", "/onboarding", "/login", "/signup", "/ai-assistant"];
  if (hiddenRoutes.some(r => location.pathname.startsWith(r))) return null;

  const isActive = (item: BottomNavItem) => {
    const matchPath = "matchPath" in item ? item.matchPath : undefined;
    const pathToCheck = matchPath || item.href.split("?")[0];
    if (pathToCheck === "/") return location.pathname === "/";
    if (!location.pathname.startsWith(pathToCheck)) return false;
    // listing_type highlighting when on /listings
    if (pathToCheck === "/listings" && item.matchListingType) {
      const have = new URLSearchParams(location.search).get("listing_type") || "sale";
      return have === item.matchListingType;
    }
    return true;
  };

  const baseAccount = BOTTOM_NAV_ITEMS[3];
  const accountItem: BottomNavItem = user ? baseAccount : { ...baseAccount, href: "/login", label: "Sign In" };

  const items: BottomNavItem[] = [
    BOTTOM_NAV_ITEMS[0],
    BOTTOM_NAV_ITEMS[1],
    BOTTOM_NAV_ITEMS[2],
    accountItem,
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // Used by .pb-bottom-nav helper to reserve space for content
        ["--bottom-nav-h" as unknown as keyof React.CSSProperties]: "56px",
      }}
    >
      <div className="flex items-stretch h-14">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("w-5 h-5 shrink-0", active && "text-primary")}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span className={cn("text-[10px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
