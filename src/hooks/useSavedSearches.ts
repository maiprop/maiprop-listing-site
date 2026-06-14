import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import {
  parseMutationInput,
  savedSearchAlertToggleSchema,
  savedSearchCreateSchema,
  savedSearchIdSchema,
} from "@/lib/mutationSchemas";

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  email_alerts: boolean;
  last_alert_sent_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Returns the current user's saved searches. Used by Dashboard and SavedSearchesTab. */
export function useSavedSearches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved_searches", user?.id],
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("saved_searches")
        .select("id, user_id, name, filters, email_alerts, last_alert_sent_at, last_alert_listing_ids, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SavedSearch[];
    },
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      filters,
      emailAlerts,
    }: {
      name: string;
      filters: Record<string, unknown>;
      emailAlerts: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const payload = parseMutationInput(
        savedSearchCreateSchema,
        { name, filters, emailAlerts },
        "saved search",
      );

      const { error } = await supabase.from("saved_searches").insert({
        user_id: user.id,
        name: payload.name,
        filters: payload.filters as unknown as import("@/integrations/supabase/types").Database["public"]["Tables"]["saved_searches"]["Insert"]["filters"],
        email_alerts: payload.emailAlerts,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Search saved!");
    },
    onError: (e: Error) => {
      const msg = getPlanLimitErrorMessage(e);
      toast.error(msg ?? e.message);
    },
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const savedSearchId = parseMutationInput(savedSearchIdSchema, id, "saved search id");
      const { error } = await supabase.from("saved_searches").delete().eq("id", savedSearchId).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Saved search removed.");
    },
    onError: (e: Error) => {
      const msg = getPlanLimitErrorMessage(e);
      toast.error(msg ?? e.message);
    },
  });
}

export function useToggleSavedSearchAlert() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, emailAlerts }: { id: string; emailAlerts: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const payload = parseMutationInput(
        savedSearchAlertToggleSchema,
        { id, emailAlerts },
        "saved search alert",
      );
      const { error } = await supabase
        .from("saved_searches")
        .update({ email_alerts: payload.emailAlerts })
        .eq("id", payload.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
    },
    onError: (e: Error) => {
      const msg = getPlanLimitErrorMessage(e);
      toast.error(msg ?? e.message);
    },
  });
}
