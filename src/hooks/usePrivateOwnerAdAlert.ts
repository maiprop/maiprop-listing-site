import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { parseMutationInput, privateOwnerAdAlertToggleSchema } from "@/lib/mutationSchemas";

export function usePrivateOwnerAdAlert() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["private_owner_ad_alert", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.from("private_owner_ad_alerts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!user) throw new Error("Not authenticated");
      const shouldEnable = parseMutationInput(privateOwnerAdAlertToggleSchema, enable, "private owner ad alert");
      if (shouldEnable) {
         
        const { error } = await supabase.from("private_owner_ad_alerts").upsert(
          { user_id: user.id },
          { onConflict: "user_id" }
        );
        if (error) throw error;
      } else {
         
        const { error } = await supabase.from("private_owner_ad_alerts")
          .delete()
          .eq("user_id", user.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, enable) => {
      qc.invalidateQueries({ queryKey: ["private_owner_ad_alert"] });
      toast.success(enable ? "Private Owner Ad alerts enabled" : "Private Owner Ad alerts disabled");
    },
    onError: () => toast.error("Failed to update ad alert preference. Please try again."),
  });

  return {
    isEnabled: !!query.data,
    isLoading: query.isLoading,
    toggle,
  };
}
