import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, CheckCircle, Lock, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { type NavKey, type NavItemResolved, NAV_LABEL_KEYS } from "@/lib/dashboardNav";

// Re-export the canonical nav type so DashboardMobileNav can import it from here.
export type DashboardNavItem = NavItemResolved;

interface Props {
  navItems: DashboardNavItem[];
  activeSection: NavKey;
  onSelect: (key: NavKey) => void;
  onSignOut: () => void;
  displayName: string;
  roleLabel: string;
  invitationRequestStatus: "none" | "pending" | "approved" | "rejected";
  profileVerified: boolean;
  profileRole: string | null | undefined;
  pendingLeadsCount: number;
}

/**
 * Dashboard left sidebar (desktop only).
 *
 * Extracted from Dashboard.tsx so its three-way nav-item rendering
 * (locked / external href / active button) is isolated and unit-testable.
 * The parent passes raw nav items + handlers; the sidebar owns no state.
 */
export function DashboardSidebar({
  navItems,
  activeSection,
  onSelect,
  onSignOut,
  displayName,
  roleLabel,
  invitationRequestStatus,
  profileVerified,
  profileRole,
  pendingLeadsCount,
}: Props) {
  const { t } = useTranslation();
  return (
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
              {invitationRequestStatus === "pending" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/25 font-bold uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Pending
                </span>
              )}
              {invitationRequestStatus === "rejected" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-bold uppercase tracking-wide">
                  Not approved
                </span>
              )}
              <ProfileVerifiedBadge verified={profileVerified} role={profileRole} />
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <DashboardNavItemRow
            key={item.key}
            item={item}
            active={activeSection === item.key}
            pendingLeadsCount={pendingLeadsCount}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </aside>
  );
}

interface RowProps {
  item: DashboardNavItem;
  active: boolean;
  pendingLeadsCount: number;
  onSelect: (key: NavKey) => void;
  t: (key: string) => string;
}

function DashboardNavItemRow({ item, active, pendingLeadsCount, onSelect, t }: RowProps) {
  if (item.locked) {
    return (
      <div
        aria-label={`${t(NAV_LABEL_KEYS[item.key])} \u2014 available on Pro`}
        role="presentation"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/40 cursor-not-allowed select-none"
      >
        <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{t(NAV_LABEL_KEYS[item.key])}</span>
        <Lock className="w-3 h-3 ml-auto shrink-0 text-muted-foreground/40" aria-hidden="true" />
        <span className="sr-only">(Pro only)</span>
      </div>
    );
  }
  if (item.href) {
    return (
      <Link
        to={item.href}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
          "text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        {t(NAV_LABEL_KEYS[item.key])}
      </Link>
    );
  }
  return (
    <button
      onClick={() => onSelect(item.key)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {t(NAV_LABEL_KEYS[item.key])}
      {item.key === "leads" && pendingLeadsCount > 0 && (
        <span
          className="ml-auto text-[10px] font-bold bg-brand-gold text-background rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
          aria-label={`${pendingLeadsCount} pending`}
        >
          {pendingLeadsCount}
        </span>
      )}
    </button>
  );
}

function ProfileVerifiedBadge({ verified, role }: { verified: boolean; role: string | null | undefined }) {
  if (verified) return <CheckCircle className="w-3 h-3 text-primary" />;
  if (role === "professional") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 font-semibold">
        ⏳ Pending
      </span>
    );
  }
  return null;
}
