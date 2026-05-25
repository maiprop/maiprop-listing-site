import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

/** Returns the current user's saved/favorited listings with full listing data joined. */
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
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

type FavoriteRow = { listing_id: string; user_id: string; price_alert: boolean; price_when_saved: number | null; created_at?: string };

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();

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
    onMutate: async ({ listing_id, isFavorited, priceAlert, price }) => {
      if (!user) return;
      const qk = ["favorites", user.id];
      // Cancel in-flight refetches to avoid overwriting the optimistic update
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<FavoriteRow[]>(qk);
      queryClient.setQueryData<FavoriteRow[]>(qk, (old = []) => {
        if (isFavorited) {
          return old.filter(f => f.listing_id !== listing_id);
        }
        return [
          { listing_id, user_id: user.id, price_alert: priceAlert ?? false, price_when_saved: price ?? null },
          ...old,
        ];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic update
      if (user && context?.previous !== undefined) {
        queryClient.setQueryData(["favorites", user.id], context.previous);
      }
      toast.error(t("toasts.favorites.errorToggle"));
    },
    onSuccess: (_, { isFavorited, priceAlert }) => {
      // Scope invalidation to this user only
      queryClient.invalidateQueries({ queryKey: ["favorites", user?.id] });
      toast.success(
        isFavorited
          ? t("toasts.favorites.removed")
          : priceAlert
            ? t("toasts.favorites.savedWithAlert")
            : t("toasts.favorites.saved")
      );
    },
  });
}


/** Derives favorited state from the useFavorites() cache — no extra DB query per card. */
export function useIsFavorited(listing_id: string) {
  const favorites = useFavorites();
  const isFavorited = (favorites.data ?? []).some(
    (f: { listing_id: string }) => f.listing_id === listing_id
  );
  return { data: isFavorited, isLoading: favorites.isLoading };
}
