import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

/**
 * Returns viewings for the current user.
 * @param role "requester" — viewings the user booked; "owner" — viewings on their listings.
 */
export function useViewings(role: "requester" | "owner" = "requester") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["viewings", user?.id, role],
    queryFn: async () => {
      if (!user) return [];
      const column = role === "requester" ? "requester_id" : "owner_id";
      const { data, error } = await supabase
        .from("viewings")
        .select("*, listings(title, city, cover_image_url, address)")
        .eq(column, user.id)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

export function useBookViewing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (viewing: {
      listing_id: string;
      owner_id: string;
      viewing_type: "in_person" | "video";
      scheduled_at: string;
      note?: string;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("viewings")
        .insert({ ...viewing, requester_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viewings"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Viewing booked successfully!");
    },
    onError: (err: Error) => {
      const msg = getPlanLimitErrorMessage(err);
      toast.error(msg ?? err.message);
    },
  });
}

export function useUpdateViewingStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "confirmed" | "cancelled" | "completed" }) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase
        .from("viewings")
        .update({ status })
        .eq("id", id)
        .or(`owner_id.eq.${user.id},requester_id.eq.${user.id}`);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viewings"] });
      toast.success("Viewing status updated!");
    },
  });
}

export function useUpdateViewing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"viewings"> }) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase
        .from("viewings")
        .update(updates)
        .eq("id", id)
        .or(`owner_id.eq.${user.id},requester_id.eq.${user.id}`);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viewings"] });
      toast.success("Viewing updated!");
    },
  });
}
