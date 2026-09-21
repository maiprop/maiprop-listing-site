import { memo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, Calendar, Clock, MapPin, Euro, Heart, Share2, Flag, ExternalLink, Lock, Layers } from "lucide-react";
import { toast } from "sonner";
import { daysUntil, countdownBadge, getPropertyTypeLabel } from "@/lib/auctionUtils";
import { APP_ORIGIN } from "@/lib/config";
import { AUCTION_FALLBACK_LOGO_URL, getAuctionImageList } from "@/lib/auctionStreetView";
import { switchImageToNextFallback, switchImageToNextFallbackIfEmpty } from "@/lib/imageFallbacks";
import { resolveAuctionMutationListingId } from "@/lib/auctionActionIdentity";

export const PremiumBadge = () => (
  <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-primary text-primary-foreground border border-primary/30">
    <Lock className="w-2.5 h-2.5" /> PRO
  </span>
);

type AuctionCardProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: any;
  favoritedIds: Set<string>;
  onToggleFav: (id: string | null, isFav: boolean) => void;
  onReport: (id: string | null) => void;
  isFavoritePending: boolean;
  isReportPending: boolean;
};

type AuctionCountdownBadge = ReturnType<typeof countdownBadge>;

type AuctionCardCopy = {
  spotlight: string;
  built: string;
  floor: string;
  sqm: string;
  startingBid: string;
  save: string;
  saved: string;
  removeSaved: string;
  share: string;
  report: string;
  eAuction: string;
  linkCopied: string;
};

const formatAuctionCardDate = (value: string, isGreek: boolean) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(isGreek ? "el-GR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(date);
};

const AuctionTopBadges = ({
  isFeatured,
  auctionDate,
  isGreek,
  spotlightLabel,
}: {
  isFeatured: boolean;
  auctionDate?: string | null;
  isGreek: boolean;
  spotlightLabel: string;
}) => (
  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
    {isFeatured && (
      <span className="inline-flex items-center gap-1 bg-gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
        <Crown className="w-2.5 h-2.5" /> {spotlightLabel}
      </span>
    )}
    {auctionDate && (
      <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
        <Calendar className="w-3 h-3 text-primary" />
        {formatAuctionCardDate(auctionDate, isGreek)}
      </div>
    )}
  </div>
);

const AuctionPropertyTypeBadge = ({ label }: { label: string | null }) => {
  if (!label) return null;

  return (
    <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
      {label}
    </div>
  );
};

