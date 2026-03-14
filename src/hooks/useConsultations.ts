import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type ConsultationRequestInput = {
  professional_id: string;
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  request_type: "consultation" | "callback" | "message";
  service?: string;
  preferred_date?: string;
  preferred_time?: string;
  callback_time?: string;
  message?: string;
};

export function useSubmitConsultation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConsultationRequestInput) => {
      const { error } = await supabase.from("consultation_requests").insert({
        professional_id: input.professional_id,
        requester_id: user?.id ?? null,
        requester_name: input.requester_name,
        requester_email: input.requester_email,
        requester_phone: input.requester_phone ?? null,
        request_type: input.request_type,
        service: input.service ?? null,
        preferred_date: input.preferred_date ?? null,
        preferred_time: input.preferred_time ?? null,
        callback_time: input.callback_time ?? null,
        message: input.message ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation-requests"] });
      toast.success("Request sent! The professional will contact you soon.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

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
