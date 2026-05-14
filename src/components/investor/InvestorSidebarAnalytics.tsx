import { MapPin, Building2, Activity, Crown, Clock, MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CityBreakdown {
  city: string;
  deals: number;
  value: string;
  pct: number;
}

interface TypeBreakdown {
  type: string;
  pct: number;
  color: string;
}

interface MarketPulse {
  newThisWeek: number;
  avgDiscountVsAi: string | null;
}

interface Props {
  cityBreakdown: CityBreakdown[];
  typeBreakdown: TypeBreakdown[];
  marketPulse: MarketPulse;
  liveDealsCount: number;
  invitationStatus: "none" | "pending" | "approved" | "rejected";
  canAccessDealFlow: boolean;
  onInviteClick: () => void;
}

export function InvestorSidebarAnalytics({
  cityBreakdown,
  typeBreakdown,
  marketPulse,
  liveDealsCount,
  invitationStatus,
  canAccessDealFlow,
  onInviteClick,
}: Props) {
  return (
    <div className="space-y-4 lg:sticky lg:top-24 self-start">
      {/* Deals by City */}
      <div className="glass-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <p className="font-display font-semibold text-sm">Deals by City</p>
        </div>
        {cityBreakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No deals in your pipeline yet</p>
        ) : (
          <div className="space-y-2.5">
            {cityBreakdown.map(c => (
              <div key={c.city}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{c.city}</span>
                  <span className="font-semibold">{c.deals} · {c.value}</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-primary rounded-full" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deals by Type */}
      <div className="glass-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-3.5 h-3.5 text-primary" />
          <p className="font-display font-semibold text-sm">Deals by Type</p>
        </div>
        {typeBreakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No deals in your pipeline yet</p>
        ) : (
          <div className="space-y-2.5">
            {typeBreakdown.map(t => (
              <div key={t.type} className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${t.color}`} />
                <span className="text-xs text-muted-foreground flex-1">{t.type}</span>
                <span className="text-xs font-bold">{t.pct}%</span>
                <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${t.color}`} style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Market Pulse */}
      <div className="glass-card rounded-2xl border border-brand-gold/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-3.5 h-3.5 text-brand-gold" />
          <p className="font-display font-semibold text-sm">Market Pulse</p>
          <div className="ml-auto w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
        </div>
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">New deals this week</span>
            <span className="font-bold text-brand-emerald">+{marketPulse.newThisWeek}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Avg. days to close</span>
            <span className="font-bold text-primary">—</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Live deals</span>
            <span className="font-bold text-brand-emerald">{liveDealsCount} live deals</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Avg. asking vs AI</span>
            <span className="font-bold text-brand-emerald">
              {marketPulse.avgDiscountVsAi !== null ? `−${marketPulse.avgDiscountVsAi}%` : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Access CTA for non-subscribed */}
      {!canAccessDealFlow && (
        <div className="glass-card rounded-2xl border border-primary/20 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-full bg-primary/5" />
          <div className="relative">
            <Crown className="w-5 h-5 text-primary mb-3" />
            <h4 className="font-display font-bold text-sm mb-1">Quick Sale™ access is by invitation only</h4>
            {invitationStatus === "pending" ? (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Your application is <strong className="text-brand-gold">under review</strong>. We'll contact you by email within 48 hours.
              </p>
            ) : invitationStatus === "rejected" ? (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Your previous application wasn't approved. You may re-apply below.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Request an invitation to join the deal flow and get seller contacts, full AI reports, and real-time deal alerts.
              </p>
            )}
            {invitationStatus === "pending" ? (
              <div className="flex items-center gap-2 text-xs text-brand-gold font-semibold">
                <Clock className="w-3.5 h-3.5" /> Application pending — we'll be in touch
              </div>
            ) : (
              <Button className="w-full bg-gradient-primary border-0 text-primary-foreground text-xs h-9" onClick={onInviteClick}>
                <MailPlus className="w-3.5 h-3.5 mr-1.5" />
                {invitationStatus === "rejected" ? "Re-apply for access" : "Request invitation"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
