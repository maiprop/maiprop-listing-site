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
import { UNLIMITED_AI_LIMIT } from "@/hooks/useAiQuota";
import type { AIInsightsQuota } from "@/hooks/usePropertyAIInsights";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { selectPrimaryValuation, type ValuationResponseV2 } from "@/lib/valuationResult";

interface AIInsightsData {
  vsMarket: number | null;
  rentalYield: number | null;
  estimatedValue: number | null;
  pricePerSqmEstimate?: number;
  marketComparison: string | null;
  confidenceLabel: string | null;
  estimateSource?: string | null;
  estimateUnit?: "EUR" | "EUR/month" | null;
  valuation?: ValuationResponseV2;
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
  errorMessage?: string | null;
  limitReached?: boolean;
  listingType?: string | null;
}

const COMPARISON_CONFIG: Record<string, { labelKey: string; fallbackLabel: string; color: string; bg: string }> = {
  below_market: {
    labelKey: "propertyAIInsights.comparison.belowMarket",
    fallbackLabel: "Below Market",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  at_market: {
    labelKey: "propertyAIInsights.comparison.atMarket",
    fallbackLabel: "At Market",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
  },
  above_market: {
    labelKey: "propertyAIInsights.comparison.aboveMarket",
    fallbackLabel: "Above Market",
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  },
};

function formatQuotaText(
  t: TFunction,
  quota: AIInsightsQuota | null | undefined,
  isPro: boolean,
  quotaLoading?: boolean,
) {
  if (quotaLoading) return t("propertyAIInsights.quota.checking", "Checking AI request allowance...");
  if (!quota) return t("propertyAIInsights.quota.pending", "AI request allowance will be checked before loading.");
  if (quota.limit >= UNLIMITED_AI_LIMIT) {
    return t("propertyAIInsights.quota.unlimited", "Unlimited AI insight requests this month");
  }
  const remaining = Math.max(quota.limit - quota.used, 0);
  const defaultValue = isPro
    ? `${remaining} of ${quota.limit} Pro AI insight requests remaining this month`
    : `${remaining} of ${quota.limit} Free AI insight requests remaining this month`;
  return t(
    isPro ? "propertyAIInsights.quota.remainingPro" : "propertyAIInsights.quota.remainingFree",
    {
      remaining,
      limit: quota.limit,
      defaultValue,
    },
  );
}

const CONFIDENCE_KEYS: Record<string, { key: string; fallback: string }> = {
  low: { key: "propertyAIInsights.confidence.low", fallback: "Low" },
  medium: { key: "propertyAIInsights.confidence.medium", fallback: "Medium" },
  high: { key: "propertyAIInsights.confidence.high", fallback: "High" },
  verylow: { key: "propertyAIInsights.confidence.veryLow", fallback: "Very Low" },
  veryhigh: { key: "propertyAIInsights.confidence.veryHigh", fallback: "Very High" },
};

const localizeConfidence = (t: TFunction, confidence: string): string => {
  const normalized = confidence.toLowerCase().replace(/[\s_-]+/g, "");
  const translation = CONFIDENCE_KEYS[normalized];
  return translation ? t(translation.key, translation.fallback) : confidence;
};

export function PropertyAIInsightsSection({
  user,
  isPro,
  loading,
  data,
  quota,
  quotaLoading,
  hasRequested = false,
  onLoad,
  errorMessage,
  limitReached = false,
  listingType,
}: Props) {
  const { t, i18n } = useTranslation();
  const report = data?.valuation;
  const selectedPrimary = selectPrimaryValuation(report);
  const selectedUnit = selectedPrimary?.unit ?? data?.estimateUnit ?? null;
  const isRental = selectedUnit === "EUR/month" || (!selectedUnit && listingType?.toLowerCase() === "rent");
  const quotaReached = limitReached || (!!quota && quota.limit < UNLIMITED_AI_LIMIT && quota.used >= quota.limit);
  const loadLabel = data
    ? t("propertyAIInsights.actions.refresh", "Refresh AI insights")
    : t("propertyAIInsights.actions.load", "Load AI insights");
  const quotaText = formatQuotaText(t, quota, isPro, quotaLoading);
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const numberLocale = isGreek ? "el-GR" : "en-GB";
  const monthUnit = t("propertyAIInsights.units.month", "mo");
  const unavailable = t("propertyAIInsights.unavailable", "Unavailable");
  const rentPerSqm = data?.pricePerSqmEstimate
    ? `€${data.pricePerSqmEstimate.toLocaleString(numberLocale, { maximumFractionDigits: 2 })}/m²/${monthUnit}`
    : unavailable;
  const aiEstimate = data?.estimatedValue == null
    ? unavailable
    : isRental
      ? `${formatPrice(data.estimatedValue)}/${monthUnit}`
      : formatPrice(data.estimatedValue);
  const compactMoney = (value: number, unit: "EUR" | "EUR/month" = "EUR") =>
    `€${value.toLocaleString(numberLocale)}${unit === "EUR/month" ? `/${monthUnit}` : ""}`;

  return (
    <Section>
      <SectionHeader
        icon={Zap}
        title={t("propertyAIInsights.title", "AI Market Insights")}
        badge={<span className="text-[10px] text-muted-foreground">{t("propertyAIInsights.provenance", "Source-labelled analysis")}</span>}
      />
      <div className="p-5 space-y-4">
        {!user && <SignInForAI feature={t("propertyAIInsights.title", "AI Market Insights")} />}

        {user && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{t("propertyAIInsights.prompt", "Run AI analysis when you need it")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{quotaText}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {quotaReached ? (
                <>
                  {!isPro && (
                    <Button asChild size="sm" className="gap-2">
                      <Link to="/pricing">
                        {t("propertyAIInsights.actions.upgrade", "Upgrade to Pro")}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant={isPro ? "default" : "outline"}>
                    <Link to="/dashboard?tab=billing&addon=valuation_single">{t("propertyAIInsights.actions.buyAddon", "Buy AI add-on")}</Link>
                  </Button>
                </>
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
                  {loading ? t("propertyAIInsights.actions.loading", "Loading insights...") : loadLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        {user && loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">{t("propertyAIInsights.analysing", "Analysing market data...")}</span>
          </div>
        )}

        {user && !loading && data && (() => {
          const vsMarket = data.vsMarket;
          const marketComparison = data.marketComparison;
          const hasMarketComparison = vsMarket != null && marketComparison != null;
          const cmp = hasMarketComparison
            ? COMPARISON_CONFIG[marketComparison] ?? COMPARISON_CONFIG.at_market
            : {
                labelKey: "propertyAIInsights.unavailable",
                fallbackLabel: "Unavailable",
                color: "text-muted-foreground",
                bg: "bg-secondary/50 border-border",
              };
          return (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`rounded-xl border p-4 flex flex-col gap-1 ${cmp.bg}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {isRental
                    ? t("propertyAIInsights.labels.vsRentalMarket", "vs Rental Market")
                    : t("propertyAIInsights.labels.vsMarket", "vs Market")}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={`font-display font-black text-3xl ${cmp.color}`}>
                    {hasMarketComparison
                      ? `${vsMarket > 0 ? "+" : ""}${vsMarket}%`
                      : unavailable}
                  </span>
                </div>
                <p className={`text-[10px] font-semibold ${cmp.color}`}>
                  {hasMarketComparison
                    ? t(cmp.labelKey, cmp.fallbackLabel)
                    : isRental
                      ? t("propertyAIInsights.benchmarkMissing.rent", "Rent benchmark not returned")
                      : t("propertyAIInsights.benchmarkMissing.market", "Market benchmark not returned")}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {isRental
                    ? t("propertyAIInsights.labels.rentPerSqmMonth", "Rent / m² / mo")
                    : t("propertyAIInsights.labels.rentalYield", "Rental Yield")}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-black text-3xl text-primary">{isRental ? rentPerSqm : data.rentalYield == null ? unavailable : `${data.rentalYield}%`}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {isRental
                    ? t("propertyAIInsights.labels.rentDensity", "Estimated monthly rent density")
                    : t("propertyAIInsights.labels.grossYield", "Est. gross annual yield")}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/50 p-4 flex flex-col gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {isRental
                    ? t("propertyAIInsights.labels.rentEstimate", "AI Rent Estimate")
                    : t("propertyAIInsights.labels.estimate", "AI Estimate")}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-black text-3xl text-foreground">
                    {aiEstimate}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("propertyAIInsights.labels.confidence", "Confidence")}: {data.confidenceLabel ? localizeConfidence(t, data.confidenceLabel) : unavailable}
                </p>
                <p className="text-[10px] text-muted-foreground">{data.estimateSource === "os_prediction" ? t("propertyAIInsights.source.os", "OS model prediction") : data.estimateSource === "ai_estimate" ? t("propertyAIInsights.source.ai", "Unverified AI estimate") : unavailable}</p>
              </div>
            </div>
            {report && (
              <div className="mt-3 space-y-2 rounded-xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
                {selectedPrimary && <p><strong>Basis:</strong> {selectedPrimary.source === "os_prediction" ? "OS model prediction" : "Unverified AI estimate"} · {selectedPrimary.basis.replace(/_/g, " ")}{report.transaction === "auction" && selectedPrimary.basis === "market_value" ? " · clear-title assumption; documents not verified" : ""}</p>}
                {selectedPrimary?.rangeLow != null && selectedPrimary.rangeHigh != null && <p><strong>Range:</strong> {compactMoney(selectedPrimary.rangeLow, selectedPrimary.unit)} – {compactMoney(selectedPrimary.rangeHigh, selectedPrimary.unit)}</p>}
                {report.providerPrediction?.unit === null && <p><strong>Rental model observation:</strong> {compactMoney(report.providerPrediction.value)} · rental period unavailable</p>}
                {report.transaction === "auction" && report.providerPrediction?.model === "auction" && selectedPrimary?.basis === "market_value" && <p><strong>Separate OS auction-model estimate:</strong> {compactMoney(report.providerPrediction.value)} · not clean-market, bid, or execution value</p>}
                {report.summary && <p>{report.summary}</p>}
                {report.keyFactors.map((factor) => <p key={`${factor.factor}-${factor.note}`}><strong>{factor.factor}:</strong> {factor.note} ({factor.impact})</p>)}
                {report.redFlags.length > 0 && <p><strong>Reported concerns:</strong> {report.redFlags.join(" · ")}</p>}
                {report.renovationPotential && <p><strong>Renovation potential:</strong> {report.renovationPotential}</p>}
                {report.highestBestUseHint && <p><strong>Potential use:</strong> {report.highestBestUseHint}</p>}
                {report.legalSummary && <p><strong>Legal context:</strong> {report.legalSummary}</p>}
                {report.taxSummary && <p><strong>Tax context:</strong> {report.taxSummary}</p>}
              </div>
            )}
            </>
          );
        })()}

        {user && !loading && !data && hasRequested && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {errorMessage ?? t("propertyAIInsights.analysisUnavailable", "Market analysis unavailable")}
          </p>
        )}
      </div>
    </Section>
  );
}
