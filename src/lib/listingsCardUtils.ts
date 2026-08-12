import { dbListingToCard } from "@/lib/listingUtils";
import type { ListingCard } from "@/types";
import type { ListingWithJoins } from "@/hooks/useListings";

/** Subset of the raw DB listing fields the listings page reads through `_raw` for client-side filtering. */
export type RawListingFields = Pick<
  ListingWithJoins,
  "created_at" | "has_video_tour" | "has_virtual_tour" | "ai_score" | "walkability_score" | "publicationId"
>;

/** Card type with the typed `_raw` payload that listingToCard() actually attaches. */
export type ListingCardWithRaw = ListingCard & { _raw?: RawListingFields };

/** Convert an enriched DB listing row into a ListingCard with `_raw` attached for client-side filtering. */
export function listingToCard(l: ListingWithJoins): ListingCardWithRaw {
  return dbListingToCard(l, {
    includeOwnership: true,
    includeCoordinates: true,
    filterDisplayTags: true,
    includeRaw: true,
    maxImages: 3,
  }) as ListingCardWithRaw;
}
