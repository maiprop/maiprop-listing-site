import type { User } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Bell,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAiQuota,
  type AIQuota,
} from "@/hooks/useAiQuota";
import {
  PRIORITY_ADS_EXTRA_COST,
  PRIORITY_ADS_INCLUDED,
  REPORT_EXTRA_COST,
  REPORT_INCLUDED,
  usePriorityAdsUsage,
  useReportUsage,
} from "@/hooks/useUsageAddons";
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
  | { type: "addon"; addonKey: string; label: string }
  | { type: "upgrade"; label: string }
  | { type: "contact"; label: string };

type UsageMetric = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  used: number | null;
  limit: number | null;
  loading?: boolean;
  error?: boolean;
  action?: MetricAction;
  footnote?: string;
};

type UsageCounter = Pick<UsageMetric, "used" | "limit">;

const SELL_SIDE_PARTICIPANTS = new Set(["seller", "agent", "developer", "professional"]);

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
        <a href="mailto:support@maiprop.co?subject=AI%20usage%20limit">{action.label}</a>
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
      aria-label={action.type === "addon" ? `Buy ${metric.label} add-on` : action.label}
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
  const actionLoading =
    metric.action?.type === "addon" && addonLoadingKey === metric.action.addonKey;

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
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{getCounterLabel(metric)}</p>
            <p className="text-[11px] text-muted-foreground">{getRemainingLabel(metric)}</p>
          </div>
          <MetricActionButton
            action={metric.action}
            metric={metric}
            loading={actionLoading}
            onPurchaseAddon={onPurchaseAddon}
            onUpgrade={onUpgrade}
          />
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
  const valuations = useAiQuota("property-valuation", user, { enabled: Boolean(user) });
  const neighbourhood = useAiQuota("neighbourhood-report", user, { enabled: Boolean(user) });
  const pois = useAiQuota("property-pois", user, { enabled: Boolean(user) });
  const { data: reportCount = 0, isLoading: reportsLoading, error: reportsError } = useReportUsage();
  const { data: priorityCount = 0, isLoading: priorityLoading, error: priorityError } = usePriorityAdsUsage();
  const showPriorityBoosts = SELL_SIDE_PARTICIPANTS.has(participantType);
  const priorityAddonKey = participantType === "professional" ? "extra_priority_ad" : "priority_placement";

  const reportLimit = isPro ? REPORT_INCLUDED : 0;
  const priorityLimit = isPro ? PRIORITY_ADS_INCLUDED : 0;
  const valuationUsage = usageFromQuota(valuations.quota);
  const neighbourhoodUsage = usageFromQuota(neighbourhood.quota);
  const poiUsage = usageFromQuota(pois.quota);

  const metrics: UsageMetric[] = [
    {
      id: "property-valuation",
      label: "AI valuations",
      description: "AI market insights and valuation analysis.",
      icon: BarChart2,
      ...valuationUsage,
      loading: valuations.quotaLoading,
      action: !isPro && valuations.quota && isAtLimit(valuationUsage)
        ? { type: "upgrade", label: "Upgrade" }
        : { type: "addon", addonKey: "valuation_single", label: "Buy add-on" },
    },
    {
      id: "neighbourhood-report",
      label: "Neighbourhood reports",
      description: "Area trends, safety, walkability, and local signals.",
      icon: Globe,
      ...neighbourhoodUsage,
      loading: neighbourhood.quotaLoading,
      action: !isPro && neighbourhood.quota && isAtLimit(neighbourhoodUsage)
        ? { type: "upgrade", label: "Upgrade" }
        : { type: "addon", addonKey: "neighbourhood_report_single", label: "Buy add-on" },
    },
    {
      id: "property-pois",
      label: "Nearby places / POIs",
      description: "AI-curated places and nearby-location analysis.",
      icon: MapPin,
      ...poiUsage,
      loading: pois.quotaLoading,
      action: poiUsage.limit != null && poiUsage.used != null && poiUsage.used >= poiUsage.limit
        ? isPro
          ? { type: "contact", label: "Request more" }
          : { type: "upgrade", label: "Upgrade" }
        : undefined,
    },
    {
      id: "property-reports",
      label: "Property reports",
      description: "Printable MAIProp OS property reports.",
      icon: FileText,
      used: reportCount,
      limit: reportLimit,
      loading: reportsLoading,
      error: Boolean(reportsError),
      action: isPro
        ? { type: "addon", addonKey: "property_report_single", label: "Buy report" }
        : { type: "upgrade", label: "Upgrade" },
      footnote: isPro
        ? `Extra reports cost EUR ${REPORT_EXTRA_COST} each.`
        : "Property reports require Pro access.",
    },
  ];

  if (showPriorityBoosts) {
    metrics.push({
      id: "priority-boosts",
      label: "Priority ads / boosts",
      description: "Featured listing and priority-placement usage.",
      icon: Bell,
      used: priorityCount,
      limit: priorityLimit,
      loading: priorityLoading,
      error: Boolean(priorityError),
      action: { type: "addon", addonKey: priorityAddonKey, label: "Buy boost" },
      footnote: isPro
        ? `Extra priority boosts cost EUR ${PRIORITY_ADS_EXTRA_COST} each.`
        : "Buy a boost without changing your plan.",
    });
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
          <h2 className="font-display text-lg font-bold">AI, reports & boosts</h2>
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
