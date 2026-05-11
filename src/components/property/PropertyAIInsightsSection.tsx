/**
 * Displays AI Market Insights (vs-market %, rental yield, AI estimate)
 * fetched from the property-valuation edge function.
 *
 * Data loading lives in PropertyDetail.tsx; this component is pure display.
 */

import type { User } from "@supabase/supabase-js";
import { Zap, Lock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { SignInForAI } from "@/components/SignInForAI";

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

export function PropertyAIInsightsSection({ user, isPro, loading, data }: Props) {
  return (
    <Section>
      <SectionHeader
        icon={Zap}
        title="AI Market Insights"
        badge={<span className="text-[10px] text-muted-foreground">Powered by mAI Prop OS</span>}
      />
      <div className="p-5 space-y-4">
        {!user && <SignInForAI feature="AI Market Insights" />}

        {/* Logged-in non-Pro: show upgrade CTA instead of "unavailable" */}
        {user && !isPro && (
          <div className="text-center space-y-3 py-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              AI Market Insights — price vs market, rental yield, and AI estimate — are a Pro feature.
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3.5 h-3.5" /> Upgrade to Pro
            </Link>
          </div>
        )}

        {user && isPro && loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Analysing market data…</span>
          </div>
        )}

        {user && isPro && !loading && data && (() => {
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
                    €{(data.estimatedValue / 1000).toFixed(0)}k
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">Confidence: {data.confidenceLabel}</p>
              </div>
            </div>
          );
        })()}

        {user && isPro && !loading && !data && (
          <p className="text-xs text-muted-foreground text-center py-4">Market analysis unavailable</p>
        )}
      </div>
    </Section>
  );
}