const AuctionCountdown = ({ badge }: { badge: AuctionCountdownBadge }) => {
  if (!badge) return null;

  return (
    <div className={`absolute bottom-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
      <Clock className="w-3 h-3" />
      {badge.label}
    </div>
  );
};

const AuctionMedia = ({
  a,
  imgSrc,
  imageChain,
  isLogoFallback,
  propertyTypeLabel,
  badge,
  isGreek,
  spotlightLabel,
}: {
  a: AuctionCardProps["a"];
  imgSrc: string;
  imageChain: string[];
  isLogoFallback: boolean;
  propertyTypeLabel: string | null;
  badge: AuctionCountdownBadge;
  isGreek: boolean;
  spotlightLabel: string;
}) => (
  <Link to={`/auction/${a.id}`} state={{ auction: a }} className="relative h-44 bg-secondary overflow-hidden block">
    <img
      src={imgSrc}
      alt={a.title}
      width={480}
      height={256}
      decoding="async"
      loading="lazy"
      data-image-fallback-index={imageChain.length ? "0" : undefined}
      className={`w-full h-full transition-transform duration-300 ${
        isLogoFallback
          ? "object-contain p-8 bg-background"
          : "object-cover group-hover:scale-105"
      }`}
      onLoad={e => switchImageToNextFallbackIfEmpty(e.currentTarget, imageChain)}
      onError={e => switchImageToNextFallback(e.currentTarget, imageChain)}
    />
    <AuctionTopBadges
      isFeatured={Boolean(a.is_featured)}
      auctionDate={a.auction_date}
      isGreek={isGreek}
      spotlightLabel={spotlightLabel}
    />
    <AuctionPropertyTypeBadge label={propertyTypeLabel} />
    <AuctionCountdown badge={badge} />
  </Link>
);

const AuctionLocation = ({ address, city }: { address?: string | null; city?: string | null }) => (
  <div className="flex items-center gap-1 text-xs text-muted-foreground">
    <MapPin className="w-3 h-3 shrink-0" />
    <span className="truncate">{address ? `${address}, ` : ""}{city}</span>
  </div>
);

const hasUsableSqm = (sqm?: number | null): boolean => Boolean(sqm && sqm > 1);

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const getFirstFiniteNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numberValue = toFiniteNumber(value);
    if (numberValue !== null) return numberValue;
  }
  return null;
};

const getAuctionFloor = (auction: AuctionCardProps["a"]): number | null =>
  getFirstFiniteNumber(auction.floor, auction.propertyFloor, auction.property_floor);

const getAuctionTotalFloors = (auction: AuctionCardProps["a"]): number | null =>
  getFirstFiniteNumber(auction.total_floors, auction.totalFloors, auction.numberOfFloors, auction.number_of_floors);

const formatAuctionFloorValue = (floorValue: unknown, totalFloorsValue: unknown, isGreek: boolean): string | null => {
  const floor = toFiniteNumber(floorValue);
  if (floor === null) return null;

  const totalFloors = toFiniteNumber(totalFloorsValue);
  const base = floor === -1
    ? (isGreek ? "\u03a5\u03c0\u03cc\u03b3\u03b5\u03b9\u03bf" : "Basement")
    : floor === 0
      ? (isGreek ? "\u0399\u03c3\u03cc\u03b3\u03b5\u03b9\u03bf" : "Ground")
      : String(floor);
  return totalFloors !== null ? `${base} / ${totalFloors}` : base;
};

const AuctionYearBuiltPill = ({ yearBuilt, label }: { yearBuilt?: string | number | null; label: string }) => {
  if (!yearBuilt) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      {label} {yearBuilt}
    </span>
  );
};

const AuctionFloorPill = ({
  floor,
  totalFloors,
  isGreek,
  label,
}: {
  floor?: string | number | null;
  totalFloors?: string | number | null;
  isGreek: boolean;
  label: string;
}) => {
  const floorValue = formatAuctionFloorValue(floor, totalFloors, isGreek);
  const floorLabel = floorValue ? `${label} ${floorValue}` : null;
  if (!floorLabel) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      <Layers className="w-2.5 h-2.5 text-primary" />
      {floorLabel}
    </span>
  );
};

const AuctionSizePill = ({ sqm, unit }: { sqm?: number | null; unit: string }) => {
  if (!hasUsableSqm(sqm)) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      {sqm} {unit}
    </span>
  );
};

const AuctionPrice = ({ amount, label }: { amount: number; label: string }) => (
  <div className="pt-1">
    <p className="mb-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p>
    <div className="flex items-center gap-1 font-display font-bold bg-gradient-primary bg-clip-text text-transparent">
      <Euro className="w-3.5 h-3.5 text-primary" />
      {amount.toLocaleString("el-GR")}
    </div>
  </div>
);

const AuctionCourt = ({ court }: { court?: string | null }) => {
  if (!court || /^[A-Z_]+$/.test(court)) return null;

  return <div className="text-xs text-muted-foreground truncate">{court}</div>;
};

const shareAuctionLink = async (title: string, url: string, copiedMessage: string): Promise<void> => {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (_err: unknown) {
      // Share was cancelled by the user.
    }
    return;
  }

  await navigator.clipboard.writeText(url);
  toast.success(copiedMessage);
};

const ExternalAuctionLink = ({ websiteUrl, label }: { websiteUrl?: string | null; label: string }) => {
  if (!websiteUrl) return null;

  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-all"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
};

const AuctionActions = ({
  a,
  isFav,
  onToggleFav,
  onReport,
  mutationListingId,
  isFavoritePending,
  isReportPending,
  copy,
}: {
  a: AuctionCardProps["a"];
  isFav: boolean;
  onToggleFav: AuctionCardProps["onToggleFav"];
  onReport: AuctionCardProps["onReport"];
  mutationListingId: string | null;
  isFavoritePending: boolean;
  isReportPending: boolean;
  copy: AuctionCardCopy;
}) => {
  const handleFavorite = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onToggleFav(mutationListingId, isFav);
  };

  const handleShare = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await shareAuctionLink(a.title, `${APP_ORIGIN}/auction/${a.id}`, copy.linkCopied);
  };

  const handleReport = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onReport(mutationListingId);
  };

  return (
    <div className="mt-auto pt-3 border-t border-border flex items-center gap-2">
      <button
        onClick={handleFavorite}
        disabled={isFavoritePending}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
          isFav ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
        }`}
        aria-label={isFav ? copy.removeSaved : copy.save}
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current text-rose-400" : ""}`} />
        {isFav ? copy.saved : copy.save}
      </button>
      <button
        onClick={handleShare}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
        aria-label={copy.share}
      >
        <Share2 className="w-3.5 h-3.5" />
        {copy.share}
      </button>
      <button
        onClick={handleReport}
        disabled={isReportPending}
        className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-all"
        aria-label={copy.report}
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
      <ExternalAuctionLink websiteUrl={a.website_url} label={copy.eAuction} />
    </div>
  );
};

