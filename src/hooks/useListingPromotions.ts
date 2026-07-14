import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type ListingPromotionType = "spotlight" | "priority" | "bundle";

const creditBalanceSchema = z.object({
  included: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  addons: z.number().int().nonnegative(),
});

const promotionBalanceSchema = z.object({
  cycle_start: z.string(),
  spotlight: creditBalanceSchema,
  priority: creditBalanceSchema,
  bundles: z.object({ addons: z.number().int().nonnegative() }),
});

export type ListingPromotionBalance = z.infer<typeof promotionBalanceSchema>;

const promotionQueryKeys = [
  ["listing-promotion-balance"],
  ["my-listings"],
  ["homepage-featured"],
  ["listings"],
] as const;

function createRequestKey(listingId: string, promotionType: ListingPromotionType) {
  const nonce = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${listingId}:${promotionType}:${nonce}`;
}

function promotionErrorMessage(error: Error) {
  if (error.message.includes("entitlement_required")) {
    return "No promotion credit is available. Buy an add-on or use an included monthly credit.";
  }
  return "Could not update this promotion. Please try again.";
}

export function useListingPromotionBalance(enabled = true) {
  return useQuery({
    queryKey: ["listing-promotion-balance"],
    queryFn: async (): Promise<ListingPromotionBalance> => {
      const { data, error } = await supabase.rpc("get_listing_promotion_balance");
      if (error) throw error;
      return promotionBalanceSchema.parse(data);
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useActivateListingPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      promotionType,
    }: {
      listingId: string;
      promotionType: ListingPromotionType;
    }) => {
      const { data, error } = await supabase.rpc("activate_listing_promotion", {
        p_listing_id: listingId,
        p_promotion_type: promotionType,
        p_request_key: createRequestKey(listingId, promotionType),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all(
        promotionQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      toast.success("Listing promotion activated for 30 days.");
    },
    onError: (error: Error) => toast.error(promotionErrorMessage(error)),
  });
}

export function useDeactivateListingPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      promotionType,
    }: {
      listingId: string;
      promotionType: Exclude<ListingPromotionType, "bundle">;
    }) => {
      const { data, error } = await supabase.rpc("deactivate_listing_promotion", {
        p_listing_id: listingId,
        p_promotion_type: promotionType,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all(
        promotionQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      toast.success("Listing promotion removed.");
    },
    onError: () => toast.error("Could not remove this promotion. Please try again."),
  });
}
