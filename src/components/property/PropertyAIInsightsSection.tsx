/**
 * Displays AI Market Insights (vs-market %, rental yield, AI estimate)
 * fetched from the property-valuation edge function.
 */

import type { User } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { Zap, Loader2, Sparkles, ArrowUpRight, RotateCw } from "lucide-react";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { SignInForAI } from "@/components/SignInForAI";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { AIInsightsQuota } from "@/hooks/usePropertyAIInsights";

interface AIInsightsData {
  vsMarket: number;
  rentalYield: number;
  estimatedValue: number;
  marketComparison: string;
  confidenceLabel: string;
}

interface Props {
  user: User | null;
  isPro: boolean;
  loading: boolean;
  data: AIInsightsData | null;
  quota?: AIInsightsQuota | null;
  quotaLoading?: boolean;
  hasRequested?: boolean;
  onLoad?: () => void;
}

const COMPARISON_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  below_market: {
    label: "Below Market",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  at_market: {
    label: "At Market",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
  },
  above_market: {
    label: "Above Market",
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  },
};

const UNLIMITED_AI_LIMIT = 999_999;

function formatQuotaText(quota: AIInsightsQuota | null | undefined, isPro: boolean, quotaLoading?: boolean) {
  if (quotaLoading) return "Checking AI request allowance...";
  if (!quota) return "AI request allowance will be checked before loading.";
  if (quota.limit >= UNLIMITED_AI_LIMIT) return "Unlimited AI insight requests this month";
  const tier = isPro ? "Pro" : "Free";
  return `${Math.max(quota.limit - quota.used, 0)} of ${quota.limit} ${tier} AI insight requests remaining this month`;
}

export function PropertyAIInsightsSection({
  user,
  isPro,
  loading,
  data,
  quota,
  quotaLoading,
  hasRequested = false,
  onLoad,
}: Props) {
  const quotaReached = !!quota && quota.limit < UNLIMITED_AI_LIMIT && quota.used >= quota.limit;
  const loadLabel = data ? "Refresh AI insights" : "Load AI insights";
  const quotaText = formatQuotaText(quota, isPro, quotaLoading);

  return (
    <Section>
      <SectionHeader
        icon={Zap}
        title="AI Market Insights"
        badge={<span className="text-[10px] text-muted-foreground">Powered by mAI Prop OS</span>}
      />
      <div className="p-5 space-y-4">
        {!user && <SignInForAI feature="AI Market Insights" />}

        {user && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Run AI analysis when you need it</p>
              <p className="mt-1 text-xs text-muted-foreground">{quotaText}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {quotaReached ? (
                <Button asChild size="sm" className="gap-2">
                  <Link to="/pricing">
                    Upgrade to Pro
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={onLoad}
                  disabled={loading || quotaLoading || !onLoad}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : data ? (
                    <RotateCw className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {loading ? "Loading insights..." : loadLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        {user && loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Analysing market data...</span>
          </div>
        )}

        {user && !loading && data && (() => {
          const cmp = COMPARISON_CONFIG[data.marketComparison] ?? COMPARISON_CONFIG.at_market;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`rounded-xl border p-4 flex flex-col gap-1 ${cmp.bg}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">vs Market</p>
                <div className="flex items-baseline gap-1">
                  <span className={`font-display font-black text-3xl ${cmp.color}`}>
                    {data.vsMarket > 0 ? "+" : ""}{data.vsMarket}%
                  </span>
                </div>
                <p className={`text-[10px] font-semibold ${cmp.color}`}>{cmp.label}</p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Rental Yield</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-black text-3xl text-primary">{data.rentalYield}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Est. gross annual yield</p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">AI Estimate</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-black text-3xl text-foreground">
                    {formatPrice(data.estimatedValue)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">Confidence: {data.confidenceLabel}</p>
              </div>
            </div>
          );
        })()}

        {user && !loading && !data && hasRequested && (
          <p className="text-xs text-muted-foreground text-center py-4">Market analysis unavailable</p>
        )}
      </div>
    </Section>
  );
}
