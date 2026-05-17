/**
 * AuctionDetail handles OS-synced auction listings.
 *
 * DB-backed auction listings are rendered by PropertyDetail through
 * AuctionRouter. This page intentionally mirrors that same detail layout so
 * auctions opened from /dashboard and /auctions feel like one product surface.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronLeft,
  Clock,
  ExternalLink,
  Gavel,
  LayoutGrid,
  Loader2,
  MapPin,
  Scale,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import PropertyGallery from "@/components/property/PropertyGallery";
import PropertyValuation from "@/components/PropertyValuation";
import { PropertyScoresSection } from "@/components/property/PropertyScoresSection";
import { DetailRow, Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import { formatDate, formatPrice } from "@/lib/format";
import {
  OWNERSHIP_BADGE,
  countdownBadge,
  daysUntil,
  getOwnershipPct,
  getOwnershipStatus,
  getPropertyTypeLabel,
  normalizeOwnership,
} from "@/lib/auctionUtils";
import { getAuctionImageList } from "@/lib/auctionStreetView";

const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"));
const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"));

const AUCTION_INFO_NOTES: { id: string; text: string }[] = [
  {
    id: "platform",
    text: "Auctions are conducted through the certified eAuction platform. Register and obtain a bidding code before the auction date.",
  },
  {
    id: "starting-bid",
    text: "The starting bid shown is the first-round price. Later rounds may have lower bids if the asset remains unsold.",
  },
  {
    id: "deposit",
    text: "A 10% deposit of the winning bid is typically required immediately after the auction.",
  },
  {
    id: "diligence",
    text: "Due diligence on cadastre, encumbrances, planning status, and occupancy remains the buyer's responsibility.",
  },
  {
    id: "transfer-tax",
    text: "Transfer tax, notary fees, and legal costs apply on top of the winning bid.",
  },
];

const safeUrl = (url: string | null | undefined): string | null =>
  url && /^https?:\/\//i.test(url) ? url : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function AuctionBreadcrumb({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="container py-2 sm:py-3">
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none list-none p-0 m-0">
        <li>
          <Link to="/" className="hover:text-foreground transition-colors shrink-0">Home</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link to="/auctions" className="hover:text-foreground transition-colors shrink-0">Auctions</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <span className="text-foreground truncate font-medium" aria-current="page">{title}</span>
        </li>
      </ol>
    </nav>
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium">
      <span className="text-primary shrink-0">{icon}</span>
      {label}
    </div>
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function AuctionTitleSection({
  title,
  city,
  address,
  region,
  propertyTypeLabel,
  auctionDate,
  days,
  sqm,
  yearBuilt,
  ownershipBadge,
  ownershipPct,
}: {
  title: string;
  city: string;
  address?: string | null;
  region?: string | null;
  propertyTypeLabel: string | null;
  auctionDate?: string | null;
  days: number;
  sqm: number | null;
  yearBuilt: number | null;
  ownershipBadge: { cls: string; label: string } | null;
  ownershipPct: number | null;
}) {
  const badge = countdownBadge(days);

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
              For auction
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

      <div className="flex items-center gap-2 flex-wrap">
        {sqm != null && sqm > 1 && <StatChip icon={<Square className="w-3.5 h-3.5" />} label={`${sqm} m2`} />}
        {auctionDate && <StatChip icon={<Calendar className="w-3.5 h-3.5" />} label={`Auction: ${formatDate(auctionDate)}`} />}
        {days < 999 && (
          <StatChip
            icon={<Clock className="w-3.5 h-3.5" />}
            label={days === 0 ? "Today" : `${days} day${days !== 1 ? "s" : ""} to go`}
          />
        )}
        {yearBuilt != null && <StatChip icon={<Building2 className="w-3.5 h-3.5" />} label={`Construction year ${yearBuilt}`} />}
        {ownershipBadge && (
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${ownershipBadge.cls}`}>
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            {ownershipBadge.label}
          </div>
        )}
        {ownershipPct != null && ownershipPct < 100 && (
          <StatChip icon={<Building2 className="w-3.5 h-3.5" />} label={`${ownershipPct}%`} />
        )}
      </div>
    </div>
  );
}

export default function AuctionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { state } = useLocation() as { state?: { auction?: Record<string, unknown> } };
  const [walkScore, setWalkScore] = useState<number | null>(null);

  const auctionFromState = state?.auction ?? null;
  const { data: allAuctions = [], isLoading: auctionsLoading } = useAuctionListings(undefined, {
    enabled: !auctionFromState,
  });
  const auctionFromCache = useMemo(
    () => allAuctions.find((auction) => auction.id === id) ?? null,
    [allAuctions, id],
  );
  const auction = auctionFromState ?? (auctionFromCache as Record<string, unknown> | null);
  const isLoading = !auction && auctionsLoading;

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
          <p className="text-muted-foreground">This auction may have ended or the link is invalid.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/auctions">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to Auctions
            </Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const title = (auction.title as string | undefined) ?? "Auction Property";
  const city = (auction.city as string | undefined) ?? "";
  const address = auction.address as string | null | undefined;
  const region = auction.region as string | null | undefined;
  const auctionDate = auction.auction_date as string | null | undefined;
  const bid = asNumber(auction.auction_starting_bid) ?? asNumber(auction.price) ?? 0;
  const sqm = asNumber(auction.sqm);
  const yearBuilt = asNumber(auction.year_built);
  const lat = asNumber(auction.latitude);
  const lng = asNumber(auction.longitude);
  const websiteUrl = safeUrl(auction.website_url as string | null | undefined);
  const propertyType = auction.property_type as string | undefined;
  const propertyTypeLabel = getPropertyTypeLabel(auction as Parameters<typeof getPropertyTypeLabel>[0]);
  const images = getAuctionImageList({
    cover_image_url: auction.cover_image_url as string | null | undefined,
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
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;
  const canonicalUrl = `https://maiprop.co/auction/${id}`;
  const ogDescription = `Auction: ${title}. Starting bid ${formatPrice(bid)}. City: ${city}.`;

  const detailRows: { label: string; value: string | number }[] = [];
  if (propertyTypeLabel) detailRows.push({ label: "Property Type", value: propertyTypeLabel });
  if (sqm && sqm > 1) detailRows.push({ label: "Surface", value: `${sqm} m2` });
  if (auctionDate) detailRows.push({ label: "Auction Date", value: formatDate(auctionDate) });
  if (yearBuilt) detailRows.push({ label: "Construction Year", value: yearBuilt });
  if (region) detailRows.push({ label: "Region", value: region });

  const propertyContext = {
    title,
    city: city || undefined,
    address: address ?? undefined,
    price: bid || undefined,
    sqm: sqm ?? undefined,
    propertyType: propertyType ?? undefined,
    listingType: "auction" as const,
    yearBuilt: yearBuilt ?? undefined,
    latitude: lat ?? undefined,
    longitude: lng ?? undefined,
    region: region ?? undefined,
  };

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
    toast.success("Link copied");
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{title} - mAI prop Auctions</title>
        <meta name="description" content={ogDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={`${title} - mAI prop Auctions`} />
        <meta property="og:description" content={ogDescription} />
        {images[0] && <meta property="og:image" content={images[0]} />}
        <meta property="og:url" content={canonicalUrl} />
      </Helmet>
      <Navbar />

      <main id="main-content" className="pt-16">
        <AuctionBreadcrumb title={title} />

        <div className="container pb-10">
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
            <div className="space-y-5">
              <PropertyGallery
                images={images}
                listingType="auction"
                isFavorited={false}
                onFavorite={() => toast.info("Saving OS auctions is coming soon.")}
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
                yearBuilt={yearBuilt}
                ownershipBadge={ownershipBadge}
                ownershipPct={ownershipPct}
              />

              <Section>
                <SectionHeader
                  icon={Gavel}
                  title="Auction Details"
                  badge={<span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">LIVE</span>}
                />
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card rounded-xl p-4 border border-border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Auction Date</p>
                      <p className="font-display font-bold text-sm">{auctionDate ? formatDate(auctionDate) : "TBC"}</p>
                    </div>
                    <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
                      <p className="font-display font-bold text-sm text-brand-gold">{formatPrice(bid)}</p>
                    </div>
                  </div>

                  {ownershipBadge && (
                    <div className="flex items-center justify-between rounded-xl bg-secondary border border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">Ownership Status</span>
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
                    Judicial auction - buyer conducts own due diligence. maiProp provides AI-powered pre-auction analysis.
                  </div>

                  {websiteUrl && (
                    <Button asChild variant="outline" className="w-full gap-2">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="w-4 h-4" /> Open eAuction listing
                      </a>
                    </Button>
                  )}
                </div>
              </Section>

              {detailRows.length > 0 && (
                <Section>
                  <SectionHeader icon={LayoutGrid} title="Property Details" />
                  <div className="p-5">
                    {detailRows.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)}
                  </div>
                </Section>
              )}

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
                <SectionHeader icon={Gavel} title="About Greek Property Auctions" />
                <ul className="p-5 text-xs text-muted-foreground space-y-2 leading-relaxed list-none">
                  {AUCTION_INFO_NOTES.map(({ id: noteId, text }) => (
                    <li key={noteId} className="flex items-start gap-2">
                      <span className="text-primary shrink-0 mt-0.5">-</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>

            <div className="space-y-4 lg:sticky lg:top-24 self-start">
              <div className="glass-card rounded-2xl overflow-hidden border border-primary/10 shadow-elevated">
                <div className="bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border px-5 py-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
                  <p className="font-display text-2xl font-black text-foreground">{formatPrice(bid)}</p>
                  {auctionDate && <p className="text-xs text-muted-foreground mt-1">Auction: {formatDate(auctionDate)}</p>}
                </div>
                {websiteUrl && (
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Register, submit bids, and access legal documents on the official eAuction platform.
                    </p>
                    <Button asChild className="w-full gap-2">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="w-4 h-4" /> Open eAuction
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              <PropertyScoresSection walkScore={walkScore} walkabilityScore={null} safetyScore={null} noiseScore={null} />

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

              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5 text-brand-gold" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">Professional Add-ons</h4>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">
                    Formal valuation reports, legal due diligence, and building legality checks for auction buyers.
                  </p>
                  <Link
                    to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Find valuers & lawyers in {city || "Greece"} <ExternalLink className="w-3.5 h-3.5" />
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
}
