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

const VALUATION_INCLUDED = 5;
const VALUATION_EXTRA_COST = 3; // euros
const REPORT_INCLUDED = 3;
const REPORT_EXTRA_COST = 9; // euros
const PRIORITY_ADS_INCLUDED = 10;
const PRIORITY_ADS_EXTRA_COST = 5; // euros

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
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
      const { error } = await supabase.from("usage_ai_valuations").insert({
        user_id: user.id,
        listing_id: listingId ?? null,
      });
      if (error) throw error;
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

export function useRecordReport() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listingId?: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("usage_property_reports").insert({
        user_id: user.id,
        listing_id: listingId ?? null,
      });
      if (error) throw error;
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
      const { error } = await supabase.from("usage_priority_ads").insert({
        user_id: user.id,
        listing_id: listingId,
      });
      if (error) throw error;
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
};
