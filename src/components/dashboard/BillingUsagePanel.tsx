import type { User } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Crown,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAiQuotas,
  type AIQuota,
} from "@/hooks/useAiQuota";
import {
  REPORT_EXTRA_COST,
  REPORT_INCLUDED,
  usePropertyReportAddonCredits,
  useReportUsage,
} from "@/hooks/useUsageAddons";
import { useListingPromotionBalance } from "@/hooks/useListingPromotions";
import { buildBillingContactHref } from "@/lib/billingContact";
import { cn } from "@/lib/utils";

type BillingUsagePanelProps = {
  user: User | null | undefined;
  isPro: boolean;
  participantType: string;
  addonLoadingKey: string | null;
  onPurchaseAddon: (addonKey: string) => void;
  onUpgrade: () => void;
};

type MetricAction =
  | { type: "addon"; addonKey: string; label: string; ariaLabel?: string }
  | { type: "upgrade"; label: string }
  | { type: "contact"; label: string; href: string };

type UsageMetric = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  used: number | null;
  limit: number | null;
  loading?: boolean;
  error?: boolean;
  actions?: MetricAction[];
  footnote?: string;
};

type UsageCounter = Pick<UsageMetric, "used" | "limit">;

const SELL_SIDE_PARTICIPANTS = new Set(["seller", "agent", "developer"]);
const BILLING_AI_BUCKETS = [
  "property-valuation",
  "neighbourhood-report",
  "property-pois",
] as const;

const usageFromQuota = (quota: AIQuota | null | undefined) => ({
  used: quota?.used ?? null,
  limit: quota?.limit ?? null,
});

const getRemainingLabel = (metric: UsageMetric) => {
  if (metric.loading) return "Checking usage...";
  if (metric.error || metric.used == null || metric.limit == null) return "Counter unavailable";
  if (metric.limit <= 0) return metric.used > 0 ? `${metric.used} used` : "Not included";
  const remaining = Math.max(metric.limit - metric.used, 0);
  return `${remaining} remaining this month`;
};

const getCounterLabel = (metric: UsageMetric) => {
  if (metric.loading) return "Loading";
  if (metric.error || metric.used == null || metric.limit == null) return "Unavailable";
  if (metric.limit <= 0) return `${metric.used} used`;
  return `${metric.used} / ${metric.limit}`;
};

const getUsagePercent = (metric: UsageMetric) => {
  if (metric.used == null || metric.limit == null || metric.limit <= 0) return metric.used && metric.used > 0 ? 100 : 0;
  return Math.min(100, Math.round((metric.used / metric.limit) * 100));
};

const isAtLimit = (metric: UsageCounter) =>
  metric.used != null && metric.limit != null && metric.limit > 0 && metric.used >= metric.limit;

const actionClasses = (metric: UsageMetric) =>
  isAtLimit(metric)
    ? "border-primary text-primary hover:bg-primary/10"
    : "border-border text-muted-foreground hover:text-foreground";

function MetricActionButton({
  action,
  metric,
  loading,
  onPurchaseAddon,
  onUpgrade,
}: {
  action: MetricAction | undefined;
  metric: UsageMetric;
  loading: boolean;
  onPurchaseAddon: (addonKey: string) => void;
  onUpgrade: () => void;
}) {
  if (!action) return null;

  if (action.type === "contact") {
    return (
      <Button asChild size="sm" variant="outline" className={cn("shrink-0", actionClasses(metric))}>
        <a href={action.href}>{action.label}</a>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("shrink-0 gap-1.5", actionClasses(metric))}
      onClick={() => {
        if (action.type === "upgrade") onUpgrade();
        else onPurchaseAddon(action.addonKey);
      }}
      disabled={loading}
      aria-label={
        action.type === "addon"
          ? action.ariaLabel ?? `Buy ${metric.label} add-on`
          : action.label
      }
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
      {action.label}
    </Button>
  );
}

