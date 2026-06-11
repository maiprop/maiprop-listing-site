type ListingRouteListing = {
  id?: string | null;
  is_pre_sale?: boolean | null;
  listing_type?: string | null;
};

export const shouldUseNewBuildRoute = (
  listing: ListingRouteListing | null | undefined,
): boolean => Boolean(listing?.is_pre_sale || listing?.listing_type === "new_build");

export const getListingDetailPath = (
  listing: ListingRouteListing,
): string => {
  const id = listing.id ?? "";
  if (listing.listing_type === "auction") return `/auction/${id}`;
  if (listing.listing_type === "open_house") return `/open-house/${id}`;
  if (shouldUseNewBuildRoute(listing)) return `/new-build/${id}`;
  return `/property/${id}`;
};
