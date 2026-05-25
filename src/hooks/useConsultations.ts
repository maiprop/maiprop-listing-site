import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

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

function getSuccessToastLabel(requestType: ConsultationRequestInput["request_type"]) {
  if (requestType === "callback") return "Callback request sent.";
  if (requestType === "message") return "Message request sent.";
  return "Consultation request sent.";
}

export function useSubmitConsultation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConsultationRequestInput) => {
      if (!user) {
        throw new Error("auth_required");
      }
      const preferredDate = input.preferred_date?.trim() || null;
      const preferredTime = input.preferred_time?.trim() || null;
      const { error } = await supabase.from("consultation_requests").insert({
        professional_id: input.professional_id,
        requester_id: user.id,
        requester_name: input.requester_name,
        requester_email: input.requester_email,
        requester_phone: input.requester_phone ?? null,
        request_type: input.request_type,
        service: input.service ?? null,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        callback_time: input.callback_time ?? null,
        message: input.message ?? null,
      });
      if (error) throw error;
      return { requestType: input.request_type };
    },
    onSuccess: ({ requestType }) => {
      qc.invalidateQueries({ queryKey: ["consultation-requests"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(getSuccessToastLabel(requestType));
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "auth_required") {
        toast.error("Please sign in to contact professionals.");
        return;
      }
      toast.error("Could not send consultation request. Please try again.");
    },
  });
}

export function useMyConsultationRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["consultation-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Professionals see requests directed at them
      const { data: pro } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!pro) return [];

      const { data, error } = await supabase
        .from("consultation_requests")
        .select("id, professional_id, requester_id, requester_name, requester_email, requester_phone, request_type, service, message, preferred_date, preferred_time, callback_time, status, lead_status, notes, created_at, updated_at")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

/**
 * Resolves the current user's `professionals.id` so consultation mutations
 * can add an ownership filter alongside the row id. Returns null if the
 * user isn't logged in or has no professional profile.
 */
async function getCurrentProfessionalId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("professionals")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export function useUpdateConsultationRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { status?: string; notes?: string; lead_status?: string };
    }) => {
      // Defence-in-depth ownership filter: RLS already restricts the update
      // server-side, but the repo rule (CLAUDE.md) is to also filter client-side
      // so a malformed/forged id can't accidentally target someone else's row.
      const proId = await getCurrentProfessionalId(user?.id);
      if (!proId) throw new Error("Not authorised: no professional profile");

      const { data, error } = await supabase
        .from("consultation_requests")
        .update(updates)
        .eq("id", id)
        .eq("professional_id", proId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultation-requests"] });
      toast.success("Request updated");
    },
    onError: () => toast.error("Could not update consultation. Please try again."),
  });
}
