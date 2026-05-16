import { Link } from "react-router-dom";
import { Gavel, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard, type Property } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { getAuctionStreetViewImageUrl } from "@/lib/auctionStreetView";

type HomepageAuctionImage = {
  sort_order?: number | null;
  url?: string | null;
};

type HomepageAuctionListing = {
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
  listing_images?: HomepageAuctionImage[] | null;
  cover_image_url?: string | null;
  property_type?: Property["type"] | null;
  listing_type?: Property["listingType"] | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  ai_score?: number | null;
  views_count?: number | null;
  tags?: string[] | null;
  is_pre_sale?: boolean | null;
  construction_status?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  region?: string | null;
};

interface Props {
  listings: HomepageAuctionListing[];
  isLoading: boolean;
}

const getSortedListingImages = (listing: HomepageAuctionListing): string[] => {
  return [...(listing.listing_images ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => img.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
};

// skipcq: JS-R1005 - Image fallback selection intentionally prefers listing media before Street View.
const getHomepageAuctionImages = (listing: HomepageAuctionListing): string[] => {
  const fallbackImages = getSortedListingImages(listing);
  const streetView = getAuctionStreetViewImageUrl(listing);
  const images = listing.cover_image_url ? [listing.cover_image_url] : fallbackImages;
  return images.length ? images : streetView ? [streetView] : [];
};

const toOptionalNumber = (value: unknown): number | undefined =>
  value ? Number(value) : undefined;

const valueOr = <T,>(value: T | null | undefined, fallback: T): T =>
  value ?? fallback;

const valueOrUndefined = <T,>(value: T | null | undefined): T | undefined =>
  value ?? undefined;

const textOr = (value: string | null | undefined, fallback: string): string =>
  value || fallback;

const formatAuctionDate = (value: unknown): string | undefined =>
  typeof value === "string" && value
    ? new Date(value).toLocaleDateString("en-GB")
    : undefined;

const getAuctionLocation = (listing: HomepageAuctionListing) => ({
  address: textOr(listing.address, listing.city),
  city: listing.city,
});

const getAuctionPriceFields = (listing: HomepageAuctionListing) => ({
  price: Number(valueOr(listing.price, 0)),
  pricePerSqm: toOptionalNumber(listing.price_per_sqm),
  auctionStartingBid: toOptionalNumber(listing.auction_starting_bid),
});

// skipcq: JS-R1005 - Field normalization intentionally maps nullable auction values into PropertyCard props.
const getAuctionDetails = (listing: HomepageAuctionListing) => ({
  bedrooms: valueOrUndefined(listing.bedrooms),
  bathrooms: valueOrUndefined(listing.bathrooms),
  sqm: Number(valueOr(listing.sqm, 0)),
  floor: valueOrUndefined(listing.floor),
  totalFloors: valueOrUndefined(listing.total_floors),
  yearBuilt: valueOrUndefined(listing.year_built),
  energyClass: valueOrUndefined(listing.energy_class),
});

// skipcq: JS-R1005 - Field normalization intentionally maps nullable auction metadata into PropertyCard props.
const getAuctionMetadata = (listing: HomepageAuctionListing) => ({
  images: getHomepageAuctionImages(listing),
  type: valueOr(listing.property_type, "apartment"),
  listingType: valueOr(listing.listing_type, "auction"),
  auctionDate: formatAuctionDate(listing.auction_date),
  aiScore: valueOrUndefined(listing.ai_score),
  views: valueOrUndefined(listing.views_count),
  tags: valueOr(listing.tags, []),
  isPreSale: valueOr(listing.is_pre_sale, false),
  constructionStatus: valueOrUndefined(listing.construction_status),
});

const toAuctionCardProperty = (listing: HomepageAuctionListing): Property => ({
  id: listing.id,
  title: listing.title,
  ...getAuctionLocation(listing),
  ...getAuctionPriceFields(listing),
  ...getAuctionDetails(listing),
  ...getAuctionMetadata(listing),
});

const LoadingCard = () => (
  <div className="glass-card rounded-2xl border border-border overflow-hidden animate-pulse">
    <div className="bg-muted h-52 w-full" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-muted rounded-md w-3/4" />
      <div className="h-3 bg-muted rounded-md w-1/2" />
      <div className="h-5 bg-muted rounded-md w-1/3" />
    </div>
  </div>
);

const LOADING_CARD_KEYS = ["auction-loading-1", "auction-loading-2", "auction-loading-3", "auction-loading-4"];

export const HomepageAuctionsSection = ({ listings, isLoading }: Props) => {
  const { ref, inView } = useInView();
  const featuredListings = listings.slice(0, 4);
  const showLoadingCards = isLoading && listings.length === 0;

  return (
    <section className="py-10 sm:py-16 bg-secondary">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gavel className="w-4 h-4 text-brand-purple-dark" />
              <span className="text-xs font-semibold text-brand-purple-dark uppercase tracking-widest">Greek Auctions</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">This Week's Auctions</h2>
          </div>
          <Button variant="outline" size="sm" className="border-brand-purple-dark/30 text-brand-purple-dark hover:bg-brand-purple-dark/10 text-xs" asChild>
            <Link to="/auctions">
              All Auctions <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {featuredListings.map((listing) => (
            <PropertyCard key={listing.id} property={toAuctionCardProperty(listing)} />
          ))}
          {showLoadingCards &&
            LOADING_CARD_KEYS.map((key) => (
              <LoadingCard key={key} />
            ))}
        </div>
      </div>
    </section>
  );
};
