import { dbListingToCard, type DbListingToCardOptions } from "@/lib/listingUtils";
import type { DbListingCardRow, PropertyCardViewModel } from "@/lib/domainContracts";

export const buildPropertyCardViewModel = (
  listing: DbListingCardRow,
  options: DbListingToCardOptions = {},
): PropertyCardViewModel => dbListingToCard(listing, options);
