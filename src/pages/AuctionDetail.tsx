/**
 * AuctionDetail — detail page for OS-synced auction listings.
 *
 * Only handles OS auction IDs (e.g. "uePMM0riww") — fetched from the live
 * auctions cache via useAuctionListings(), or passed directly in route state.
 *
 * UUID IDs (DB-stored listings) are handled by AuctionRouter in App.tsx which
 * renders PropertyDetail directly, so this component never sees them.
 */

import { Suspense, lazy, useMemo } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Gavel,
  MapPin,
  Calendar,
  Square,
  Home,
  ExternalLink,
  ChevronLeft,
  Building2,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatDate, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import {
  daysUntil,
  countdownBadge,
  getPropertyTypeLabel,
  normalizeOwnership,
  getOwnershipStatus,
  getOwnershipPct,
  OWNERSHIP_BADGE,
} from "@/lib/auctionUtils";

const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));

/** Only allow http/https URLs in external auction links to prevent javascript: injection. */
const safeUrl = (url: string | null | undefined): string | null =>
  url && /^https?:\/\//i.test(url) ? url : null;

// ── Static content arrays ─────────────────────────────────────────────────────
const AUCTION_INFO_NOTES: { id: string; text: string }[] = [
  { id: "platform",     text: "Auctions are conducted through the certified eAuction platform. You must register and obtain a bidding code before the auction date." },
  { id: "starting-bid", text: "The starting bid shown is the first-round price. Subsequent rounds may have lower bids if the property is unsold." },
  { id: "deposit",      text: "A 10% deposit of the winning bid is required immediately after the auction." },
  { id: "diligence",    text: "Due diligence (cadastre, encumbrances, planning status) is the buyer's responsibility. Consult a notary and lawyer before bidding." },
  { id: "transfer-tax", text: "Transfer tax (3% FMA) and notary fees apply on top of the winning bid." },
];

// ── Sub-components (extracted to limit JSX nesting depth) ────────────────────

const StatChip = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm">
    <span className="text-primary shrink-0">{icon}</span>
    <span className="text-foreground font-medium">{label}</span>
  </div>
);

const AuctionBreadcrumb = ({ title }: { title: string }) => (
  <div className="border-b border-border bg-card/50">
    <div className="max-w-5xl mx-auto px-4 py-3">
      <nav aria-label="breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <li><Link to="/auctions" className="hover:text-foreground transition-colors">Auctions</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground truncate max-w-xs">{title}</li>
        </ol>
      </nav>
    </div>
  </div>
);

