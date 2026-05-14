import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import type { Database } from "@/integrations/supabase/types";

export type AuctionAlert = Database["public"]["Tables"]["auction_alerts"]["Row"];

export function useAuctionAlerts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["auction_alerts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("auction_alerts")
        .select("id, user_id, city, court_name, property_type, min_price, max_price, email_notify, active, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuctionAlert[];
    },
  });
}

type AlertPayload = {
  city?: string | null;
  court_name?: string | null;
  property_type?: Database["public"]["Enums"]["property_type"] | null;
  min_price?: number | null;
  max_price?: number | null;
  email_notify?: boolean;
};

export function useCreateAuctionAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AlertPayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
       
      const { error } = await supabase.from("auction_alerts").insert({ user_id: user.id, ...payload });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auction_alerts"] });
      toast.success("Auction alert created!");
    },
    onError: (e: Error) => {
      const msg = getPlanLimitErrorMessage(e);
      toast.error(msg ?? e.message);
    },
  });
}

export function useUpdateAuctionAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AlertPayload & { active: boolean }> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("auction_alerts").update(updates).eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auction_alerts"] });
      toast.success("Alert updated.");
    },
    onError: (e: Error) => {
      const msg = getPlanLimitErrorMessage(e);
      toast.error(msg ?? e.message);
    },
  });
}

export function useDeleteAuctionAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("auction_alerts").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auction_alerts"] });
      toast.success("Alert deleted.");
    },
    onError: () => toast.error("Failed to delete alert. Please try again."),
  });
}
