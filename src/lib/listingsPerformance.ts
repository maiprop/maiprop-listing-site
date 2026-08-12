import type { MapListing } from "@/components/map/mapConfig";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

export const GRID_RENDER_INITIAL = 48;
export const GRID_RENDER_INCREMENT = 24;
export const SPLIT_RENDER_INITIAL = 36;
export const SPLIT_RENDER_INCREMENT = 18;

export function getRenderedListings<T>(listings: T[], limit: number): T[] {
  return listings.slice(0, Math.max(0, limit));
}

export function mapListingFromCard(property: ListingCardWithRaw): MapListing {
  return {
    id: property.id,
    title: property.title,
    price: property.price,
    sqm: property.sqm,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    latitude: property.latitude,
    longitude: property.longitude,
    images: property.images?.slice(0, 1),
    listingType: property.listingType,
    city: property.city,
    _raw: {
      publicationId: property._raw?.publicationId,
      price_per_sqm: property.pricePerSqm,
      property_type: property.type,
      tags: property.tags,
      cover_image_url: property.images?.[0],
      auction_date: property.auctionDate,
      auction_starting_bid: property.auctionStartingBid,
      price: property.price,
      floor: property.floor,
      year_built: property.yearBuilt,
    },
  };
}
