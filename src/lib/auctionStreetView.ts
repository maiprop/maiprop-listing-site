/* eslint complexity: "off" */
import { getStreetViewProxyUrl } from "@/lib/config";
import { MAIPROP_LOGO_FALLBACK_URL } from "@/lib/imageFallbacks";

export const AUCTION_FALLBACK_LOGO_URL = MAIPROP_LOGO_FALLBACK_URL;

type AuctionStreetViewInput = {
  cover_image_url?: string | null;
  images?: (string | null | undefined)[] | null;
  listing_images?: { sort_order?: number | null; url?: string | null }[] | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
};

const toFiniteNumber = (value: unknown): number | null => { // skipcq: JS-R1005
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isInCoordinateRange = (value: number | null, min: number, max: number): value is number =>
  value != null && value >= min && value <= max;

const getCoverImageUrl = (auction: AuctionStreetViewInput): string | null =>
  hasText(auction.cover_image_url) ? auction.cover_image_url.trim() : null;

const getSortedListingImageUrls = (auction: AuctionStreetViewInput): string[] =>
  [...(auction.listing_images ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((image) => image.url)
    .filter(hasText)
    .map((url) => url.trim());

const getExtraImageUrls = (auction: AuctionStreetViewInput): string[] =>
  (auction.images ?? [])
    .filter(hasText)
    .map((url) => url.trim());

const uniqueImageUrls = (images: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  return images.filter((image): image is string => {
    if (!image || seen.has(image)) return false;
    seen.add(image);
    return true;
  });
};

export const getAuctionStreetViewLocation = (auction: AuctionStreetViewInput): string | null => {
  const parts = [auction.address, auction.city, auction.region, "Greece"]
    .filter(hasText)
    .map((part) => part.trim());

  const uniqueParts = [...new Set(parts)];
  return uniqueParts.length > 1 ? uniqueParts.join(", ") : null;
};

export const getAuctionStreetViewCandidateUrl = (
  auction: AuctionStreetViewInput,
  size = "800x450",
): string | null => {
  const lat = toFiniteNumber(auction.latitude);
  const lng = toFiniteNumber(auction.longitude);
  if (isInCoordinateRange(lat, -90, 90) && isInCoordinateRange(lng, -180, 180)) {
    return getStreetViewProxyUrl({ lat, lng }, size);
  }

  const location = getAuctionStreetViewLocation(auction);
  if (location) return getStreetViewProxyUrl({ location }, size);

  return null;
};

export const getAuctionStreetViewImageUrl = (
  auction: AuctionStreetViewInput,
  size = "800x450",
): string | null => {
  return getAuctionImageList(auction, size)[0] ?? AUCTION_FALLBACK_LOGO_URL;
};

export const getAuctionImageList = (
  auction: AuctionStreetViewInput,
  size = "800x450",
): string[] => {
  const streetViewUrl = getAuctionStreetViewCandidateUrl(auction, size);
  const fallbackImages = [
    getCoverImageUrl(auction),
    ...getSortedListingImageUrls(auction),
    ...getExtraImageUrls(auction),
  ];
  const images = uniqueImageUrls([streetViewUrl, ...fallbackImages]);
  return images.length ? images : [AUCTION_FALLBACK_LOGO_URL];
};
