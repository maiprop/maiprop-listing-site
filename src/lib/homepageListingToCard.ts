import { dbListingToCard } from "@/lib/listingUtils";
import type { HomepageListing } from "@/lib/homepageListings";
import type { Property } from "@/components/PropertyCard";
import type { ListingKind } from "@/lib/domainContracts";

function normalizedListingType(listing: HomepageListing): ListingKind {
  const isProjectNewBuild = listing.listing_type === "new_build" && Boolean(listing.project_id);
  if (listing.listing_type === "new_build" && !isProjectNewBuild) return "sale";
  return (listing.listing_type ?? "sale") as ListingKind;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function homepageListingToCard(listing: HomepageListing): Property {
  const listingType = normalizedListingType(listing);
  const project = listing.project ?? listing.projects ?? null;

  return dbListingToCard({
    ...listing,
    city: listing.city || "",
    price: listing.price ?? null,
    sqm: listing.sqm ?? null,
    property_type: listing.property_type ?? "apartment",
    listing_type: listingType,
    project,
    projects: listing.projects ?? null,
    profiles: listing.profiles ?? null,
    listing_images: listing.listing_images ?? null,
    latitude: numberOrNull(listing.latitude),
    longitude: numberOrNull(listing.longitude),
  }, {
    filterDisplayTags: true,
    maxImages: 3,
  });
}
