import type { ListingWithJoins } from "@/hooks/useListings";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export const AUCTION_DETAIL_LOOKUP_LIMIT = 60;
export const AUCTION_DETAIL_QUERY_STALE_TIME = 5 * 60_000;

export type AuctionRouteState = {
  auction?: Record<string, unknown>;
  listing?: Record<string, unknown>;
};

export const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== null) return numberValue;
  }
  return null;
};

export const getNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

export const getAuctionFromRouteState = (
  state?: AuctionRouteState,
): Record<string, unknown> | null => {
  if (state?.auction) return state.auction;
  if (state?.listing?.listing_type === "auction") return state.listing;
  return null;
};

export const getSafeAuctionWebsiteUrl = (
  auction: Record<string, unknown> | null | undefined,
): string | null => {
  const url = getNullableString(auction?.website_url);
  return url && /^https?:\/\//i.test(url) ? url : null;
};

export const mergeAuctionDetailData = (
  primary: Record<string, unknown> | null,
  exact: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!primary) return exact;
  if (!exact) return primary;

  const merged = { ...exact, ...primary };
  const primaryUrl = getSafeAuctionWebsiteUrl(primary);
  const exactUrl = getSafeAuctionWebsiteUrl(exact);
  if (!primaryUrl && exactUrl) merged.website_url = exactUrl;
  return merged;
};

export const buildAuctionInsightsListing = (
  auction: Record<string, unknown>,
  fallbackId: string,
): ListingWithJoins => {
  const getStringValue = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() ? value : fallback;
  const getAuctionTags = (tags: unknown): string[] =>
    Array.isArray(tags)
      ? tags.filter((tag): tag is string => typeof tag === "string")
      : [];
  const bid = asNumber(auction.auction_starting_bid) ?? asNumber(auction.price) ?? 0;
  const sqm = asNumber(auction.sqm) ?? 1;

  return {
    ...auction,
    id: getStringValue(auction.id, fallbackId),
    title: getStringValue(auction.title, "Auction Property"),
    city: getStringValue(auction.city, ""),
    address: getNullableString(auction.address),
    price: bid,
    auction_starting_bid: bid,
    auction_date: getNullableString(auction.auction_date),
    sqm,
    bedrooms: asNumber(auction.bedrooms),
    bathrooms: asNumber(auction.bathrooms),
    floor: firstNumber(auction.floor, auction.propertyFloor, auction.property_floor),
    total_floors: firstNumber(
      auction.total_floors,
      auction.totalFloors,
      auction.numberOfFloors,
      auction.number_of_floors,
    ),
    year_built: asNumber(auction.year_built),
    energy_class: getNullableString(auction.energy_class),
    price_per_sqm: calculatePricePerSqm({
      price: bid,
      sqm,
      storedPricePerSqm: auction.price_per_sqm,
    }),
    property_type: getNullableString(auction.property_type),
    listing_type: "auction",
    region: getNullableString(auction.region),
    latitude: asNumber(auction.latitude),
    longitude: asNumber(auction.longitude),
    tags: getAuctionTags(auction.tags),
    listing_images: [],
    profiles: null,
    ownerIsPro: false,
    ownerParticipantType: null,
  } as unknown as ListingWithJoins;
};