const AuctionTitleRow = ({
  title, city, address, region, bid, auctionDate,
  ownershipBadge, ownershipPct,
}: {
  title: string; city: string; address?: string | null; region?: string | null;
  bid: number; auctionDate?: string | null;
  ownershipBadge: { cls: string; label: string } | null; ownershipPct: number | null;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
    <div className="space-y-1.5 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
          <Gavel className="w-3 h-3" /> AUCTION
        </span>
        {ownershipBadge && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ownershipBadge.cls}`}>
            <Building2 className="w-2.5 h-2.5" />
            {ownershipBadge.label}
            {ownershipPct != null && ownershipPct < 100 && <span className="opacity-80">({ownershipPct}%)</span>}
          </span>
        )}
      </div>
      <h1 className="font-display text-xl sm:text-2xl font-bold leading-snug">{title}</h1>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="w-4 h-4 shrink-0 text-primary" />
        <span>{address ? `${address}, ` : ""}{city}{region && region !== city ? `, ${region}` : ""}</span>
      </div>
    </div>
    <div className="glass-card rounded-2xl px-5 py-4 border border-brand-gold/30 bg-brand-gold/5 shrink-0 text-center sm:text-right">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
      <p className="font-display text-2xl font-black bg-gradient-primary bg-clip-text text-transparent">
        €{bid.toLocaleString("el-GR")}
      </p>
      {auctionDate && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-center sm:justify-end">
          <Calendar className="w-3 h-3" />
          {formatDate(auctionDate)}
        </p>
      )}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const AuctionStatRow = ({
  sqm, yearBuilt, auctionDate, days,
}: {
  sqm?: number | null; yearBuilt?: number | null;
  auctionDate?: string | null; days: number;
}) => (
  <div className="flex flex-wrap gap-2">
    {sqm && sqm > 1 && (
      <StatChip icon={<Square className="w-4 h-4" />} label={`${sqm} m²`} />
    )}
    {yearBuilt && (
      <StatChip icon={<Home className="w-4 h-4" />} label={`Built ${yearBuilt}`} />
    )}
    {auctionDate && (
      <StatChip
        icon={<Calendar className="w-4 h-4" />}
        label={`Auction: ${formatDate(auctionDate)}`}
      />
    )}
    {/* daysUntil returns 999 sentinel when no date — exclude it */}
    {days < 999 && (
      <StatChip
        icon={<Clock className="w-4 h-4" />}
        label={days === 0 ? "Today" : `${days} day${days !== 1 ? "s" : ""} to go`}
      />
    )}
  </div>
);

const AuctionDetail = () => {
  const { id = "" } = useParams<{ id: string }>();
  const { state } = useLocation() as { state?: { auction?: Record<string, unknown> } };

  // 1. Route state — instant data when navigating from AuctionCard
  const auctionFromState = state?.auction ?? null;

  // 2. Live auctions cache
  const { data: allAuctions = [], isLoading: auctionsLoading } = useAuctionListings();
  const auctionFromCache = useMemo(
    () => allAuctions.find((a) => a.id === id) ?? null,
    [allAuctions, id],
  );

  // Resolve the best available data source — state wins (instant on navigation),
  // then the live cache.
  const auction =
    auctionFromState ??
    (auctionFromCache as Record<string, unknown> | null);

  const isLoading = !auction && auctionsLoading;

  // ── Derived display values ─────────────────────────────────────────────────
  const bid = (auction?.auction_starting_bid ?? auction?.price ?? 0) as number;
  const auctionDate = auction?.auction_date as string | null | undefined;
  const days = daysUntil(auctionDate ?? null);
  const badge = countdownBadge(days);
  const ownershipStatus = normalizeOwnership(getOwnershipStatus((auction?.tags as string[] | undefined) ?? []));
  const ownershipPct = getOwnershipPct((auction?.tags as string[] | undefined) ?? []);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;
  const websiteUrl = auction?.website_url as string | null | undefined;
  const title = (auction?.title as string | undefined) ?? "Auction Property";
  const city = (auction?.city as string | undefined) ?? "";
  const address = auction?.address as string | null | undefined;
  const sqm = auction?.sqm as number | null | undefined;
  const yearBuilt = auction?.year_built as number | null | undefined;
  const coverImage = auction?.cover_image_url as string | null | undefined;
  const lat = auction?.latitude as number | null | undefined;
  const lng = auction?.longitude as number | null | undefined;
  const region = auction?.region as string | null | undefined;
  const propertyType = auction?.property_type as string | undefined;
  const propTypeLabel = auction ? getPropertyTypeLabel(auction as Parameters<typeof getPropertyTypeLabel>[0]) : null;

  // Property context for the AI assistant
  const propertyContext = auction
    ? {
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
      }
    : undefined;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <Footer />
      </>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!auction) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
          <AlertCircle className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Auction not found</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            This auction may have ended or the link is invalid.
          </p>
          <Button asChild variant="outline">
            <Link to="/auctions">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to Auctions
            </Link>
          </Button>
        </div>
        <Footer />
      </>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title>{title} | maiProp Auctions</title>
        <meta name="description" content={`Auction: ${title}. Starting bid ${formatPrice(bid)}. City: ${city}.`} />
      </Helmet>

      <Navbar />

      <main id="main-content" className="min-h-screen bg-background pb-24">
        {/* ── Breadcrumb ── */}
        <AuctionBreadcrumb title={title} />

        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">

          {/* ── Hero image ── */}
          <div className="relative w-full h-64 sm:h-80 rounded-2xl overflow-hidden bg-secondary border border-border">
            {coverImage ? (
              <img
                src={coverImage}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => { if (e.target instanceof HTMLImageElement) e.target.style.display = "none"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gavel className="w-16 h-16 text-muted-foreground/20" />
              </div>
            )}

            {/* Countdown badge */}
            {badge && (
              <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${badge.cls}`}>
                <Clock className="w-3.5 h-3.5" />
                {badge.label}
              </div>
            )}

            {/* Property type badge */}
            {propTypeLabel && (
              <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-full">
                {propTypeLabel}
              </div>
            )}
          </div>

          {/* ── Title row ── */}
          <AuctionTitleRow
            title={title}
            city={city}
            address={address}
            region={region}
            bid={bid}
            auctionDate={auctionDate}
            ownershipBadge={ownershipBadge}
            ownershipPct={ownershipPct}
          />

          {/* ── Stat chips ── */}
          <AuctionStatRow sqm={sqm} yearBuilt={yearBuilt} auctionDate={auctionDate} days={days} />

          {/* ── External link CTA ── */}
          {safeUrl(websiteUrl) && (
            <div className="glass-card rounded-2xl p-5 border border-primary/20 bg-primary/5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold">View on eAuction platform</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Register, submit bids, and access full legal documents on the official platform.
                </p>
              </div>
              <Button asChild className="shrink-0 gap-2">
                <a href={safeUrl(websiteUrl) ?? ""} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="w-4 h-4" /> Open eAuction
                </a>
              </Button>
            </div>
          )}

          {/* ── Map ── */}
          {lat != null && lng != null && (
            <div className="glass-card rounded-2xl overflow-hidden border border-border">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" /> Location
                </h2>
              </div>
              <div className="h-56">
                <PropertyMiniMap
                  latitude={lat}
                  longitude={lng}
                  title={title}
                  address={address ?? ""}
                  city={city}
                />
              </div>
            </div>
          )}

          {/* ── Auction info notes ── */}
          <div className="glass-card rounded-2xl p-5 border border-border space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Gavel className="w-4 h-4 text-primary" /> About Greek Property Auctions
            </h2>
            <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed list-none">
              {AUCTION_INFO_NOTES.map(({ id, text }) => ( // skipcq: JS-0323
                <li key={id} className="flex items-start gap-2">
                  <span className="text-primary shrink-0 mt-0.5">▸</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      {/* ── AI Assistant — wired with auction context (Bug 4) ── */}
      <Suspense fallback={null}>
        <AIAssistantWidget propertyContext={propertyContext} variant="floating" />
      </Suspense>

      <Footer />
    </>
  );
};

export default AuctionDetail;
