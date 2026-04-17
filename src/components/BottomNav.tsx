import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Search,
  Gavel,
  User,
  Building2,
  Flame,
  Calendar,
  MessageSquare,
  Briefcase,
  Users,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { getParticipantTypeFromProfile, isInvestorMode } from "@/lib/participantConfig";
import { cn } from "@/lib/utils";

type BottomTab = {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  matchPaths?: string[];
};

function getBottomTabs(
  type: string,
  investorMode: boolean,
  isLoggedIn: boolean
): BottomTab[] {
  const account: BottomTab = {
    labelKey: "bottomNav.account",
    icon: User,
    href: isLoggedIn ? "/dashboard" : "/login",
  };

  switch (type) {
    case "institutional":
    case "seller":
      return [
        { labelKey: "bottomNav.home", icon: Home, href: "/" },
        { labelKey: "bottomNav.listings", icon: Building2, href: "/dashboard/listings", matchPaths: ["/listings/new", "/dashboard"] },
        { labelKey: "bottomNav.market", icon: Search, href: "/listings" },
        { labelKey: "bottomNav.messages", icon: MessageSquare, href: "/messages" },
        account,
      ];
    case "agent":
      return [
        { labelKey: "bottomNav.home", icon: Home, href: "/" },
        { labelKey: "bottomNav.listings", icon: Building2, href: "/dashboard/listings" },
        { labelKey: "bottomNav.leads", icon: Briefcase, href: "/dashboard/leads" },
        { labelKey: "bottomNav.messages", icon: MessageSquare, href: "/messages" },
        account,
      ];
    case "developer":
      return [
        { labelKey: "bottomNav.home", icon: Home, href: "/" },
        { labelKey: "bottomNav.projects", icon: Layers, href: "/projects", matchPaths: ["/dashboard/projects"] },
        { labelKey: "bottomNav.listings", icon: Building2, href: "/dashboard/listings" },
        { labelKey: "bottomNav.messages", icon: MessageSquare, href: "/messages" },
        account,
      ];
    case "professional":
      return [
        { labelKey: "bottomNav.home", icon: Home, href: "/" },
        { labelKey: "bottomNav.services", icon: Briefcase, href: "/professionals/me" },
        { labelKey: "bottomNav.directory", icon: Users, href: "/professionals" },
        { labelKey: "bottomNav.messages", icon: MessageSquare, href: "/messages" },
        account,
      ];
    default: // buyer
      return [
        { labelKey: "bottomNav.home", icon: Home, href: "/" },
        { labelKey: "bottomNav.browse", icon: Search, href: "/listings" },
        {
          labelKey: investorMode ? "bottomNav.deals" : "bottomNav.auctions",
          icon: investorMode ? Flame : Gavel,
          href: investorMode ? "/firesale" : "/auctions",
        },
        { labelKey: "bottomNav.openHouses", icon: Calendar, href: "/open-houses" },
        account,
      ];
  }
}

export function BottomNav() {
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t } = useTranslation();

  // Hide on pages that have their own bottom navigation
  const hiddenRoutes = ["/messages", "/dashboard", "/onboarding", "/login", "/signup", "/ai-assistant"];
  if (hiddenRoutes.some((r) => location.pathname.startsWith(r))) return null;

  const participantType = getParticipantTypeFromProfile(profile);
  const investorMode = isInvestorMode(profile);
  const tabs = getBottomTabs(participantType, investorMode, !!user);

  const isActive = (tab: BottomTab): boolean => {
    const pathsToCheck = tab.matchPaths
      ? [tab.href.split("?")[0], ...tab.matchPaths]
      : [tab.href.split("?")[0]];

    for (const p of pathsToCheck) {
      if (p === "/") {
        if (location.pathname === "/") return true;
      } else if (location.pathname.startsWith(p)) {
        return true;
      }
    }
    return false;
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        ["--bottom-nav-h" as unknown as keyof React.CSSProperties]: "56px",
      }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.labelKey}
              to={tab.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon
                className={cn("w-5 h-5 shrink-0", active && "text-primary")}
                strokeWidth={active ? 2.5 : 1.75}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {t(tab.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
