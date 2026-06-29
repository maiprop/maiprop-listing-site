/**
 * Usage-based add-ons: AI valuations, Property Reports, Priority Ads.
 * Reads current-month usage from the canonical usage_ai_calls table
 * (populated server-side by edge functions via recordAiCall).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import { parseMutationInput, rowIdSchema } from "@/lib/mutationSchemas";

const VALUATION_INCLUDED = 5;
const VALUATION_EXTRA_COST = 39; // euros, valuation_single
const REPORT_INCLUDED = 3;
const REPORT_EXTRA_COST = 49; // euros, property_report_single
const PRIORITY_ADS_INCLUDED = 10;
const PRIORITY_ADS_EXTRA_COST = 59; // euros, priority_placement
const PROFESSIONAL_PRIORITY_AD_EXTRA_COST = 8; // euros, extra_priority_ad
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

export function useRecordValuation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listingId?: string) => {
      if (!user) throw new Error("Not authenticated");
      if (listingId) parseMutationInput(rowIdSchema("listing id"), listingId, "listing id");
      throw new Error("AI valuation usage is recorded server-side by the valuation function");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage_ai_valuations"] });
    },
    onError: () => toast.error("Failed to record AI valuation usage. Please try again."),
  });
}

export function useReportUsage() {
  const { user } = useAuth();
  const monthStart = startOfMonth();

  return useQuery({
    queryKey: ["usage_property_reports", user?.id, monthStart],
    enabled: !!user,
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

export function usePropertyReportAddonCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["addon_purchases", "property-report-credits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("addon_purchases")
        .select("credits_granted, credits_consumed")
        .eq("user_id", user.id)
        .in("addon_key", [...PROPERTY_REPORT_CREDIT_ADDONS])
        .in("status", ["paid", "active"]);
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => {
        const granted = Number(row.credits_granted ?? 0);
        const consumed = Number(row.credits_consumed ?? 0);
        return sum + Math.max(granted - consumed, 0);
      }, 0);
    },
  });
}

export function useRecordReport() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listingId?: string) => {
      if (!user) throw new Error("Not authenticated");
      if (listingId) parseMutationInput(rowIdSchema("listing id"), listingId, "listing id");
      throw new Error("Property report usage is recorded server-side by the report function");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage_property_reports"] });
    },
    onError: () => toast.error("Failed to record report usage. Please try again."),
  });
}

export function usePriorityAdsUsage() {
  const { user } = useAuth();
  const monthStart = startOfMonth();

  return useQuery({
    queryKey: ["usage_priority_ads", user?.id, monthStart],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("usage_priority_ads")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", monthStart);
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

export function useRecordPriorityAd() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isPro } = useSubscription();

  return useMutation({
    mutationFn: async (listingId: string) => {
      if (!user) throw new Error("Not authenticated");
      if (!isPro) throw new Error("Priority Ads require Pro plan");
      parseMutationInput(rowIdSchema("listing id"), listingId, "listing id");
      throw new Error("Priority ad usage is recorded server-side by the checkout or boost workflow");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage_priority_ads"] });
    },
    onError: () => toast.error("Failed to record priority ad usage. Please try again."),
  });
}

export {
  VALUATION_INCLUDED,
  VALUATION_EXTRA_COST,
  REPORT_INCLUDED,
  REPORT_EXTRA_COST,
  PRIORITY_ADS_INCLUDED,
  PRIORITY_ADS_EXTRA_COST,
  PROFESSIONAL_PRIORITY_AD_EXTRA_COST,
};
