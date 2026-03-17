import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select("*, listings(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      listing_id,
      isFavorited,
      priceAlert,
      price,
    }: {
      listing_id: string;
      isFavorited: boolean;
      priceAlert?: boolean;
      price?: number;
    }) => {
      if (!user) throw new Error("Must be logged in to save properties");
      if (isFavorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("listing_id", listing_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites").insert({
          user_id: user.id,
          listing_id,
          price_alert: priceAlert ?? false,
          price_when_saved: price ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { isFavorited, priceAlert }) => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(
        isFavorited
          ? "Removed from saved"
          : priceAlert
            ? "Saved! We'll notify you if the price drops."
            : "Saved to favorites!"
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTogglePriceAlert() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      listing_id,
      priceAlert,
      price,
    }: {
      listing_id: string;
      priceAlert: boolean;
      price?: number;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase
        .from("favorites")
        .update({
          price_alert: priceAlert,
          price_when_saved: priceAlert ? price ?? null : null,
        })
        .eq("user_id", user.id)
        .eq("listing_id", listing_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["favorite"] });
      toast.success("Price alert updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useIsFavorited(listing_id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorite", user?.id, listing_id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("listing_id", listing_id)
        .single();
      return !!data;
    },
    enabled: !!user && !!listing_id,
  });
}
