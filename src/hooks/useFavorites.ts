import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { favoriteToggleSchema, parseMutationInput } from "@/lib/mutationSchemas";
import type { DbListingCardRow } from "@/lib/domainContracts";
import type { Database } from "@/integrations/supabase/types";

type FavoriteRow = Database["public"]["Tables"]["favorites"]["Row"];
type FullFavorite = FavoriteRow & { listings: DbListingCardRow | null };
const membershipKey = (id: string) => ["favoriteMembership", id] as const;
const fullKey = (id: string) => ["favorites", id] as const;

const membershipOptions = (id: string) => ({
  queryKey: membershipKey(id),
  queryFn: async (): Promise<FavoriteRow[]> => {
    const { data, error } = await supabase.from("favorites").select("*").eq("user_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  staleTime: USER_SCOPED_QUERY_STALE_TIME,
});

/** One actor-scoped row read shared by all membership-only consumers. */
export function useFavoriteMembership() {
  const { user } = useAuth();
  return useQuery({ ...membershipOptions(user?.id ?? ""), enabled: !!user });
}

/** Returns the current user's saved/favorited listings with full listing data joined. */
export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: fullKey(user?.id ?? ""),
    queryFn: async (): Promise<FullFavorite[]> => {
      if (!user) return [];
      const favoriteRows = await queryClient.fetchQuery(membershipOptions(user.id));
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

      return favoriteRows.map((favorite) => ({
        ...favorite,
        listings: listingById.get(favorite.listing_id) ?? null,
      }));
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

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
  operationUserId: string;
  listingId: string;
  membership: { previous: FavoriteRow | undefined; index: number; existed: boolean };
  full: { previous: FullFavorite | undefined; index: number; existed: boolean };
};

const pendingByClient = new WeakMap<object, Map<string, { count: number; succeeded: boolean }>>();

function updateListing<T extends { listing_id: string }>(rows: T[] | undefined, listingId: string, replacement?: T): T[] {
  const remaining = (rows ?? []).filter(row => row.listing_id !== listingId);
  return replacement ? [replacement, ...remaining] : remaining;
}

function previousListing<T extends { listing_id: string }>(rows: T[] | undefined, listingId: string) {
  return { previous: rows?.find(row => row.listing_id === listingId), index: rows?.findIndex(row => row.listing_id === listingId) ?? -1, existed: rows !== undefined };
}

function restoreListing<T extends { listing_id: string }>(rows: T[] | undefined, listingId: string, snapshot: { previous?: T; index: number; existed: boolean }): T[] | undefined {
  const remaining = (rows ?? []).filter(row => row.listing_id !== listingId);
  if (snapshot.previous) remaining.splice(Math.min(snapshot.index, remaining.length), 0, snapshot.previous);
  return !snapshot.existed && remaining.length === 0 ? undefined : remaining;
}

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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: membershipKey(operationUserId), exact: true }),
        queryClient.cancelQueries({ queryKey: fullKey(operationUserId), exact: true }),
      ]);
      const memberRows = queryClient.getQueryData<FavoriteRow[]>(membershipKey(operationUserId));
      const fullRows = queryClient.getQueryData<FullFavorite[]>(fullKey(operationUserId));
      const membership = previousListing(memberRows, listing_id);
      const full = previousListing(fullRows, listing_id);
      const optimisticRow: FavoriteRow = {
        id: `optimistic-${listing_id}`, listing_id, user_id: operationUserId,
        price_alert: priceAlert ?? false, price_when_saved: price ?? null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<FavoriteRow[]>(membershipKey(operationUserId), old => updateListing(old, listing_id, isFavorited ? undefined : optimisticRow));
      if (full.existed) queryClient.setQueryData<FullFavorite[]>(fullKey(operationUserId), old => updateListing(old, listing_id, isFavorited ? undefined : { ...optimisticRow, listings: null }));
      let pending = pendingByClient.get(queryClient);
      if (!pending) { pending = new Map(); pendingByClient.set(queryClient, pending); }
      const state = pending.get(operationUserId) ?? { count: 0, succeeded: false };
      state.count += 1;
      pending.set(operationUserId, state);
      return { operationUserId, listingId: listing_id, membership, full };
    },
    onError: (_err, _vars, context) => {
      if (context) {
        const { operationUserId, listingId, membership, full } = context;
        const memberKey = membershipKey(operationUserId);
        const restoredMembers = restoreListing(queryClient.getQueryData<FavoriteRow[]>(memberKey), listingId, membership);
        if (restoredMembers) queryClient.setQueryData(memberKey, restoredMembers);
        else queryClient.removeQueries({ queryKey: memberKey, exact: true });
        if (full.existed) queryClient.setQueryData<FullFavorite[]>(fullKey(operationUserId), old => restoreListing(old, listingId, full));
      }
      toast.error(t("toasts.favorites.errorToggle"));
    },
    onSuccess: (_, { isFavorited, priceAlert }, context) => {
      if (context) {
        const state = pendingByClient.get(queryClient)?.get(context.operationUserId);
        if (state) state.succeeded = true;
      }
      toast.success(
        isFavorited
          ? t("toasts.favorites.removed")
          : priceAlert
            ? t("toasts.favorites.savedWithAlert")
            : t("toasts.favorites.saved")
      );
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context) return;
      const pending = pendingByClient.get(queryClient);
      const state = pending?.get(context.operationUserId);
      if (!state) return;
      state.count -= 1;
      if (state.count === 0) {
        pending?.delete(context.operationUserId);
        if (state.succeeded) {
          queryClient.invalidateQueries({ queryKey: membershipKey(context.operationUserId), exact: true });
          queryClient.invalidateQueries({ queryKey: fullKey(context.operationUserId), exact: true });
        }
      }
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


/** Derives heart state from the shared row query. */
export function useIsFavorited(listing_id: string) {
  const favorites = useFavoriteMembership();
  const isFavorited = (favorites.data ?? []).some(
    (f: { listing_id: string }) => f.listing_id === listing_id
  );
  return { data: isFavorited, isLoading: favorites.isLoading };
}