function UsageRow({
  metric,
  addonLoadingKey,
  onPurchaseAddon,
  onUpgrade,
}: {
  metric: UsageMetric;
  addonLoadingKey: string | null;
  onPurchaseAddon: (addonKey: string) => void;
  onUpgrade: () => void;
}) {
  const Icon = metric.icon;
  const percent = getUsagePercent(metric);
  const actions = metric.actions ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{metric.label}</p>
              <p className="text-xs text-muted-foreground">{metric.description}</p>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{getCounterLabel(metric)}</p>
            <p className="text-[11px] text-muted-foreground">{getRemainingLabel(metric)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions.map((action) => {
              const actionLoading =
                action.type === "addon" && addonLoadingKey === action.addonKey;
              const key = action.type === "addon" ? `${action.type}-${action.addonKey}` : action.type;

              return (
                <MetricActionButton
                  key={key}
                  action={action}
                  metric={metric}
                  loading={actionLoading}
                  onPurchaseAddon={onPurchaseAddon}
                  onUpgrade={onUpgrade}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isAtLimit(metric) ? "bg-primary" : "bg-brand-emerald",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {metric.footnote && (
        <p className="mt-2 text-[11px] text-muted-foreground">{metric.footnote}</p>
      )}
    </div>
  );
}

export function BillingUsagePanel({
  user,
  isPro,
  participantType,
  addonLoadingKey,
  onPurchaseAddon,
  onUpgrade,
}: BillingUsagePanelProps) {
  const aiQuotas = useAiQuotas(BILLING_AI_BUCKETS, user, { enabled: Boolean(user) });
  const { data: reportCount = 0, isLoading: reportsLoading, error: reportsError } = useReportUsage();
  const {
    data: reportCreditCount = 0,
    isLoading: reportCreditsLoading,
    error: reportCreditsError,
  } = usePropertyReportAddonCredits();
  const showListingPromotions = SELL_SIDE_PARTICIPANTS.has(participantType);
  const promotionBalance = useListingPromotionBalance(showListingPromotions);

  const reportBaseLimit = isPro ? REPORT_INCLUDED : 0;
  const reportLimit = reportBaseLimit +
    reportCreditCount +
    Math.max(reportCount - reportBaseLimit, 0);
  const valuationQuota = aiQuotas.quotas["property-valuation"];
  const neighbourhoodQuota = aiQuotas.quotas["neighbourhood-report"];
  const poiQuota = aiQuotas.quotas["property-pois"];
  const valuationUsage = usageFromQuota(valuationQuota);
  const neighbourhoodUsage = usageFromQuota(neighbourhoodQuota);
  const poiUsage = usageFromQuota(poiQuota);
  const limitActions = (usage: UsageCounter, addonKey: string): MetricAction[] =>
    isAtLimit(usage)
      ? isPro
        ? [{ type: "addon", addonKey, label: "Top up" }]
        : [
            { type: "upgrade", label: "Upgrade" },
            { type: "addon", addonKey, label: "Top up" },
          ]
      : [{ type: "addon", addonKey, label: "Buy add-on" }];
  const promotionActions = (addonKey: string, label: string): MetricAction[] => [
    ...(!isPro ? [{ type: "upgrade" as const, label: "Upgrade" }] : []),
    { type: "addon", addonKey, label, ariaLabel: label },
  ];

  const metrics: UsageMetric[] = [
    {
      id: "property-valuation",
      label: "AI valuations",
      description: "AI market insights and valuation analysis.",
      icon: BarChart2,
      ...valuationUsage,
      loading: aiQuotas.quotaLoading,
      actions: limitActions(valuationUsage, "valuation_single"),
    },
    {
      id: "neighbourhood-report",
      label: "Neighbourhood reports",
      description: "Area trends, safety, walkability, and local signals.",
      icon: Globe,
      ...neighbourhoodUsage,
      loading: aiQuotas.quotaLoading,
      actions: limitActions(neighbourhoodUsage, "neighbourhood_report_single"),
    },
    {
      id: "property-pois",
      label: "Nearby places / POIs",
      description: "AI-curated places and nearby-location analysis.",
      icon: MapPin,
      ...poiUsage,
      loading: aiQuotas.quotaLoading,
      actions: poiUsage.limit != null && poiUsage.used != null && poiUsage.used >= poiUsage.limit
        ? isPro
          ? [{
              type: "contact",
              label: "Request more",
              href: buildBillingContactHref({
                topic: "Nearby places / POIs",
                participantType,
              }),
            }]
          : [{ type: "upgrade", label: "Upgrade" }]
        : undefined,
    },
    {
      id: "property-reports",
      label: "Property reports",
      description: "Printable MAIProp OS property reports.",
      icon: FileText,
      used: reportCount,
      limit: reportLimit,
      loading: reportsLoading || reportCreditsLoading,
      error: Boolean(reportsError || reportCreditsError),
      actions: isPro
        ? [{ type: "addon", addonKey: "property_report_single", label: isAtLimit({ used: reportCount, limit: reportLimit }) ? "Top up" : "Buy report" }]
        : [
            { type: "upgrade", label: "Upgrade" },
            { type: "addon", addonKey: "property_report_single", label: "Buy report" },
          ],
      footnote: isPro
        ? `Extra reports cost EUR ${REPORT_EXTRA_COST} each.`
        : "Upgrade for included reports, or buy a one-off report add-on.",
    },
  ];

  if (showListingPromotions) {
    const spotlight = promotionBalance.data?.spotlight;
    const priority = promotionBalance.data?.priority;
    const balanceUnavailable = Boolean(promotionBalance.error);
    const balanceLoading = promotionBalance.isLoading;

    metrics.push(
      {
        id: "spotlight-promotions",
        label: "Spotlight credits",
        description: "Visual badge and Spotlight showcase placement for 30 days.",
        icon: Crown,
        used: spotlight?.used ?? null,
        limit: spotlight?.included ?? null,
        loading: balanceLoading,
        error: balanceUnavailable,
        actions: [
          ...promotionActions("featured_listing", "Buy Spotlight"),
          { type: "addon", addonKey: "featured_priority_bundle", label: "Buy bundle", ariaLabel: "Buy bundle" },
        ],
        footnote: spotlight
          ? `${spotlight.remaining + spotlight.addons} available credit${spotlight.remaining + spotlight.addons === 1 ? "" : "s"}. Add-on EUR 39/30 days; credits do not roll over.`
          : "Spotlight add-on EUR 39/30 days; credits do not roll over.",
      },
      {
        id: "priority-promotions",
        label: "Priority credits",
        description: "Higher search placement for one listing for 30 days.",
        icon: Zap,
        used: priority?.used ?? null,
        limit: priority?.included ?? null,
        loading: balanceLoading,
        error: balanceUnavailable,
        actions: promotionActions("priority_placement", "Buy Priority"),
        footnote: priority
          ? `${priority.remaining + priority.addons} available credit${priority.remaining + priority.addons === 1 ? "" : "s"}. Priority add-on EUR 59/30 days; bundle EUR 79/30 days.`
          : "Priority add-on EUR 59/30 days; Spotlight + Priority bundle EUR 79/30 days.",
      },
    );
  }

  return (
    <section
      aria-label="Monthly AI and report usage"
      className="glass-card rounded-2xl border border-border p-5 space-y-4"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Monthly usage
          </p>
          <h2 className="font-display text-lg font-bold">AI, reports & promotions</h2>
        </div>
        <p className="text-xs text-muted-foreground sm:text-right">
          Counters reset on the 1st of each month.
        </p>
      </div>

      <div className="grid gap-3">
        {metrics.map((metric) => (
          <UsageRow
            key={metric.id}
            metric={metric}
            addonLoadingKey={addonLoadingKey}
            onPurchaseAddon={onPurchaseAddon}
            onUpgrade={onUpgrade}
          />
        ))}
      </div>
    </section>
  );
}
