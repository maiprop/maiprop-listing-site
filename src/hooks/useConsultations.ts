import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ConsultationRequest {
  professional_id: string;
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  request_type: "consultation" | "callback" | "message";
  message?: string;
  service?: string;
  preferred_date?: string;
  preferred_time?: string;
  callback_time?: string;
}

export function useSubmitConsultation() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (req: ConsultationRequest) => {
      const payload = {
        ...req,
        requester_id: user?.id ?? null,
        requester_name: req.requester_name || profile?.display_name || "Anonymous",
        requester_email: req.requester_email || user?.email || "",
      };
      const { data, error } = await supabase
        .from("consultation_requests")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultation_requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
