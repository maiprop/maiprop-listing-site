import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

export function useDealChecklists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["deal-checklists", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("deal_checklists")
        .select("id, user_id, entity_type, entity_id, items, title, status, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function useDealChecklist(entityType: string, entityId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["deal-checklist", entityType, entityId, user?.id],
    queryFn: async () => {
      if (!user || !entityId) return null;
      const { data, error } = await supabase
        .from("deal_checklists")
        .select("id, user_id, entity_type, entity_id, items, title, status, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!entityId,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function useUpsertDealChecklist() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      entity_type,
      entity_id,
      title,
      items,
      status,
    }: {
      entity_type: "listing" | "firesale_request";
      entity_id: string;
      title?: string;
      items?: { label: string; done: boolean }[];
      status?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("deal_checklists")
        .upsert(
          {
            user_id: user.id,
            entity_type,
            entity_id,
            title: title ?? "Due diligence",
            items: items ?? [],
            status: status ?? "in_progress",
          },
          { onConflict: "user_id,entity_type,entity_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-checklists"] });
      qc.invalidateQueries({ queryKey: ["deal-checklist"] });
      toast.success("Checklist saved");
    },
    onError: () => toast.error("Failed to save checklist. Please try again."),
  });
}
