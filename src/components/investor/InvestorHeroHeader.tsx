import { Crown, Flame, DollarSign, TrendingUp, FileCheck, MailPlus, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Subscription {
  tier: "private" | "institutional" | "developer";
  status: "active" | "cancelled" | "expired" | "trial";
}

interface Props {
  dealsCount: number;
  totalValue: number;
  newDealsThisWeek: number;
  avgValueSpread: number | null;
  valuedDealsCount: number;
  subscription: Subscription | null;
  subscribed: boolean;
  showInviteCta: boolean;
  onInviteClick: () => void;
}

export function InvestorHeroHeader({
  dealsCount,
  totalValue,
  newDealsThisWeek,
  avgValueSpread,
  valuedDealsCount,
  subscription,
  subscribed,
  showInviteCta,
  onInviteClick,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="relative border-b border-border overflow-hidden">
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 80% at 10% 50%, hsl(265 80% 60% / 0.08), transparent 60%), radial-gradient(ellipse 50% 60% at 90% 30%, hsl(183 100% 42% / 0.06), transparent 60%)"
      }} />
      <div className="container relative py-7 sm:py-10">
        <div className="flex items-start justify-between flex-wrap gap-4 sm:gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-3 sm:mb-4">
              <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {t("investor.hero.badge")}
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-black mb-2 sm:mb-3">
              {t("investor.hero.title")} <br />
              <span className="gradient-text-primary">{t("investor.hero.titleHighlight")}</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-sm">
              {t("investor.hero.subtitle")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1.5 text-xs bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald px-3 py-1.5 rounded-full font-semibold">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-pulse" />
                {t("investor.hero.liveDeals", { count: dealsCount })}
              </div>
              {showInviteCta && (
                <button
                  type="button"
                  onClick={onInviteClick}
                  className="inline-flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-semibold hover:bg-primary/20 transition-colors"
                >
                  <MailPlus className="w-3 h-3" />
                  {t("investor.hero.requestInvitation")}
                </button>
              )}
            </div>
            {subscribed && subscription && (
              <div className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-bold capitalize">
                <Crown className="w-3 h-3" />
                {t("investor.hero.planActive", { tier: subscription.tier })}
              </div>
            )}
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-5 sm:mt-8">
          {[
            { label: t("investor.kpi.liveDeals"), value: String(dealsCount), delta: t("investor.kpi.liveDealsThisWeek", { count: newDealsThisWeek }), icon: Flame, color: "text-destructive" },
            { label: t("investor.kpi.totalDealValue"), value: `€${(totalValue / 1_000_000).toFixed(1)}M`, delta: t("investor.kpi.totalDealValueDelta"), icon: DollarSign, color: "text-primary" },
            { label: t("investor.kpi.avgValueSpread"), value: avgValueSpread == null ? "—" : `${avgValueSpread > 0 ? "+" : ""}${avgValueSpread}%`, delta: t("investor.kpi.avgValueSpreadDelta"), icon: TrendingUp, color: "text-brand-emerald" },
            { label: t("investor.kpi.valuationCoverage"), value: `${valuedDealsCount}/${dealsCount}`, delta: t("investor.kpi.valuationCoverageDelta"), icon: FileCheck, color: "text-brand-gold" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-3 sm:p-4 border border-border">
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</p>
                <s.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${s.color}`} />
              </div>
              <p className={`font-display font-black text-xl sm:text-2xl ${s.color}`}>{s.value}</p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1">{s.delta}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-8 flex-wrap">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground">
            <LayoutGrid className="w-3.5 h-3.5" />
            {t("investor.hero.tabDealFeed")}
          </button>
        </div>
      </div>
    </div>
  );
}
