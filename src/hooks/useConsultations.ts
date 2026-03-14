import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useMyConsultationRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["consultation-requests", user?.id],
    queryFn: async () => {
      // Professionals see requests directed at them
      const { data: pro } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!pro) return [];

      const { data, error } = await supabase
        .from("consultation_requests")
        .select("*")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useUpdateConsultationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { status?: string; notes?: string; lead_status?: string };
    }) => {
      const { data, error } = await supabase
        .from("consultation_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation-requests"] });
      toast.success("Request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkUpdateConsultationRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: { status?: string; lead_status?: string };
    }) => {
      const { error } = await supabase
        .from("consultation_requests")
        .update(updates)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation-requests"] });
      toast.success("Requests updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
