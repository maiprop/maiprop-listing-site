/**
 * Plan & Usage card for Dashboard Overview.
 * Shows current plan (Free/Pro), usage vs limits, and upgrade CTA when relevant.
 */

import { Link } from "react-router-dom";
import { Crown, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPlanLimits, type PlanAudienceId } from "@/hooks/usePlanLimits";
import { getPlanForParticipant } from "@/lib/rolePlanMap";

type Usage = {
  savedSearches: number;
  searchAlerts: number;
  viewingsThisMonth: number;
  auctionAlerts: number;
  listings: number;
};

type Props = {
  audience: PlanAudienceId;
  isPro: boolean;
  hasPaidPromotionCredits?: boolean;
  usage: Usage;
  className?: string;
};

export function DashboardPlanCard({
  audience,
  isPro,
  hasPaidPromotionCredits = false,
  usage,
  className,
}: Props) {
  const tier = isPro ? "pro" : "free";
  const limits = getPlanLimits(audience, tier);

  // Build usage rows for display
  const rows: { label: string; used: number; limit: number | null; atLimit: boolean }[] = [];

  if (audience === "buyer") {
    if (limits.savedSearches != null) rows.push({ label: "Saved searches", used: usage.savedSearches, limit: limits.savedSearches, atLimit: usage.savedSearches >= (limits.savedSearches ?? 0) });
    if (limits.searchAlerts != null) rows.push({ label: "Search alerts", used: usage.searchAlerts, limit: limits.searchAlerts, atLimit: usage.searchAlerts >= (limits.searchAlerts ?? 0) });
    if (limits.viewingsPerMonth != null) rows.push({ label: "Viewings this month", used: usage.viewingsThisMonth, limit: limits.viewingsPerMonth, atLimit: usage.viewingsThisMonth >= (limits.viewingsPerMonth ?? 0) });
    if (limits.auctionAlerts != null) rows.push({ label: "Auction alerts", used: usage.auctionAlerts, limit: limits.auctionAlerts, atLimit: usage.auctionAlerts >= (limits.auctionAlerts ?? 0) });
  }
  if (audience === "seller" || audience === "agent") {
    if (limits.listings != null) rows.push({ label: "Listings", used: usage.listings, limit: limits.listings, atLimit: usage.listings >= limits.listings });
    if (limits.viewingsPerMonth != null) rows.push({
      label: audience === "agent" ? "Hosted viewings this month" : "Viewing requests this month",
      used: usage.viewingsThisMonth,
      limit: limits.viewingsPerMonth,
      atLimit: usage.viewingsThisMonth >= (limits.viewingsPerMonth ?? 0),
    });
  }
  if (audience === "developer") {
    // Pro only - just show plan status
    rows.push({ label: "Listings", used: usage.listings, limit: null, atLimit: false });
  }
  if (audience === "professional") {
    // Free/Pro - no specific limits in spec for now
  }

  const showUpgrade = !isPro && audience !== "developer" && rows.some(r => r.atLimit);
  const priceLabel = audience === "admin"
    ? null
    : `€${getPlanForParticipant(audience).monthlyPrice}`;

  return (
    <div className={cn("glass-card rounded-xl p-5 border", isPro ? "border-brand-gold/30 bg-brand-gold/5" : "border-border", className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {isPro ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-gold/20 text-brand-gold font-semibold text-sm">
              <Crown className="w-3.5 h-3.5" /> Pro Plan
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium text-sm">
              <Zap className="w-3.5 h-3.5" /> Free Plan
            </span>
          )}
        </div>
        {!isPro && audience !== "developer" && (
          <Button variant="outline" size="sm" className="border-primary text-primary gap-1" asChild>
            <Link to="/pricing">
              Upgrade <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        )}
        {audience === "developer" && !isPro && (
          <Button size="sm" className="bg-gradient-primary text-primary-foreground gap-1" asChild>
            <Link to="/pricing">
              Subscribe <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2 text-sm">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between text-muted-foreground">
              <span>{r.label}</span>
              <span className={cn("font-medium", r.atLimit && !isPro ? "text-destructive" : "text-foreground")}>
                {r.used}
                {r.limit != null && ` / ${r.limit}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {showUpgrade && (
        <p className="text-xs text-muted-foreground mt-3">
          Upgrade to Pro to unlock higher limits. From {priceLabel}/month.
        </p>
      )}

      {audience === "developer" && isPro && (
        <p className="text-xs text-muted-foreground mt-2">
          {hasPaidPromotionCredits
            ? "Unlimited listings, project showcases. Includes 1 Spotlight and 1 Priority Rank per month."
            : "Unlimited listings, project showcases. Promotion credits begin after paid activation."}
        </p>
      )}
    </div>
  );
}
