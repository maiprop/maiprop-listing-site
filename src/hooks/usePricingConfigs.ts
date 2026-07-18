/**
 * Shared pricing configuration — used by Pricing page, Dashboard, Onboarding,
 * PropertyDetail, AdminSubscribers. Admin edits in AdminPricing; all pages auto-update.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PricingConfigRow = {
  key: string;
  audience: string;
  label: string;
  description: string | null;
  amount: number;
  currency: string;
  unit: string;
  metadata?: Record<string, unknown> | null;
};

export type PricingConfigMap = Record<
  string,
  {
    amount: number;
    currency: string;
    audience: string;
    label: string;
    description: string | null;
    unit: string;
    stripePriceId?: string;
    stripePriceMonthly?: string;
    stripePriceAnnual?: string;
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

const getStringMetadata = (
  metadata: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const firstStringMetadata = (
  metadata: Record<string, unknown>,
  keys: string[],
): string | undefined => {
  for (const key of keys) {
    const value = getStringMetadata(metadata, key);
    if (value) return value;
  }
  return undefined;
};

export function mapPricingConfigRows(
  rows: PricingConfigRow[] | null | undefined,
): PricingConfigMap {
  const map: PricingConfigMap = {};
  for (const row of rows ?? []) {
    const metadata = row.metadata ?? {};
    const legacyPriceId = getStringMetadata(metadata, "stripe_price_id");
    const annualAmount = Number(metadata.stripe_last_amount_annual);
    map[row.key] = {
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? "EUR",
      audience: row.audience,
      label: row.label,
      description: row.description ?? null,
      unit: row.unit ?? "monthly",
      stripePriceId: legacyPriceId,
      stripePriceMonthly: firstStringMetadata(metadata, [
        "stripe_price_id_monthly",
        "stripe_monthly_price_id",
      ]) ?? (row.unit !== "yearly" ? legacyPriceId : undefined),
      stripePriceAnnual: firstStringMetadata(metadata, [
        "stripe_price_id_annual",
        "stripe_annual_price_id",
        "stripe_price_id_yearly",
        "stripe_yearly_price_id",
      ]) ?? (row.unit === "yearly" ? legacyPriceId : undefined),
      stripeProductId: getStringMetadata(metadata, "stripe_product_id"),
      annualAmount: Number.isFinite(annualAmount) && annualAmount > 0
        ? annualAmount
        : undefined,
    };
  }
  return map;
}

export function usePricingConfigs() {
  return useQuery<PricingConfigMap>({
    queryKey: ["pricing-configs-public"],
    queryFn: async (): Promise<PricingConfigMap> => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("key, audience, label, description, amount, currency, unit, metadata")
        .eq("is_active", true);
      if (error) throw error;
      return mapPricingConfigRows(data as PricingConfigRow[] | null);
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
