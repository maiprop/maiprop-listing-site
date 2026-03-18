import { Link, useLocation } from "react-router-dom";
import { Home, Search, Gavel, User, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home, exact: true },
  { label: "Buy", href: "/listings?listing_type=sale", icon: Search, exact: false, matchPath: "/listings" },
  { label: "Auctions", href: "/auctions", icon: Gavel, exact: false },
  { label: "Browse", href: "/listings", icon: Building2, exact: false, matchPath: "/listings", hidden: true },
];

const BOTTOM_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Buy", href: "/listings?listing_type=sale", matchPath: "/listings", icon: Search },
  { label: "Auctions", href: "/auctions", icon: Gavel },
  { label: "Account", href: "/dashboard", matchPath: "/dashboard", icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Hide on pages that have their own bottom navigation
  const hiddenRoutes = ["/messages", "/dashboard", "/onboarding", "/login", "/signup"];
  if (hiddenRoutes.some(r => location.pathname.startsWith(r))) return null;

  const isActive = (item: (typeof BOTTOM_NAV_ITEMS)[0]) => {
    const matchPath = "matchPath" in item ? item.matchPath : undefined;
    const pathToCheck = matchPath || item.href.split("?")[0];
    if (pathToCheck === "/") return location.pathname === "/";
    return location.pathname.startsWith(pathToCheck);
  };

  const accountItem = user ? BOTTOM_NAV_ITEMS[3] : { ...BOTTOM_NAV_ITEMS[3], href: "/login", label: "Sign In" };

  const items = [
    BOTTOM_NAV_ITEMS[0],
    BOTTOM_NAV_ITEMS[1],
    BOTTOM_NAV_ITEMS[2],
    accountItem,
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {items.map((item) => {
          const active = isActive(item as any);
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
