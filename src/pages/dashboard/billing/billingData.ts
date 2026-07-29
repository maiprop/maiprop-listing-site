import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClientStripeRuntimeMode } from "@/lib/billingRuntime";
import { accountQueryKey } from "@/lib/identityQueryBoundary";
import type { BillingInfo } from "./types";

export type AddonCreditLedgerRow = {
  id: string;
  addon_key: string;
  status: string;
  credits_granted: number;
  credits_consumed: number;
  credits_refunded?: number | null;
  refund_status?: string | null;
  created_at?: string | null;
};

export const BILLING_FUNCTION_TIMEOUT_MS = 20_000;

export const getInvoiceTaxIdLabel = (
  invoice: BillingInfo["invoices"][number],
): string | null => {
  const taxId = invoice.customer_tax_ids?.find((entry) => entry.value)?.value;
  return taxId ? `VAT ID ${taxId}` : null;
};

export const useBillingInfo = (userId: string | undefined) =>
  useQuery<BillingInfo>({
    queryKey: accountQueryKey(userId, "billing-info"),
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.functions.invoke("get-invoices", {
        signal,
        timeout: BILLING_FUNCTION_TIMEOUT_MS,
      });
      if (error) throw error;
      return data as BillingInfo;
    },
    staleTime: 60_000,
  });

export const addonLabel = (addonKey: string | null | undefined) => {
  switch (addonKey) {
    case "valuation_single":
    case "valuation_bundle":
      return "AI valuations";
    case "property_report_single":
      return "Property reports";
    case "neighbourhood_report_single":
    case "neighbourhood_report_bundle":
      return "Neighbourhood reports";
    case "featured_listing":
      return "Spotlight";
    case "priority_placement":
      return "Priority Rank";
    case "featured_priority_bundle":
      return "Spotlight + Priority Rank";
    default:
      return addonKey ? addonKey.split("_").join(" ") : "Add-on credits";
  }
};

export const creditWord = (count: number) =>
  Math.abs(count) === 1 ? "credit" : "credits";

export const netAddonCredits = (row: AddonCreditLedgerRow) =>
  Number(row.credits_granted ?? 0) -
  Number(row.credits_consumed ?? 0) -
  Number(row.credits_refunded ?? 0);

export const useAddonCreditLedger = (userId: string | undefined) => {
  const runtimeMode = getClientStripeRuntimeMode();
  return useQuery<AddonCreditLedgerRow[]>({
    queryKey: ["addon_purchases", "credit-ledger", userId, runtimeMode],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return [];
      let query = supabase
        .from("addon_purchases")
        .select(
          "id, addon_key, status, credits_granted, credits_consumed, credits_refunded, refund_status, created_at",
        )
        .eq("user_id", userId)
        .in("status", ["paid", "active", "refunded"]);
      if (runtimeMode) query = query.eq("runtime_mode", runtimeMode);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AddonCreditLedgerRow[];
    },
    staleTime: 60_000,
  });
};
