/**
 * Shared utilities for converting DB listing rows to PropertyCard-compatible objects.
 */

import { getOwnerParticipantType } from "./participantConfig";

const SYSTEM_TAG_PREFIXES = [
  "ownership:",
  "ownership_pct:",
  "round:",
  "posted",
  "status:",
  "source:",
  "os_auction:",
  "auction_status:",
  "sync:",
  "land_type:",
  "commercial_type:",
];

export interface DbListingToCardOptions {
  /** Include ownership fields (for listings page) */
  includeOwnership?: boolean;
  /** Include latitude/longitude */
  includeCoordinates?: boolean;
  /** Max images to include (default: all) */
  maxImages?: number;
  /** Filter tags to display-only (exclude system tags) */
  filterDisplayTags?: boolean;
  /** Include _raw listing for advanced use */
  includeRaw?: boolean;
}

/**
 * Convert a DB listing row (with profiles join) to a PropertyCard-compatible object.
 */
export function dbListingToCard(
  l: any,
  options: DbListingToCardOptions = {}
): {
  id: string;
  title: string;
  address: string;
  city: string;
  price: number;
  pricePerSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqm: number;
  images: string[];
  type: any;
  listingType: any;
  ownerParticipantType?: "agent" | "seller" | null;
  agent?: { name: string; verified: boolean; avatar?: string };
  auctionDate?: string;
  auctionStartingBid?: number;
  aiScore?: number;
  views?: number;
  tags?: string[];
  hasVideo?: boolean;
  hasVirtualTour?: boolean;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  energyClass?: string;
  ownershipStatus?: string;
  ownershipPercentage?: number;
  isFeatured?: boolean;
  priorityPlacement?: number;
  _raw?: any;
} {
  const {
    includeOwnership = false,
    includeCoordinates = false,
    maxImages,
    filterDisplayTags = false,
    includeRaw = false,
  } = options;

  const ownerParticipantType = getOwnerParticipantType(l.profiles ?? null);

  const tags: string[] = l.tags || [];
  let ownershipStatus: string | undefined;
  let ownershipPercentage: number | undefined;
  let displayTags = tags;

  if (includeOwnership) {
    const ownershipTag = tags.find((t: string) => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
    const ownershipPctTag = tags.find((t: string) => t.startsWith("ownership_pct:"));
    ownershipStatus = ownershipTag ? ownershipTag.split(":")[1] : undefined;
    ownershipPercentage = ownershipPctTag ? Number(ownershipPctTag.split(":")[1]) : undefined;
  }

  if (filterDisplayTags) {
    const cleanTags = tags.filter(
      (t: string) =>
        !SYSTEM_TAG_PREFIXES.some((p) => t.startsWith(p)) && !t.toLowerCase().startsWith("posted")
    );
    displayTags =
      cleanTags.length > 0
        ? cleanTags
        : [
            l.has_parking && "Parking",
            l.has_pool && "Pool",
            l.has_elevator && "Elevator",
            l.has_garden && "Garden",
            l.has_smart_home && "Smart Home",
          ].filter(Boolean) as string[];
  }

  let images = [...(l.cover_image_url ? [l.cover_image_url] : []), ...(l.listing_images?.map((img: any) => img.url) || [])].filter(Boolean);
  if (maxImages != null) images = images.slice(0, maxImages);

  const result: any = {
    id: l.id,
    title: l.title,
    address: l.address || l.city,
    city: l.city,
    price: Number(l.price),
    pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
    bedrooms: l.bedrooms ?? undefined,
    bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm),
    floor: l.floor != null ? Number(l.floor) : undefined,
    totalFloors: l.total_floors != null ? Number(l.total_floors) : undefined,
    yearBuilt: l.year_built ?? undefined,
    energyClass: l.energy_class ?? undefined,
    images,
    type: l.property_type,
    listingType: l.listing_type,
    openHouseDateIso: l.listing_type === "open_house" && l.open_house_date ? l.open_house_date : undefined,
    auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
    aiScore: l.ai_score ?? undefined,
    views: l.views_count ?? undefined,
    agent: l.profiles
      ? { name: l.profiles.display_name || "Owner", verified: l.profiles.verified || false, avatar: l.profiles.avatar_url }
      : undefined,
    ownerParticipantType,
    tags: filterDisplayTags ? displayTags : (tags.filter(Boolean) as string[]),
    hasVideo: l.has_video_tour,
    hasVirtualTour: l.has_virtual_tour,
    isFeatured: !!(l as any).is_featured,
    priorityPlacement: Number((l as any).priority_placement) || 0,
  };

  if (includeOwnership) {
    result.ownershipStatus = ownershipStatus;
    result.ownershipPercentage = ownershipPercentage;
  }
  if (includeCoordinates) {
    result.latitude = l.latitude;
    result.longitude = l.longitude;
  }
  if (includeRaw) result._raw = l;

  return result;
}
