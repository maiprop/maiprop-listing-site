/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "react-router-dom";
import { Gavel, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { getAuctionStreetViewImageUrl } from "@/lib/auctionStreetView";

interface Props {
  listings: any[];
  isLoading: boolean;
}

const getSortedListingImages = (listing: any): string[] => {
  return [...(listing.listing_images ?? [])]
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((img: any) => img.url);
};

const getHomepageAuctionImages = (listing: any): string[] => { // skipcq: JS-R1005
  const fallbackImages = getSortedListingImages(listing);
  const streetView = getAuctionStreetViewImageUrl(listing);
  const images = listing.cover_image_url ? [listing.cover_image_url] : fallbackImages;
  return images.length ? images : streetView ? [streetView] : [];
};

const toOptionalNumber = (value: unknown): number | undefined =>
  value ? Number(value) : undefined;

const formatAuctionDate = (value: unknown): string | undefined =>
  typeof value === "string" && value
    ? new Date(value).toLocaleDateString("en-GB")
    : undefined;

const toAuctionCardProperty = (listing: any) => ({ // skipcq: JS-R1005 - Adapts OS auction rows into the shared property card shape.
  id: listing.id,
  title: listing.title,
  address: listing.address || listing.city,
  city: listing.city,
  price: Number(listing.price),
  pricePerSqm: toOptionalNumber(listing.price_per_sqm),
  bedrooms: listing.bedrooms,
  bathrooms: listing.bathrooms,
  sqm: Number(listing.sqm),
  floor: listing.floor,
  totalFloors: listing.total_floors,
  yearBuilt: listing.year_built,
  energyClass: listing.energy_class,
  images: getHomepageAuctionImages(listing),
  type: listing.property_type,
  listingType: listing.listing_type,
  auctionDate: formatAuctionDate(listing.auction_date),
  auctionStartingBid: toOptionalNumber(listing.auction_starting_bid),
  aiScore: listing.ai_score,
  views: listing.views_count,
  tags: listing.tags || [],
  isPreSale: listing.is_pre_sale ?? false,
  constructionStatus: listing.construction_status ?? undefined,
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
          {featuredListings.map((listing: any) => (
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
