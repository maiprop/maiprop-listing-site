import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import {
  listingIdSchema,
  listingUpdateMutationSchema,
  listingWriteSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import {
  createListingForUser,
  deleteListingForUser,
  updateListingForUser,
} from "@/hooks/listingManagementBoundary";

export const useTrackListingView = () => {
  return useMutation({
    mutationFn: async (listingId: string) => {
      const parsedListingId = parseMutationInput(listingIdSchema, listingId, "listing id");
      const viewTtlMs = 6 * 60 * 60 * 1000;
      const storageKey = `maiprop_viewed_${parsedListingId}`;
      const now = Date.now();
      const lastTracked = Number(localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey) ?? "0");
      if (Number.isFinite(lastTracked) && now - lastTracked < viewTtlMs) return;

      const sampleRate = Number(import.meta.env.VITE_VIEW_TRACKING_SAMPLE_RATE ?? "1");
      if (Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate < 1 && Math.random() > sampleRate) return;

      try {
        const { data, error } = await supabase.functions.invoke("record-listing-view", {
          body: { listingId: parsedListingId },
        });
        if (error) {
          logger.warn("View tracking failed:", error);
          return;
        }

        const result = data as { recorded?: boolean } | null;
        if (result?.recorded === false) return;

        localStorage.setItem(storageKey, String(now));
        sessionStorage.setItem(storageKey, String(now));
      } catch (error: unknown) {
        logger.warn("View tracking failed:", error);
      }
    },
  });
};

export const useCreateListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listing: {
      title: string; city: string; price: number; sqm: number;
      property_type: string; listing_type: string; description?: string;
      address?: string; bedrooms?: number; bathrooms?: number;
      cover_image_url?: string; tags?: string[];
      latitude?: number; longitude?: number;
      auction_date?: string; auction_starting_bid?: number;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(listingWriteSchema, {
        ...listing,
        owner_id: user.id,
        status: "active" as Enums<"listing_status">,
        listing_type: listing.listing_type as TablesInsert<"listings">["listing_type"],
        property_type: listing.property_type as TablesInsert<"listings">["property_type"],
      }, "listing") as TablesInsert<"listings">;
      return createListingForUser(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Listing published successfully!");
    },
    onError: (error: Error) => {
      const message = getPlanLimitErrorMessage(error);
      toast.error(message ?? error.message);
    },
  });
};

export const useUpdateListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"listings"> }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(listingUpdateMutationSchema, { id, updates }, "listing update");
      return updateListingForUser(
        payload.id,
        payload.updates as TablesUpdate<"listings">,
      );
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Listing updated!");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useDeleteListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Must be logged in");
      const listingId = parseMutationInput(listingIdSchema, id, "listing id");
      await deleteListingForUser(listingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Listing deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};
