/**
 * Shared pricing configuration — used by Pricing page, Dashboard, Onboarding,
 * PropertyDetail, AdminSubscribers. Admin edits in AdminPricing; all pages auto-update.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PricingConfigRow = {
  key: string;
  label: string;
  description: string | null;
  amount: number;
  currency: string;
  unit: string;
  metadata?: {
    stripe_price_id?: string;
    stripe_product_id?: string;
    stripe_last_amount_annual?: string | number;
  } | null;
};

export type PricingConfigMap = Record<
  string,
  {
    amount: number;
    currency: string;
    label: string;
    description: string | null;
    unit: string;
    stripePriceId?: string;
    stripeProductId?: string;
    annualAmount?: number;
  }
>;

/** Plan keys used across the app — keep in sync with AdminPricing DEFAULT_SEED */
export const PRICING_KEYS = {
  pro: "pro",
  agent_basic: "agent_basic",
  developer_pro: "developer_pro",
  professional_basic: "professional_basic",
  valuation_single: "valuation_single",
  valuation_bundle: "valuation_bundle",
  property_report_single: "property_report_single",
  neighbourhood_report_single: "neighbourhood_report_single",
  neighbourhood_report_bundle: "neighbourhood_report_bundle",
  investor_private: "investor_private",
  investor_institutional: "investor_institutional",
} as const;

/** Maps investor_subscriptions.tier to pricing_configs key */
export const INVESTOR_TIER_TO_KEY: Record<string, string> = {
  private: "investor_private",
  institutional: "investor_institutional",
  developer: "developer_pro",
};

export function usePricingConfigs() {
  return useQuery<PricingConfigMap>({
    queryKey: ["pricing-configs-public"],
    queryFn: async (): Promise<PricingConfigMap> => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("key, label, description, amount, currency, unit, metadata")
        .eq("is_active", true);
      if (error) throw error;
      const map: PricingConfigMap = {};
      for (const row of data ?? []) {
        const rawMeta = row.metadata as Record<string, unknown> | null;
        const meta = rawMeta ?? {};
        const annualAmount = Number(meta.stripe_last_amount_annual);
        map[row.key] = {
          amount: Number(row.amount ?? 0),
          currency: row.currency ?? "EUR",
          label: row.label,
          description: row.description ?? null,
          unit: row.unit ?? "monthly",
          stripePriceId: typeof meta?.stripe_price_id === "string" ? meta.stripe_price_id : undefined,
          stripeProductId: typeof meta?.stripe_product_id === "string" ? meta.stripe_product_id : undefined,
          annualAmount: Number.isFinite(annualAmount) && annualAmount > 0
            ? annualAmount
            : undefined,
        };
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Get formatted price string for display (e.g. "€29" or "€490/mo") */
export function formatPrice(
  config: { amount: number; currency: string; unit: string } | undefined,
  options?: { showUnit?: boolean; fallback?: string }
): string {
  if (!config || config.amount == null) return options?.fallback ?? "—";
  const sym = config.currency === "EUR" ? "€" : config.currency;
  const formatted = `${sym}${Number(config.amount).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (options?.showUnit && config.unit) {
    if (config.unit === "monthly") return `${formatted}/mo`;
    if (config.unit === "yearly") return `${formatted}/yr`;
    return `${formatted}/${config.unit}`;
  }
  return formatted;
}