const AuctionCardComponent = ({
  a,
  favoritedIds,
  onToggleFav,
  onReport,
  isFavoritePending,
  isReportPending,
}: AuctionCardProps) => { // skipcq: JS-R1005 - Auction cards compose independent image, date, and action affordances.
  const { t, i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const locale = isGreek ? "el" : "en";
  const copy: AuctionCardCopy = {
    spotlight: t("auctions.card.spotlight"),
    built: t("auctions.card.built"),
    floor: t("property.floor"),
    sqm: t("common.sqm"),
    startingBid: t("auctions.startingBid"),
    save: t("auctions.card.save"),
    saved: t("auctions.card.saved"),
    removeSaved: t("auctions.card.removeSaved"),
    share: t("auctions.card.share"),
    report: t("auctions.card.report"),
    eAuction: t("auctions.card.eAuction"),
    linkCopied: t("auctions.card.linkCopied"),
  };
  const badge = countdownBadge(daysUntil(a.auction_date), locale);
  const imageChain = getAuctionImageList(a);
  const imgSrc = imageChain[0] ?? AUCTION_FALLBACK_LOGO_URL;
  const isLogoFallback = imgSrc === AUCTION_FALLBACK_LOGO_URL;
  const mutationListingId = resolveAuctionMutationListingId(a);
  const isFav = mutationListingId !== null && favoritedIds.has(mutationListingId);
  const propertyTypeLabel = getPropertyTypeLabel(a, locale);
  const price = a.auction_starting_bid ?? a.price ?? 0;
  const floor = getAuctionFloor(a);
  const totalFloors = getAuctionTotalFloors(a);

  return (
    <div data-testid="auction-card" className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group flex flex-col">
      <AuctionMedia
        a={a}
        imgSrc={imgSrc}
        imageChain={imageChain}
        isLogoFallback={isLogoFallback}
        propertyTypeLabel={propertyTypeLabel}
        badge={badge}
        isGreek={isGreek}
        spotlightLabel={copy.spotlight}
      />

      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <Link to={`/auction/${a.id}`} state={{ auction: a }}>
          <h2 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">{a.title}</h2>
        </Link>
        <AuctionLocation address={a.address} city={a.city} />
        <div className="flex flex-wrap items-center gap-1.5 mt-1 empty:hidden">
          <AuctionSizePill sqm={a.sqm} unit={copy.sqm} />
          <AuctionFloorPill floor={floor} totalFloors={totalFloors} isGreek={isGreek} label={copy.floor} />
          <AuctionYearBuiltPill yearBuilt={a.year_built} label={copy.built} />
        </div>
        <AuctionPrice amount={price} label={copy.startingBid} />
        <AuctionCourt court={a.auction_court} />
        <AuctionActions
          a={a}
          isFav={isFav}
          onToggleFav={onToggleFav}
          onReport={onReport}
          mutationListingId={mutationListingId}
          isFavoritePending={isFavoritePending}
          isReportPending={isReportPending}
          copy={copy}
        />
      </div>
    </div>
  );
};

export const AuctionCard = memo(AuctionCardComponent);
