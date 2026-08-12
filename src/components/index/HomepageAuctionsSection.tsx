/* eslint complexity: "off" */
import { Link } from "react-router-dom";
import { Gavel, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard, type Property } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { AUCTION_FALLBACK_LOGO_URL, getAuctionStreetViewCandidateUrl } from "@/lib/auctionStreetView";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import { useTranslation } from "react-i18next";

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
  isError?: boolean;
  onRetry?: () => unknown;
}

const HOMEPAGE_AUCTION_STREET_VIEW_SIZE = "480x270";

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isStreetViewProxyUrl = (value: string): boolean =>
  value.includes("/streetview-proxy") || value.includes("/functions/v1/streetview-proxy");

const uniqueImageUrls = (images: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  return images.filter((image): image is string => {
    if (!image || seen.has(image)) return false;
    seen.add(image);
    return true;
  });
};

const getStoredPhotoUrl = (value: unknown): string | null => {
  if (!hasText(value)) return null;
  const url = value.trim();
  return isStreetViewProxyUrl(url) ? null : url;
};

const getHomepageAuctionImages = (listing: HomepageAuctionListing): string[] => { // skipcq: JS-R1005
  const existingImages = [
    getStoredPhotoUrl(listing.cover_image_url),
    ...(listing.listing_images ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((image) => image.url)
      .map(getStoredPhotoUrl),
  ];
  const streetViewFallback = getAuctionStreetViewCandidateUrl(listing, HOMEPAGE_AUCTION_STREET_VIEW_SIZE);
  const images = uniqueImageUrls([...existingImages, streetViewFallback]);
  return images.length ? images : [AUCTION_FALLBACK_LOGO_URL];
};

const toOptionalNumber = (value: unknown): number | undefined =>
  value ? Number(value) : undefined;

const valueOr = <T,>(value: T | null | undefined, fallback: T): T =>
  value ?? fallback;

const valueOrUndefined = <T,>(value: T | null | undefined): T | undefined =>
  value ?? undefined;

const textOr = (value: string | null | undefined, fallback: string): string =>
  value || fallback;

const formatAuctionDate = (value: unknown, locale: string): string | undefined => {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(date);
};

const getAuctionLocation = (listing: HomepageAuctionListing) => ({
  address: textOr(listing.address, listing.city),
  city: listing.city,
});

const getAuctionPriceFields = (listing: HomepageAuctionListing) => ({
  price: Number(valueOr(listing.price, 0)),
  pricePerSqm: calculatePricePerSqm({
    price: listing.price,
    sqm: listing.sqm,
    storedPricePerSqm: listing.price_per_sqm,
  }) ?? undefined,
  auctionStartingBid: toOptionalNumber(listing.auction_starting_bid),
});

const getAuctionDetails = (listing: HomepageAuctionListing) => ({ // skipcq: JS-R1005
  bedrooms: valueOrUndefined(listing.bedrooms),
  bathrooms: valueOrUndefined(listing.bathrooms),
  sqm: Number(valueOr(listing.sqm, 0)),
  floor: valueOrUndefined(listing.floor),
  totalFloors: valueOrUndefined(listing.total_floors),
  yearBuilt: valueOrUndefined(listing.year_built),
  energyClass: valueOrUndefined(listing.energy_class),
});

const getAuctionMetadata = (listing: HomepageAuctionListing, locale: string) => ({ // skipcq: JS-R1005
  images: getHomepageAuctionImages(listing),
  type: valueOr(listing.property_type, "apartment"),
  listingType: valueOr(listing.listing_type, "auction"),
  auctionDate: formatAuctionDate(listing.auction_date, locale),
  aiScore: valueOrUndefined(listing.ai_score),
  views: valueOrUndefined(listing.views_count),
  tags: valueOr(listing.tags, []),
  isPreSale: listing.listing_type === "new_build",
  constructionStatus: valueOrUndefined(listing.construction_status),
});

const toAuctionCardProperty = (listing: HomepageAuctionListing, locale: string): Property => ({
  id: listing.id,
  title: listing.title,
  ...getAuctionLocation(listing),
  ...getAuctionPriceFields(listing),
  ...getAuctionDetails(listing),
  ...getAuctionMetadata(listing, locale),
  _raw: listing,
});

const LoadingCard = () => (
  <div data-testid="auction-loading-card" className="glass-card rounded-2xl border border-border overflow-hidden animate-pulse">
    <div className="bg-muted h-52 w-full" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-muted rounded-md w-3/4" />
      <div className="h-3 bg-muted rounded-md w-1/2" />
      <div className="h-5 bg-muted rounded-md w-1/3" />
    </div>
  </div>
);

const LOADING_CARD_KEYS = ["auction-loading-1", "auction-loading-2", "auction-loading-3", "auction-loading-4"];

export const HomepageAuctionsSection = ({ listings, isLoading, isError = false, onRetry }: Props) => {
  const { ref, inView } = useInView();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith("el") ? "el-GR" : "en-GB";
  const featuredListings = listings.slice(0, 4);

  return (
    <section className="py-10 sm:py-16 bg-secondary">
      <div ref={ref} className="container">
        <div className={`flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gavel className="w-4 h-4 text-brand-purple-dark" />
              <span className="text-xs font-semibold text-brand-purple-dark uppercase tracking-widest">{t("home.catalogue.auctionsEyebrow")}</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">{t("home.catalogue.auctionsTitle")}</h2>
          </div>
          <Button variant="outline" size="sm" className="max-w-full shrink-0 border-brand-purple-dark/30 text-brand-purple-dark hover:bg-brand-purple-dark/10 text-xs" asChild>
            <Link to="/auctions">
              {t("home.catalogue.allAuctions")} <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {isLoading ? (
            LOADING_CARD_KEYS.map((key) => <LoadingCard key={key} />)
          ) : isError ? (
            <div role="alert" className="col-span-full py-12 text-center text-sm text-muted-foreground">
              <p>{t("home.catalogue.auctionsError")}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                {t("common.retry")}
              </Button>
            </div>
          ) : featuredListings.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              {t("home.catalogue.auctionsEmpty")}
            </p>
          ) : featuredListings.map((listing, index) => (
              <PropertyCard
                key={listing.id}
                property={toAuctionCardProperty(listing, dateLocale)}
                imagePriority={index < 4}
                deferOffscreenRendering={false}
              />
            ))}
        </div>
      </div>
    </section>
  );
};
