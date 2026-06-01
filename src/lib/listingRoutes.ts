type NewBuildRouteListing = {
  is_pre_sale?: boolean | null;
  listing_type?: string | null;
};

export const shouldUseNewBuildRoute = (
  listing: NewBuildRouteListing | null | undefined,
): boolean => Boolean(listing?.is_pre_sale || listing?.listing_type === "new_build");
