/**
 * Usage-based add-ons: AI valuations, Property Reports, Priority Ads.
 * Reads current-month usage from the canonical usage_ai_calls table
 * (populated by server-side quota reservations).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getClientStripeRuntimeMode } from "@/lib/billingRuntime";

const VALUATION_INCLUDED = 5;
const VALUATION_EXTRA_COST = 39; // euros, valuation_single
const REPORT_INCLUDED = 3;
const REPORT_EXTRA_COST = 49; // euros, property_report_single
const PRIORITY_ADS_INCLUDED = 10;
const PRIORITY_ADS_EXTRA_COST = 59; // euros, priority_placement
const PROPERTY_REPORT_CREDIT_ADDONS = ["property_report_single"] as const;

function startOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function useValuationUsage() {
  const { user } = useAuth();
  const monthStart = startOfMonth();

  return useQuery({
    queryKey: ["usage_ai_calls", "property-valuation", user?.id, monthStart],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("usage_ai_calls")
        .select("id")
        .eq("user_id", user.id)
        .eq("bucket", "property-valuation")
        .gte("created_at", monthStart);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

export function useReportUsage(options: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const monthStart = startOfMonth();

  return useQuery({
    queryKey: ["usage_property_reports", user?.id, monthStart],
    enabled: !!user && options.enabled !== false,
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("usage_property_reports")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", monthStart);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

export function usePropertyReportAddonCredits(options: { enabled?: boolean } = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["addon_purchases", "property-report-credits", user?.id],
    enabled: !!user && options.enabled !== false,
    queryFn: async () => {
      if (!user) return 0;
      const runtimeMode = getClientStripeRuntimeMode();
      let query = supabase
        .from("addon_purchases")
        .select("credits_granted, credits_consumed, credits_refunded")
        .eq("user_id", user.id)
        .in("addon_key", [...PROPERTY_REPORT_CREDIT_ADDONS])
        .in("status", ["paid", "active", "refunded"]);
      if (runtimeMode) query = query.eq("runtime_mode", runtimeMode);
      const { data, error } = await query;
      if (error) throw error;
      const balance = (data ?? []).reduce((sum, row) => {
        const granted = Number(row.credits_granted ?? 0);
        const consumed = Number(row.credits_consumed ?? 0);
        const refunded = Number(row.credits_refunded ?? 0);
        return sum + granted - consumed - refunded;
      }, 0);
      return Math.max(balance, 0);
    },
  });
}

export function usePriorityAdsUsage() {
  const { user } = useAuth();
  const monthStart = startOfMonth();

  return useQuery({
    queryKey: ["listing_promotion_allocations", "priority-plan-usage", user?.id, monthStart],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("listing_promotion_allocations")
        .select("id")
        .eq("owner_id", user.id)
        .eq("promotion_type", "priority")
        .eq("source_type", "plan")
        .gte("created_at", monthStart);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

export {
  VALUATION_INCLUDED,
  VALUATION_EXTRA_COST,
  REPORT_INCLUDED,
  REPORT_EXTRA_COST,
  PRIORITY_ADS_INCLUDED,
  PRIORITY_ADS_EXTRA_COST,
};
