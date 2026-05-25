import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { type NavKey, NAV_LABEL_KEYS } from "@/lib/dashboardNav";
import type { DashboardNavItem } from "./DashboardSidebar";

interface Props {
  navItems: DashboardNavItem[];
  activeSection: NavKey;
  onSelect: (key: NavKey) => void;
  onSignOut: () => void;
  pendingLeadsCount: number;
}

/**
 * Dashboard horizontal nav for mobile (md:hidden).
 *
 * Mirrors DashboardSidebar's three-way item rendering (locked / external href /
 * active button) in a compact bottom-fixed strip. Extracted so the parent
 * Dashboard.tsx no longer carries two copies of nav-item rendering logic.
 */
export function DashboardMobileNav({ navItems, activeSection, onSelect, pendingLeadsCount }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border overflow-x-auto scrollbar-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14 min-w-max">
        {navItems.map((item) => (
          <MobileNavItem
            key={item.key}
            item={item}
            active={activeSection === item.key}
            pendingLeadsCount={pendingLeadsCount}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

interface ItemProps {
  item: DashboardNavItem;
  active: boolean;
  pendingLeadsCount: number;
  onSelect: (key: NavKey) => void;
  t: (key: string) => string;
}

function MobileNavItem({ item, active, pendingLeadsCount, onSelect, t }: ItemProps) {
  if (item.locked) {
    return (
      <div
        title="Available on Pro"
        className="flex flex-col items-center justify-center gap-0.5 px-3 text-[10px] font-semibold text-muted-foreground/40 whitespace-nowrap min-w-16 relative cursor-not-allowed select-none"
      >
        <item.icon className="w-4 h-4" />
        {t(NAV_LABEL_KEYS[item.key])}
        <Lock className="absolute top-1 right-1.5 w-2.5 h-2.5 text-muted-foreground/40" />
      </div>
    );
  }
  if (item.href) {
    return (
      <Link
        to={item.href}
        className="flex flex-col items-center justify-center gap-0.5 px-3 text-[10px] font-semibold transition-colors whitespace-nowrap min-w-16 relative text-muted-foreground hover:text-foreground"
      >
        <item.icon className="w-4 h-4" />
        {t(NAV_LABEL_KEYS[item.key])}
      </Link>
    );
  }
  return (
    <button
      onClick={() => onSelect(item.key)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 px-3 text-[10px] font-semibold transition-colors whitespace-nowrap min-w-16 relative border-t-2",
        active ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent",
      )}
    >
      <item.icon className="w-4 h-4" />
      {t(NAV_LABEL_KEYS[item.key])}
      {item.key === "leads" && pendingLeadsCount > 0 && (
        <span className="absolute top-1 right-1.5 text-[8px] font-bold bg-brand-gold text-background rounded-full w-3.5 h-3.5 flex items-center justify-center">
          {pendingLeadsCount}
        </span>
      )}
    </button>
  );
}
