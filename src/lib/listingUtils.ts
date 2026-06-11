/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared utilities for converting DB listing rows to PropertyCard-compatible objects.
 */

import { getOwnerParticipantType } from "./participantConfig";
import type { ListingCard } from "@/types";

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
  "auction_pool:",
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
): ListingCard {
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
    auctionDate: l.listing_type === "open_house" && l.open_house_date
      ? new Date(l.open_house_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
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
    isFeatured: !!l.is_featured,
    priorityPlacement: Number(l.priority_placement) || 0,
    isPreSale: l.listing_type === "new_build",
    constructionStatus: l.construction_status ?? undefined,
    walkabilityScore: l.walkability_score != null ? Number(l.walkability_score) : undefined,
    safetyScore: l.safety_score != null ? Number(l.safety_score) : undefined,
    noiseScore: l.noise_score != null ? Number(l.noise_score) : undefined,
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
