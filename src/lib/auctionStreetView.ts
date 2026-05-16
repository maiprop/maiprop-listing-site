import { getStreetViewProxyUrl } from "@/lib/config";

type AuctionStreetViewInput = {
  cover_image_url?: string | null;
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

export const getAuctionStreetViewLocation = (auction: AuctionStreetViewInput): string | null => {
  const parts = [auction.address, auction.city, auction.region, "Greece"]
    .filter(hasText)
    .map((part) => part.trim());

  const uniqueParts = [...new Set(parts)];
  return uniqueParts.length > 1 ? uniqueParts.join(", ") : null;
};

export const getAuctionStreetViewImageUrl = (
  auction: AuctionStreetViewInput,
  size = "800x450",
): string | null => {
  if (hasText(auction.cover_image_url)) return auction.cover_image_url.trim();

  const lat = toFiniteNumber(auction.latitude);
  const lng = toFiniteNumber(auction.longitude);
  if (isInCoordinateRange(lat, -90, 90) && isInCoordinateRange(lng, -180, 180)) {
    return getStreetViewProxyUrl({ lat, lng }, size);
  }

  const location = getAuctionStreetViewLocation(auction);
  return location ? getStreetViewProxyUrl({ location }, size) : null;
};

export const getAuctionImageList = (
  auction: AuctionStreetViewInput,
  size = "800x450",
): string[] => {
  const imageUrl = getAuctionStreetViewImageUrl(auction, size);
  return imageUrl ? [imageUrl] : [];
};
