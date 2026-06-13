/**
 * Dashboard navigation configuration.
 * Extracted from Dashboard.tsx — defines the nav items, per-role visibility,
 * and the helper that resolves which items are unlocked vs locked for a given user.
 */

import type { ElementType } from "react";
import {
  Home, BarChart2, MessageSquare, Heart, Settings, User,
  Building2, Gavel, Calendar, Bookmark, Wrench, CreditCard,
  FolderKanban, Users, Briefcase, TrendingUp, Globe2, FileText,
} from "lucide-react";

export type NavKey =
  | "overview" | "listings" | "analytics" | "saved" | "saved-searches"
  | "messages" | "viewings" | "auctions" | "open-houses" | "services" | "booking" | "leads"
  | "deal-flow" | "contacts" | "projects" | "portfolios" | "data-input"
  | "billing" | "profile" | "settings";

export type DashboardRole =
  | "buyer" | "seller" | "agent" | "professional"
  | "developer" | "investor" | "institutional" | "admin";

export interface NavItemDef {
  icon: ElementType;
  label: string;
  key: NavKey;
  href?: string;
}

export type NavItemResolved =
  | { icon: ElementType; label: string; key: NavKey; href?: string; locked?: false }
  | { icon: ElementType; label: string; key: NavKey; locked: true };

/** Maps NavKey → i18n translation key */
export const NAV_LABEL_KEYS: Record<NavKey, string> = {
  "overview":       "dashNav.overview",
  "deal-flow":      "dashNav.investorDashboard",
  "listings":       "dashNav.myListings",
  "analytics":      "dashNav.analytics",
  "saved":          "dashNav.saved",
  "saved-searches": "dashNav.savedSearches",
  "messages":       "dashNav.messages",
  "viewings":       "dashNav.viewings",
  "auctions":       "dashNav.auctionAlerts",
  "open-houses":    "dashNav.openHouses",
  "services":       "dashNav.myServices",
  "booking":        "dashNav.booking",
  "leads":          "dashNav.leads",
  "contacts":       "dashNav.contacts",
  "projects":       "dashNav.projects",
  "portfolios":     "dashNav.portfolios",
  "data-input":     "dashNav.dataInput",
  "billing":        "dashNav.billing",
  "profile":        "dashNav.profile",
  "settings":       "dashNav.settings",
};

export const ALL_NAV_ITEMS: NavItemDef[] = [
  { icon: Home,          label: "Overview",           key: "overview"       },
  { icon: FolderKanban,  label: "Investor Dashboard", key: "deal-flow",     href: "/investor-dashboard" },
  { icon: Building2,     label: "My Listings",        key: "listings"       },
  { icon: BarChart2,     label: "Analytics",          key: "analytics"      },
  { icon: Heart,         label: "Saved",              key: "saved"          },
  { icon: Bookmark,      label: "Saved Searches",     key: "saved-searches" },
  { icon: MessageSquare, label: "Messages",           key: "messages"       },
  { icon: Calendar,      label: "Viewings",           key: "viewings"       },
  { icon: Gavel,         label: "Auction Alerts",     key: "auctions"       },
  { icon: Calendar,      label: "Open Houses",        key: "open-houses"    },
  { icon: Wrench,        label: "My Services",        key: "services"       },
  { icon: FolderKanban,  label: "Booking Calendar",   key: "booking"        },
  { icon: Briefcase,     label: "Leads CRM",          key: "leads"          },
  { icon: Users,         label: "Contacts",           key: "contacts"       },
  { icon: Globe2,        label: "Projects",           key: "projects"       },
  { icon: TrendingUp,    label: "Portfolios",         key: "portfolios"     },
  { icon: FileText,      label: "Data Input",         key: "data-input"     },
  { icon: CreditCard,    label: "Billing",            key: "billing"        },
  { icon: User,          label: "Profile",            key: "profile"        },
  { icon: Settings,      label: "Settings",           key: "settings"       },
];

const NAV_PRO: Record<string, NavKey[]> = {
  buyer:         ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  seller:        ["overview", "listings", "saved", "saved-searches", "messages", "viewings", "open-houses", "billing", "profile", "settings"],
  agent:         ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "leads", "contacts", "data-input", "billing", "profile", "settings"],
  developer:     ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "open-houses", "leads", "contacts", "projects", "portfolios", "billing", "profile", "settings"],
  professional:  ["overview", "services", "booking", "leads", "contacts", "analytics", "messages", "viewings", "billing", "profile", "settings"],
  investor:      ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  institutional: ["overview", "saved", "saved-searches", "listings", "messages", "viewings", "auctions", "open-houses", "contacts", "billing", "profile", "settings"],
  admin:         ["overview", "deal-flow", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "services", "booking", "leads", "contacts", "projects", "portfolios", "data-input", "billing", "profile", "settings"],
};

const NAV_FREE: Record<string, NavKey[]> = {
  buyer:         ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  seller:        ["overview", "listings", "saved", "messages", "viewings", "open-houses", "billing", "profile", "settings"],
  agent:         ["overview", "listings", "saved", "messages", "viewings", "auctions", "open-houses", "data-input", "billing", "profile", "settings"],
  developer:     ["overview", "listings", "open-houses", "messages", "billing", "profile", "settings"],
  professional:  ["overview", "billing", "profile", "settings"],
  investor:      ["overview", "saved", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  institutional: ["overview", "saved", "listings", "messages", "viewings", "auctions", "billing", "profile", "settings"],
  admin:         ["overview", "deal-flow", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "services", "booking", "leads", "contacts", "projects", "portfolios", "data-input", "billing", "profile", "settings"],
};

export function getNavItemsForBioType(
  _bioType: string | null,
  role: DashboardRole,
  isPro: boolean,
  eligibleForQuickSale = false,
): NavItemResolved[] {
  if (role === "admin") return ALL_NAV_ITEMS.filter(i => NAV_PRO.admin.includes(i.key));

  const key = (
    role === "seller"        ? "seller" :
    role === "professional"  ? "professional" :
    role === "agent"         ? "agent" :
    role === "developer"     ? "developer" :
    role === "investor"      ? "investor" :
    role === "institutional" ? "institutional" :
    "buyer"
  );

  const proKeys: NavKey[] = NAV_PRO[key] ?? NAV_PRO.buyer;
  let freeKeys: NavKey[] = NAV_FREE[key] ?? NAV_FREE.buyer;

  if (eligibleForQuickSale && key === "buyer" && !freeKeys.includes("deal-flow")) {
    freeKeys = [...freeKeys, "deal-flow"];
  }

  if (isPro) return ALL_NAV_ITEMS.filter(i => proKeys.includes(i.key));

  const unlocked = ALL_NAV_ITEMS.filter(i => freeKeys.includes(i.key));
  const locked = ALL_NAV_ITEMS
    .filter(i => proKeys.includes(i.key) && !freeKeys.includes(i.key))
    .map(i => ({ icon: i.icon, label: i.label, key: i.key, locked: true as const }));
  return [...unlocked, ...locked];
}
