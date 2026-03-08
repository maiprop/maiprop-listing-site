import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, any>;
  email_alerts: boolean;
  created_at: string;
  updated_at: string;
};

export function useSavedSearches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved_searches", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
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
      filters: Record<string, any>;
      emailAlerts: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("saved_searches").insert({
        user_id: user.id,
        name,
        filters,
        email_alerts: emailAlerts,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Search saved!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_searches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Saved search removed.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleSavedSearchAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, emailAlerts }: { id: string; emailAlerts: boolean }) => {
      const { error } = await supabase
        .from("saved_searches")
        .update({ email_alerts: emailAlerts })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
