import type { Property } from "@/components/PropertyCard";

export type HomepageListingImage = {
  url: string;
  sort_order?: number | null;
};

export type HasHomepageImages = {
  cover_image_url?: string | null;
  listing_images?: HomepageListingImage[] | null;
};

export type HomepageListing = HasHomepageImages & {
  id: string;
  title: string;
  address?: string | null;
  city: string;
  price?: number | string | null;
  price_per_sqm?: number | string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqm?: number | string | null;
  floor?: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  energy_class?: string | null;
  property_type?: Property["type"] | null;
  listing_type?: Property["listingType"] | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  open_house_date?: string | null;
  ai_score?: number | null;
  views_count?: number | null;
  tags?: string[] | null;
  is_pre_sale?: boolean | null;
  construction_status?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  region?: string | null;
};

export const sortByImagePresence = <T extends HasHomepageImages>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const aHasImg = Boolean(a.cover_image_url || a.listing_images?.length);
    const bHasImg = Boolean(b.cover_image_url || b.listing_images?.length);
    return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
  });

export const isSupervisorFixture = (row: Pick<HomepageListing, "title" | "address">): boolean =>
  [row.title, row.address].some((value) => typeof value === "string" && /\bsupervisor-\d+\b/i.test(value));

export const publicHomepageRows = (rows: HomepageListing[], limit = 6): HomepageListing[] =>
  rows.filter((row) => !isSupervisorFixture(row)).slice(0, limit);

export const homepageListingImages = (listing: HasHomepageImages): string[] => {
  const images = listing.cover_image_url ? [listing.cover_image_url] : [];
  if (images.length || !listing.listing_images?.length) return images;

  return listing.listing_images
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((image) => image.url)
    .filter(Boolean);
};
