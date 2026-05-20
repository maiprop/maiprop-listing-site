import { Link } from "react-router-dom";
import { ArrowUpRight, Gauge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FREE_AI_MONTHLY_LIMIT,
  PRO_AI_MONTHLY_LIMIT,
  UNLIMITED_AI_LIMIT,
  getAiQuotaTierLabel,
  isAiQuotaReached,
  type AIQuota,
} from "@/hooks/useAiQuota";

interface AIQuotaStatusProps {
  featureName: string;
  quota: AIQuota | null | undefined;
  quotaLoading?: boolean;
  className?: string;
}

const counterText = (quota: AIQuota | null | undefined, loading?: boolean) => {
  if (loading) return "Checking request counter...";
  if (!quota) return "Request counter unavailable";
  if (quota.limit >= UNLIMITED_AI_LIMIT) return "Unlimited this month";
  return `${quota.used} / ${quota.limit} used`;
};

export function AIQuotaStatus({
  featureName,
  quota,
  quotaLoading = false,
  className = "",
}: AIQuotaStatusProps) {
  const quotaReached = isAiQuotaReached(quota);
  const tier = getAiQuotaTierLabel(quota);
  const remaining = quota?.remaining ?? 0;
  const hasFiniteQuota = Boolean(quota && quota.limit < UNLIMITED_AI_LIMIT);
  const hasUnlimitedQuota = Boolean(quota && quota.limit >= UNLIMITED_AI_LIMIT);
  const planExcluded = quota?.reason === "plan_does_not_include_feature";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        quotaReached || planExcluded
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-secondary/40"
      } ${className}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {quotaLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Gauge className="w-3.5 h-3.5 text-primary" />
            )}
            <p className="text-xs font-semibold text-foreground">
              {featureName} requests
            </p>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {counterText(quota, quotaLoading)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {quotaLoading
              ? "Checking this month's usage before running AI."
              : quotaReached
                ? `Monthly cap reached for your ${tier} allowance.`
                : planExcluded
                  ? "This AI feature is not included in your current plan."
                  : hasFiniteQuota
                    ? `${remaining} ${tier} request${remaining === 1 ? "" : "s"} remaining this month.`
                    : hasUnlimitedQuota
                      ? "Your account has unlimited AI requests this month."
                      : "The request counter will be checked before loading."}
            {" "}
            Free: {FREE_AI_MONTHLY_LIMIT}/month. Pro: {PRO_AI_MONTHLY_LIMIT}/month.
          </p>
        </div>

        {(quotaReached || planExcluded) && (
          <Button asChild size="sm" className="shrink-0 gap-2">
            <Link to="/pricing">
              Upgrade
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
