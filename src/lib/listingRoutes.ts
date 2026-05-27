import type { ListingWithJoins } from "@/hooks/useListings";

export const shouldUseNewBuildRoute = (
  listing: Pick<ListingWithJoins, "is_pre_sale" | "listing_type"> | null | undefined,
) => Boolean(listing?.is_pre_sale || listing?.listing_type === "new_build");
