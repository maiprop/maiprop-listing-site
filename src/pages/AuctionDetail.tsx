/**
 * AuctionDetail handles OS-synced auction listings.
 *
 * DB-backed auction listings are rendered by PropertyDetail through
 * AuctionRouter. This page intentionally mirrors that same detail layout so
 * auctions opened from /dashboard and /auctions feel like one product surface.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Bath,
  BedDouble,
  Building2,
  Calendar,
  ChevronLeft,
  Clock,
  ExternalLink,
  Gavel,
  Layers,
  Loader2,
  MapPin,
  Scale,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import PropertyGallery from "@/components/property/PropertyGallery";
import PropertyValuation from "@/components/PropertyValuation";
import { PropertyScoresSection } from "@/components/property/PropertyScoresSection";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";
import { PropertyValuationLockedCard } from "@/components/property/PropertyValuationLockedCard";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { PropertyDetailsAndEnergy } from "@/components/property/PropertyDetailsAndEnergy";
import {
  PropertyHeroSpecsBar,
} from "@/components/property/PropertyHeroSpecsBar";
import {
  formatAreaSpec,
  formatFloorSpec,
  type HeroSpecItem,
} from "@/components/property/propertyHeroSpecs";
import { fetchAuctionListingById, useAuctionListings } from "@/hooks/useAuctionListings";
import { useSubscription } from "@/hooks/useSubscription";
import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";
import { useAuth } from "@/contexts/AuthContext";
import type { ListingWithJoins } from "@/hooks/useListings";
import { formatDate, formatPrice } from "@/lib/format";
import {
  countdownBadge,
  daysUntil,
  getOwnershipBadge,
  getOwnershipPct,
  getOwnershipStatus,
  getPropertyTypeLabel,
  normalizeOwnership,
} from "@/lib/auctionUtils";
import { getAuctionImageList } from "@/lib/auctionStreetView";

const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"));
const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"));

const AUCTION_DETAIL_LOOKUP_LIMIT = 60;
const AUCTION_DETAIL_QUERY_STALE_TIME = 5 * 60_000;

const AUCTION_INFO_NOTES: { id: string; en: string; el: string }[] = [
  {
    id: "platform",
    en: "Auctions are conducted through the certified eAuction platform. Register and obtain a bidding code before the auction date.",
    el: "Οι πλειστηριασμοί διενεργούνται μέσω της πιστοποιημένης πλατφόρμας eAuction. Πριν την ημερομηνία του πλειστηριασμού απαιτείται εγγραφή και κωδικός συμμετοχής.",
  },
  {
    id: "starting-bid",
    en: "The first offer price shown is the first-round eAuction price. Later rounds may have lower first-offer prices if the asset remains unsold.",
    el: "Η τιμή πρώτης προσφοράς αφορά τον διαθέσιμο γύρο του eAuction. Σε επόμενους γύρους μπορεί να οριστεί χαμηλότερη τιμή πρώτης προσφοράς αν το ακίνητο δεν κατακυρωθεί.",
  },
  {
    id: "deposit",
    en: "A participation guarantee may be required according to the terms of the specific eAuction listing.",
    el: "Μπορεί να απαιτείται εγγύηση συμμετοχής σύμφωνα με τους όρους του συγκεκριμένου πλειστηριασμού.",
  },
  {
    id: "diligence",
    en: "Due diligence on cadastre, encumbrances, planning status, and occupancy remains the buyer's responsibility.",
    el: "Ο έλεγχος ΚΑΕΚ, βαρών, πολεοδομικής κατάστασης και κατοχής παραμένει ευθύνη του ενδιαφερόμενου αγοραστή.",
  },
  {
    id: "transfer-tax",
    en: "Transfer tax, notary fees, and legal costs apply on top of the winning bid.",
    el: "Φόρος μεταβίβασης, συμβολαιογραφικά και νομικά έξοδα προστίθενται στο τίμημα κατακύρωσης.",
  },
];

const safeUrl = (url: string | null | undefined): string | null =>
  url && /^https?:\/\//i.test(url) ? url : null;

const asNumber = (value: unknown): number | null => { // skipcq: JS-R1005 - Auction values may arrive as numeric or string payloads.
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== null) return numberValue;
  }
  return null;
};

type AuctionRouteState = {
  auction?: Record<string, unknown>;
  listing?: Record<string, unknown>;
};

const getStringValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value : fallback;

const getNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const getAuctionTags = (tags: unknown): string[] =>
  Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];

const getAuctionFromRouteState = (state?: AuctionRouteState): Record<string, unknown> | null => {
  if (state?.auction) return state.auction;
  if (state?.listing?.listing_type === "auction") return state.listing;
  return null;
};

const getSafeAuctionWebsiteUrl = (auction: Record<string, unknown> | null | undefined): string | null =>
  safeUrl(getNullableString(auction?.website_url));

const mergeAuctionDetailData = (
  primary: Record<string, unknown> | null,
  exact: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!primary) return exact;
  if (!exact) return primary;

  const merged = { ...exact, ...primary };
  const primaryUrl = getSafeAuctionWebsiteUrl(primary);
  const exactUrl = getSafeAuctionWebsiteUrl(exact);
  if (!primaryUrl && exactUrl) {
    merged.website_url = exactUrl;
  }
  return merged;
};

const buildAuctionInsightsListing = (
  auction: Record<string, unknown>,
  fallbackId: string,
): ListingWithJoins => {
  const bid = asNumber(auction.auction_starting_bid) ?? asNumber(auction.price) ?? 0;

  return {
    ...auction,
    id: getStringValue(auction.id, fallbackId),
    title: getStringValue(auction.title, "Auction Property"),
    city: getStringValue(auction.city, ""),
    address: getNullableString(auction.address),
    price: bid,
    auction_starting_bid: bid,
    auction_date: getNullableString(auction.auction_date),
    sqm: asNumber(auction.sqm) ?? 1,
    bedrooms: asNumber(auction.bedrooms),
    bathrooms: asNumber(auction.bathrooms),
    floor: firstNumber(auction.floor, auction.propertyFloor, auction.property_floor),
    total_floors: firstNumber(auction.total_floors, auction.totalFloors, auction.numberOfFloors, auction.number_of_floors),
    year_built: asNumber(auction.year_built),
    energy_class: getNullableString(auction.energy_class),
    price_per_sqm: asNumber(auction.price_per_sqm),
    property_type: getNullableString(auction.property_type),
    listing_type: "auction",
    region: getNullableString(auction.region),
    latitude: asNumber(auction.latitude),
    longitude: asNumber(auction.longitude),
    tags: getAuctionTags(auction.tags),
    listing_images: [],
    profiles: null,
    ownerIsPro: false,
    ownerParticipantType: null,
  } as unknown as ListingWithJoins;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
const AuctionBreadcrumb = ({ title, isGreek }: { title: string; isGreek: boolean }) => {
  return (
    <nav aria-label="Breadcrumb" className="container py-2 sm:py-3">
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none list-none p-0 m-0">
        <li>
          <Link to="/" className="hover:text-foreground transition-colors shrink-0">{isGreek ? "Αρχική" : "Home"}</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link to="/auctions" className="hover:text-foreground transition-colors shrink-0">{isGreek ? "Πλειστηριασμοί" : "Auctions"}</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <span className="text-foreground truncate font-medium" aria-current="page">{title}</span>
        </li>
      </ol>
    </nav>
  );
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
const AuctionTitleSection = ({ // skipcq: JS-R1005 - Title metadata intentionally renders compact optional auction badges in one reusable header block.
  title,
  city,
  address,
  region,
  propertyTypeLabel,
  auctionDate,
  days,
  sqm,
  bedrooms,
  bathrooms,
  floor,
  totalFloors,
  yearBuilt,
  energyClass,
  ownershipBadge,
  ownershipPct,
  isGreek,
}: {
  title: string;
  city: string;
  address?: string | null;
  region?: string | null;
  propertyTypeLabel: string | null;
  auctionDate?: string | null;
  days: number;
  sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  energyClass: string | null;
  ownershipBadge: { cls: string; label: string } | null;
  ownershipPct: number | null;
  isGreek: boolean;
}) => { // skipcq: JS-R1005 - Auction title section renders optional metadata and badges in one header.
  const badge = countdownBadge(days, isGreek ? "el" : "en");
  const missingLabel = isGreek ? "\u0394\u03b5\u03bd \u03c0\u03b1\u03c1\u03ad\u03c7\u03b5\u03c4\u03b1\u03b9" : "Not provided";
  const timeToAuction = days < 999
    ? days === 0
      ? (isGreek ? "Σήμερα" : "Today")
      : (isGreek ? `Σε ${days} ημέρες` : `${days} day${days !== 1 ? "s" : ""} to go`)
    : null;
  const floorValue = formatFloorSpec(floor, totalFloors) ?? missingLabel;
  const specItems: HeroSpecItem[] = [
    { key: "surface", label: "Surface", value: sqm != null && sqm > 1 ? formatAreaSpec(sqm) : null, icon: Square, emphasis: true },
    { key: "bedrooms", label: "Bedrooms", value: bedrooms, icon: BedDouble },
    { key: "bathrooms", label: "Bathrooms", value: bathrooms, icon: Bath },
    { key: "floor", label: "Floor", value: floorValue, icon: Layers },
    { key: "built", label: "Built", value: yearBuilt, icon: Building2 },
    { key: "energy", label: "Energy", value: energyClass && energyClass !== "Exempt" ? energyClass : null, icon: Zap, emphasis: true },
    { key: "auction-date", label: "Auction", value: auctionDate ? formatDate(auctionDate) : null, icon: Calendar, emphasis: true },
    { key: "countdown", label: "Timing", value: timeToAuction, icon: Clock },
    { key: "ownership", label: "Ownership", value: ownershipBadge?.label ?? null, icon: Building2 },
    { key: "ownership-share", label: "Share", value: ownershipPct != null && ownershipPct < 100 ? `${ownershipPct}%` : null, icon: Scale },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {propertyTypeLabel && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                {propertyTypeLabel}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              {isGreek ? "Πλειστηριασμός" : "For auction"}
            </span>
            {badge && (
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight line-clamp-3 sm:line-clamp-none pr-2">
            {title}
          </h1>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>
              {address && address !== city ? `${address}, ${city}` : city}
              {region && region !== city ? ` - ${region}` : ""}
            </span>
          </div>
        </div>
      </div>

      <PropertyHeroSpecsBar items={specItems} />
    </div>
  );
};

const AuctionDetail = () => { // skipcq: JS-R1005 - This route coordinates auction state, SEO, media, map, valuation, and assistant sections in one page shell.
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const locale = isGreek ? "el" : "en";
  const { id = "" } = useParams<{ id: string }>();
  const { state } = useLocation() as { state?: AuctionRouteState };
  const [walkScore, setWalkScore] = useState<number | null>(null);
  const { user } = useAuth();
  const { isPro } = useSubscription();

  const auctionFromState = getAuctionFromRouteState(state);
  const stateHasWebsiteUrl = Boolean(getSafeAuctionWebsiteUrl(auctionFromState));
  const { data: allAuctions = [], isLoading: auctionsLoading } = useAuctionListings(AUCTION_DETAIL_LOOKUP_LIMIT, {
    enabled: !auctionFromState,
  });
  const auctionFromCache = useMemo(
    () => allAuctions.find((auction) => auction.id === id) ?? null,
    [allAuctions, id],
  );
  const { data: auctionById = null, isLoading: auctionByIdLoading } = useQuery({
    queryKey: ["auction-listing-by-id", id],
    queryFn: () => fetchAuctionListingById(id),
    enabled: Boolean(id) && (!auctionFromState || !stateHasWebsiteUrl),
    staleTime: AUCTION_DETAIL_QUERY_STALE_TIME,
    gcTime: AUCTION_DETAIL_QUERY_STALE_TIME,
  });
  const auction = mergeAuctionDetailData(
    auctionFromState ?? (auctionFromCache as Record<string, unknown> | null),
    auctionById as Record<string, unknown> | null,
  );
  const aiInsightsListing = useMemo(
    () => auction ? buildAuctionInsightsListing(auction, id) : null,
    [auction, id],
  );
  const {
    aiInsightsData,
    aiInsightsLoading,
    aiInsightsLoaded,
    aiInsightsQuota,
    aiInsightsQuotaLoading,
    loadAiInsights,
  } = usePropertyAIInsights(
    aiInsightsListing,
    user,
    id,
    isPro,
  );
  const isLoading = !auction && (auctionsLoading || auctionByIdLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container pt-32 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">{isGreek ? "Ο πλειστηριασμός μπορεί να έχει λήξει ή ο σύνδεσμος να μην είναι έγκυρος." : "This auction may have ended or the link is invalid."}</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/auctions">
              <ChevronLeft className="w-4 h-4 mr-1" /> {isGreek ? "Πίσω στους πλειστηριασμούς" : "Back to Auctions"}
            </Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const title = (auction.title as string | undefined) ?? (isGreek ? "Ακίνητο πλειστηριασμού" : "Auction Property");
  const city = (auction.city as string | undefined) ?? "";
  const address = auction.address as string | null | undefined;
  const region = auction.region as string | null | undefined;
  const auctionDate = auction.auction_date as string | null | undefined;
  const bid = asNumber(auction.auction_starting_bid) ?? asNumber(auction.price) ?? 0;
  const sqm = asNumber(auction.sqm);
  const bedrooms = asNumber(auction.bedrooms);
  const bathrooms = asNumber(auction.bathrooms);
  const floor = firstNumber(auction.floor, auction.propertyFloor, auction.property_floor);
  const totalFloors = firstNumber(auction.total_floors, auction.totalFloors, auction.numberOfFloors, auction.number_of_floors);
  const yearBuilt = asNumber(auction.year_built);
  const energyClass = getNullableString(auction.energy_class);
  const lat = asNumber(auction.latitude);
  const lng = asNumber(auction.longitude);
  const websiteUrl = safeUrl(auction.website_url as string | null | undefined);
  const propertyType = auction.property_type as string | undefined;
  const propertyTypeLabel = getPropertyTypeLabel(auction as Parameters<typeof getPropertyTypeLabel>[0], locale);
  const images = getAuctionImageList({
    cover_image_url: auction.cover_image_url as string | null | undefined,
    images: auction.images as (string | null | undefined)[] | null | undefined,
    listing_images: auction.listing_images as { sort_order?: number | null; url?: string | null }[] | null | undefined,
    latitude: auction.latitude as number | string | null | undefined,
    longitude: auction.longitude as number | string | null | undefined,
    address,
    city,
    region,
  });
  const days = daysUntil(auctionDate ?? null);
  const tags = (auction.tags as string[] | undefined) ?? [];
  const ownershipStatus = normalizeOwnership(getOwnershipStatus(tags));
  const ownershipPct = getOwnershipPct(tags);
  const ownershipBadge = getOwnershipBadge(ownershipStatus, locale);
  const canonicalUrl = `https://maiprop.co/auction/${id}`;
  const missingDetailLabel = isGreek ? "\u0394\u03b5\u03bd \u03c0\u03b1\u03c1\u03ad\u03c7\u03b5\u03c4\u03b1\u03b9" : "Not provided";
  const floorDetailValue = formatFloorSpec(floor, totalFloors) ?? missingDetailLabel;
  const ogDescription = isGreek
    ? `Πλειστηριασμός: ${title}. Τιμή πρώτης προσφοράς ${formatPrice(bid)}. Πόλη: ${city}.`
    : `Auction: ${title}. First offer price ${formatPrice(bid)}. City: ${city}.`;

  const detailGroups = [
    {
      title: isGreek ? "Βασικά" : "Core",
      rows: [
        { label: isGreek ? "Τύπος ακινήτου" : "Property Type", value: propertyTypeLabel },
        { label: isGreek ? "Εμβαδόν" : "Surface", value: sqm && sqm > 1 ? formatAreaSpec(sqm) : null },
        { label: isGreek ? "Υπνοδωμάτια" : "Bedrooms", value: bedrooms },
        { label: isGreek ? "Μπάνια" : "Bathrooms", value: bathrooms },
        { label: isGreek ? "Όροφος" : "Floor", value: floorDetailValue },
        { label: isGreek ? "Έτος κατασκευής" : "Construction Year", value: yearBuilt },
        { label: isGreek ? "Ενεργειακή κλάση" : "Energy Class", value: energyClass },
      ],
    },
    {
      title: isGreek ? "Πλειστηριασμός" : "Auction",
      rows: [
        { label: isGreek ? "Ημερομηνία πλειστηριασμού" : "Auction Date", value: auctionDate ? formatDate(auctionDate) : null },
        { label: isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price", value: formatPrice(bid) },
        { label: isGreek ? "Καθεστώς κυριότητας" : "Ownership Status", value: ownershipBadge?.label ?? null },
        { label: isGreek ? "Ποσοστό κυριότητας" : "Ownership Share", value: ownershipPct != null && ownershipPct < 100 ? `${ownershipPct}%` : null },
      ],
    },
    {
      title: isGreek ? "Τοποθεσία" : "Location",
      rows: [
        { label: isGreek ? "Περιφέρεια" : "Region", value: region },
        { label: isGreek ? "Πόλη" : "City", value: city },
      ],
    },
  ];

  const propertyContext = {
    title,
    city: city || undefined,
    address: address ?? undefined,
    price: bid || undefined,
    sqm: sqm ?? undefined,
    bedrooms: bedrooms ?? undefined,
    bathrooms: bathrooms ?? undefined,
    propertyType: propertyType ?? undefined,
    listingType: "auction" as const,
    floor: floor ?? undefined,
    yearBuilt: yearBuilt ?? undefined,
    energyClass: energyClass ?? undefined,
    latitude: lat ?? undefined,
    longitude: lng ?? undefined,
    region: region ?? undefined,
  };

  const auctionReportListing = {
    id,
    title,
    city,
    address: address ?? null,
    price: bid,
    auction_starting_bid: bid,
    auction_date: auctionDate ?? null,
    sqm: sqm ?? null,
    bedrooms,
    bathrooms,
    floor,
    total_floors: totalFloors,
    latitude: lat ?? null,
    longitude: lng ?? null,
    property_type: propertyType ?? null,
    listing_type: "auction",
    year_built: yearBuilt ?? null,
    energy_class: energyClass,
    region: region ?? null,
    cover_image_url: images[0] ?? null,
    listing_images: images.slice(1).map((url, index) => ({ url, sort_order: index + 1 })),
    profiles: null,
  } as unknown as ListingWithJoins;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: canonicalUrl });
      } catch (_err: unknown) {
        return;
      }
      return;
    }
    await navigator.clipboard.writeText(canonicalUrl);
    toast.success(isGreek ? "Ο σύνδεσμος αντιγράφηκε" : "Link copied");
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{title} - mAI prop {isGreek ? "Πλειστηριασμοί" : "Auctions"}</title>
        <meta name="description" content={ogDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={`${title} - mAI prop ${isGreek ? "Πλειστηριασμοί" : "Auctions"}`} />
        <meta property="og:description" content={ogDescription} />
        {images[0] && <meta property="og:image" content={images[0]} />}
        <meta property="og:url" content={canonicalUrl} />
      </Helmet>
      <Navbar />

      <main id="main-content" className="pt-16">
        <AuctionBreadcrumb title={title} isGreek={isGreek} />

        <div className="container pb-10">
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
            <div className="space-y-5">
              <PropertyGallery
                images={images}
                listingType="auction"
                isFavorited={false}
                onFavorite={() => toast.info(isGreek ? "Η αποθήκευση πλειστηριασμών OS θα είναι σύντομα διαθέσιμη." : "Saving OS auctions is coming soon.")}
                onShare={handleShare}
                viewsCount={0}
                title={title}
              />

              <AuctionTitleSection
                title={title}
                city={city}
                address={address}
                region={region}
                propertyTypeLabel={propertyTypeLabel}
                auctionDate={auctionDate}
                days={days}
                sqm={sqm}
                bedrooms={bedrooms}
                bathrooms={bathrooms}
                floor={floor}
                totalFloors={totalFloors}
                yearBuilt={yearBuilt}
                energyClass={energyClass}
                ownershipBadge={ownershipBadge}
                ownershipPct={ownershipPct}
                isGreek={isGreek}
              />

              <PropertyAIInsightsSection
                user={user}
                isPro={isPro}
                loading={aiInsightsLoading}
                data={aiInsightsData}
                quota={aiInsightsQuota}
                quotaLoading={aiInsightsQuotaLoading}
                hasRequested={aiInsightsLoaded}
                onLoad={loadAiInsights}
              />

              <Section>
                <SectionHeader
                  icon={Gavel}
                  title={isGreek ? "Στοιχεία πλειστηριασμού" : "Auction Details"}
                  badge={<span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">{isGreek ? "LIVE" : "LIVE"}</span>}
                />
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card rounded-xl p-4 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{isGreek ? "Ημερομηνία πλειστηριασμού" : "Auction Date"}</p>
                      <p className="font-display font-bold text-sm">{auctionDate ? formatDate(auctionDate) : (isGreek ? "Θα ανακοινωθεί" : "TBC")}</p>
                    </div>
                    <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price"}</p>
                      <p className="font-display font-bold text-sm text-brand-gold">{formatPrice(bid)}</p>
                    </div>
                  </div>

                  {ownershipBadge && (
                    <div className="flex items-center justify-between rounded-xl bg-secondary border border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">{isGreek ? "Καθεστώς κυριότητας" : "Ownership Status"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ownershipBadge.cls}`}>
                          {ownershipBadge.label}
                        </span>
                        {ownershipPct != null && ownershipPct < 100 && (
                          <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full border border-border">
                            {ownershipPct}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-brand-gold/8 border border-brand-gold/20 p-3 text-xs text-muted-foreground leading-relaxed">
                    {isGreek
                      ? "Ηλεκτρονικός πλειστηριασμός - ο ενδιαφερόμενος αγοραστής διενεργεί τον δικό του έλεγχο. Το mAI prop παρέχει AI προανάλυση πριν τον πλειστηριασμό."
                      : "Electronic auction - buyer conducts own due diligence. mAI prop provides AI-powered pre-auction analysis."}
                  </div>

                  {websiteUrl && (
                    <Button asChild variant="outline" className="w-full gap-2">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="w-4 h-4" /> {isGreek ? "Άνοιγμα στο eAuction" : "Open eAuction listing"}
                      </a>
                    </Button>
                  )}
                </div>
              </Section>

              <PropertyDetailsAndEnergy detailGroups={detailGroups} energyClass={energyClass} />

              {lat != null && lng != null && (
                <div className="rounded-2xl overflow-hidden">
                  <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-2xl" />}>
                    <PropertyMiniMap
                      latitude={lat}
                      longitude={lng}
                      title={title}
                      address={address ?? ""}
                      city={city}
                      onWalkScoreChange={setWalkScore}
                    />
                  </Suspense>
                </div>
              )}

              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                <NeighbourhoodReport
                  city={city}
                  address={address ?? undefined}
                  region={region}
                  propertyType={propertyType}
                  lat={lat}
                  lng={lng}
                  listingId={null}
                />
              </Suspense>

              <Section>
                <SectionHeader icon={Gavel} title={isGreek ? "Σχετικά με τους πλειστηριασμούς ακινήτων" : "About Greek Property Auctions"} />
                <ul className="p-5 text-xs text-muted-foreground space-y-2 leading-relaxed list-none">
                  {AUCTION_INFO_NOTES.map(({ id: noteId, en, el }) => (
                    <li key={noteId} className="flex items-start gap-2">
                      <span className="text-primary shrink-0 mt-0.5">-</span>
                      <span>{isGreek ? el : en}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>

            <div className="space-y-4 lg:sticky lg:top-24 self-start">
              <div className="glass-card rounded-2xl overflow-hidden border border-primary/10 shadow-elevated">
                <div className="bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border px-5 py-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price"}</p>
                  <p className="font-display text-2xl font-black text-foreground">{formatPrice(bid)}</p>
                  {auctionDate && <p className="text-xs text-muted-foreground mt-1">{isGreek ? "Πλειστηριασμός" : "Auction"}: {formatDate(auctionDate)}</p>}
                </div>
                {websiteUrl && (
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isGreek ? "Εγγραφείτε, υποβάλετε προσφορές και δείτε τα έγγραφα στην επίσημη πλατφόρμα eAuction." : "Register, submit bids, and access legal documents on the official eAuction platform."}
                    </p>
                    <Button asChild className="w-full gap-2">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="w-4 h-4" /> {isGreek ? "Άνοιγμα eAuction" : "Open eAuction"}
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              <PropertyScoresSection walkScore={walkScore} walkabilityScore={null} safetyScore={null} noiseScore={null} />

              {isPro ? (
                <PropertyValuation
                  title={title}
                  city={city}
                  address={address ?? undefined}
                  price={bid}
                  sqm={sqm && sqm > 0 ? sqm : 1}
                  propertyType={propertyType}
                  listingType="auction"
                  yearBuilt={yearBuilt}
                  region={region}
                  ownershipStatus={ownershipStatus ?? undefined}
                  ownershipPercentage={ownershipPct ?? undefined}
                />
              ) : (
                <PropertyValuationLockedCard />
              )}

              <PropertyReportCard listingId={id} listing={auctionReportListing} />

              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5 text-brand-gold" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">{isGreek ? "Υπηρεσίες επαγγελματιών" : "Professional Add-ons"}</h4>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">
                    {isGreek ? "Επίσημες εκθέσεις εκτίμησης, νομικός έλεγχος και έλεγχοι νομιμότητας κτιρίου για αγοραστές πλειστηριασμών." : "Formal valuation reports, legal due diligence, and building legality checks for auction buyers."}
                  </p>
                  <Link
                    to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    {isGreek ? `Βρείτε εκτιμητές και δικηγόρους ${city ? `σε ${city}` : "στην Ελλάδα"}` : `Find valuers & lawyers in ${city || "Greece"}`} <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Suspense fallback={null}>
        <AIAssistantWidget propertyContext={propertyContext} variant="floating" />
      </Suspense>

      <Footer />
    </div>
  );
};

export default AuctionDetail;
