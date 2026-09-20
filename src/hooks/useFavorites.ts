import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { favoriteToggleSchema, parseMutationInput } from "@/lib/mutationSchemas";
import type { DbListingCardRow } from "@/lib/domainContracts";

/** Returns the current user's saved/favorited listings with full listing data joined. */
export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: favoriteRows, error } = await supabase
        .from("favorites")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const listingIds = [...new Set((favoriteRows ?? []).map((row) => row.listing_id))];
      if (listingIds.length === 0) return [];

      const { data: listingRows, error: listingError } = await supabase
        .rpc("get_public_listing_catalogue")
        .select("*")
        .in("id", listingIds);
      if (listingError) throw listingError;
      const listingById = new Map(
        (listingRows ?? [])
          .filter((row) => typeof row.id === "string")
          .map((row) => {
            const listing = {
              ...row,
              id: row.id as string,
              title: row.title ?? "Property",
              city: row.city ?? "",
              listing_type: row.listing_type ?? "sale",
              property_type: row.property_type ?? "apartment",
              listing_images: Array.isArray(row.listing_images) ? row.listing_images : [],
            } as unknown as DbListingCardRow;
            return [listing.id, listing] as const;
          }),
      );

      return (favoriteRows ?? []).map((favorite) => ({
        ...favorite,
        listings: listingById.get(favorite.listing_id) ?? null,
      }));
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

type FavoriteRow = { listing_id: string; user_id: string; price_alert: boolean; price_when_saved: number | null; created_at?: string };

type FavoriteToggleVariables = {
  listing_id: string;
  isFavorited: boolean;
  priceAlert?: boolean;
  price?: number;
};

type FavoriteToggleOperation = FavoriteToggleVariables & {
  operationUserId: string | null;
};

type FavoriteMutationContext = {
  queryKey: readonly ["favorites", string];
  previous: FavoriteRow[] | undefined;
  hadPrevious: boolean;
};

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();

  const mutation = useMutation<void, unknown, FavoriteToggleOperation, FavoriteMutationContext | undefined>({
    mutationFn: async ({
      listing_id,
      isFavorited,
      priceAlert,
      price,
      operationUserId,
    }) => {
      if (!operationUserId) throw new Error("Must be logged in to save properties");
      const payload = parseMutationInput(
        favoriteToggleSchema,
        { listing_id, isFavorited, priceAlert, price },
        "favorite",
      );
      if (payload.isFavorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", operationUserId)
          .eq("listing_id", payload.listing_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites").insert({
          user_id: operationUserId,
          listing_id: payload.listing_id,
          price_alert: payload.priceAlert ?? false,
          price_when_saved: payload.price ?? null,
        });
        if (error) throw error;
      }
    },
    onMutate: async ({ listing_id, isFavorited, priceAlert, price, operationUserId }) => {
      if (!operationUserId) return undefined;
      const qk = ["favorites", operationUserId] as const;
      // Cancel in-flight refetches to avoid overwriting the optimistic update
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<FavoriteRow[]>(qk);
      queryClient.setQueryData<FavoriteRow[]>(qk, (old = []) => {
        if (isFavorited) {
          return old.filter(f => f.listing_id !== listing_id);
        }
        return [
          { listing_id, user_id: operationUserId, price_alert: priceAlert ?? false, price_when_saved: price ?? null },
          ...old,
        ];
      });
      return { queryKey: qk, previous, hadPrevious: previous !== undefined };
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic update
      if (context?.hadPrevious) {
        queryClient.setQueryData(context.queryKey, context.previous);
      } else if (context) {
        queryClient.removeQueries({ queryKey: context.queryKey, exact: true });
      }
      toast.error(t("toasts.favorites.errorToggle"));
    },
    onSuccess: (_, { isFavorited, priceAlert }, context) => {
      // Scope invalidation to this user only
      if (context) queryClient.invalidateQueries({ queryKey: context.queryKey, exact: true });
      toast.success(
        isFavorited
          ? t("toasts.favorites.removed")
          : priceAlert
            ? t("toasts.favorites.savedWithAlert")
            : t("toasts.favorites.saved")
      );
    },
  });

  const bindOperation = (variables: FavoriteToggleVariables): FavoriteToggleOperation => ({
    ...variables,
    operationUserId: user?.id ?? null,
  });

  return {
    ...mutation,
    mutate: (variables: FavoriteToggleVariables) => mutation.mutate(bindOperation(variables)),
    mutateAsync: (variables: FavoriteToggleVariables) => mutation.mutateAsync(bindOperation(variables)),
  };
}


/** Derives favorited state from the useFavorites() cache — no extra DB query per card. */
export function useIsFavorited(listing_id: string) {
  const favorites = useFavorites();
  const isFavorited = (favorites.data ?? []).some(
    (f: { listing_id: string }) => f.listing_id === listing_id
  );
  return { data: isFavorited, isLoading: favorites.isLoading };
}
