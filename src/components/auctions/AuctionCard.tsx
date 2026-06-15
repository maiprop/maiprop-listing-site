import { memo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, Calendar, Clock, MapPin, Euro, Heart, Share2, Flag, ExternalLink, Building2, Lock, Layers } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  daysUntil, countdownBadge, getPropertyTypeLabel,
  normalizeOwnership, getOwnershipStatus, getOwnershipPct, getOwnershipBadge,
} from "@/lib/auctionUtils";
import { APP_ORIGIN } from "@/lib/config";
import { AUCTION_FALLBACK_LOGO_URL, getAuctionImageList } from "@/lib/auctionStreetView";
import { switchImageToNextFallback } from "@/lib/imageFallbacks";

export const PremiumBadge = () => (
  <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-primary text-primary-foreground border border-primary/30">
    <Lock className="w-2.5 h-2.5" /> PRO
  </span>
);

type AuctionCardProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: any;
  favoritedIds: Set<string>;
  onToggleFav: (id: string, isFav: boolean) => void;
};

type AuctionCountdownBadge = ReturnType<typeof countdownBadge>;

type OwnershipBadgeView = {
  cls: string;
  label: string;
} | null;

const AuctionTopBadges = ({
  isFeatured,
  auctionDate,
  isGreek,
}: {
  isFeatured: boolean;
  auctionDate?: string | null;
  isGreek: boolean;
}) => (
  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
    {isFeatured && (
      <span className="inline-flex items-center gap-1 bg-gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
        <Crown className="w-2.5 h-2.5" /> {isGreek ? "Προβεβλημένο" : "Featured"}
      </span>
    )}
    {auctionDate && (
      <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
        <Calendar className="w-3 h-3 text-primary" />
        {format(new Date(auctionDate), "dd MMM yyyy")}
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
}: {
  a: AuctionCardProps["a"];
  imgSrc: string;
  imageChain: string[];
  isLogoFallback: boolean;
  propertyTypeLabel: string | null;
  badge: AuctionCountdownBadge;
  isGreek: boolean;
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
      onError={e => switchImageToNextFallback(e.currentTarget, imageChain)}
    />
    <AuctionTopBadges isFeatured={Boolean(a.is_featured)} auctionDate={a.auction_date} isGreek={isGreek} />
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

const AuctionPropertyTypeChip = ({ label }: { label: string | null }) => {
  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit">
      {label}
    </span>
  );
};

const AuctionOwnershipChip = ({
  ownershipBadge,
  ownershipPct,
}: {
  ownershipBadge: OwnershipBadgeView;
  ownershipPct: number | null;
}) => {
  if (!ownershipBadge) return null;

  return (
    <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${ownershipBadge.cls}`}>
      <Building2 className="w-2.5 h-2.5" />
      {ownershipBadge.label}
      {ownershipPct != null && ownershipPct < 100 && <span className="opacity-80">({ownershipPct}%)</span>}
    </div>
  );
};

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

const formatAuctionFloor = (floorValue: unknown, totalFloorsValue: unknown, isGreek: boolean): string | null => {
  const value = formatAuctionFloorValue(floorValue, totalFloorsValue, isGreek);
  if (!value) return null;
  const label = isGreek ? "\u038c\u03c1\u03bf\u03c6\u03bf\u03c2" : "Floor";
  return `${label} ${value}`;
};

const formatAuctionArea = (sqm: unknown, isGreek: boolean, missingLabel: string): string => {
  const area = toFiniteNumber(sqm);
  if (area === null || area <= 1) return missingLabel;
  return `${area.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${isGreek ? "\u03c4.\u03bc." : "m2"}`;
};

const AuctionYearBuiltPill = ({ yearBuilt, isGreek }: { yearBuilt?: string | number | null; isGreek: boolean }) => {
  if (!yearBuilt) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      {isGreek ? "Έτος" : "Built"} {yearBuilt}
    </span>
  );
};

const AuctionFloorPill = ({
  floor,
  totalFloors,
  isGreek,
}: {
  floor?: string | number | null;
  totalFloors?: string | number | null;
  isGreek: boolean;
}) => {
  const floorLabel = formatAuctionFloor(floor, totalFloors, isGreek);
  if (!floorLabel) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      <Layers className="w-2.5 h-2.5 text-primary" />
      {floorLabel}
    </span>
  );
};

const AuctionSizePill = ({ sqm }: { sqm?: number | null }) => {
  if (!hasUsableSqm(sqm)) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      {sqm} τ.μ.
    </span>
  );
};

type AuctionDetailGroup = {
  title: string;
  rows: { label: string; value: string | number }[];
};

const AuctionGroupedDetails = ({ groups }: { groups: AuctionDetailGroup[] }) => (
  <div data-testid="auction-card-details" className="min-h-[9rem] max-h-[9rem] overflow-hidden space-y-2 border-y border-border/60 py-2.5">
    {groups.map((group) => (
      <div key={group.title} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.title}
          </p>
          <div className="h-px flex-1 bg-border/70" />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {group.rows.map((row) => (
            <div key={`${group.title}-${row.label}`} className="min-w-0">
              <dt className="truncate text-[10px] font-medium text-muted-foreground">
                {row.label}
              </dt>
              <dd className="truncate text-xs font-semibold text-foreground" title={String(row.value)}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ))}
  </div>
);

const AuctionPrice = ({ amount }: { amount: number }) => (
  <div className="flex items-center justify-between pt-1">
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

const shareAuctionLink = async (title: string, url: string, isGreek: boolean): Promise<void> => {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (_err: unknown) {
      // Share was cancelled by the user.
    }
    return;
  }

  await navigator.clipboard.writeText(url);
  toast.success(isGreek ? "Ο σύνδεσμος αντιγράφηκε" : "Link copied to clipboard");
};

const ExternalAuctionLink = ({ websiteUrl, isGreek }: { websiteUrl?: string | null; isGreek: boolean }) => {
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
      {isGreek ? "Στο eAuction" : "eAuction"}
    </a>
  );
};

const AuctionActions = ({
  a,
  isFav,
  onToggleFav,
  isGreek,
}: {
  a: AuctionCardProps["a"];
  isFav: boolean;
  onToggleFav: AuctionCardProps["onToggleFav"];
  isGreek: boolean;
}) => {
  const handleFavorite = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onToggleFav(a.id, isFav);
  };

  const handleShare = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await shareAuctionLink(a.title, `${APP_ORIGIN}/auction/${a.id}`, isGreek);
  };

  const handleReport = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    toast.info(isGreek ? "Η αναφορά υποβλήθηκε. Η ομάδα μας θα την εξετάσει." : "Report submitted. Our team will review it.");
  };

  return (
    <div data-testid="auction-card-actions" className="mt-auto flex min-h-[2.625rem] items-center gap-2 border-t border-border pt-3">
      <button
        onClick={handleFavorite}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
          isFav ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
        }`}
        aria-label={isGreek ? "Αποθήκευση" : "Save"}
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current text-rose-400" : ""}`} />
        {isFav ? (isGreek ? "Αποθηκεύτηκε" : "Saved") : (isGreek ? "Αποθήκευση" : "Save")}
      </button>
      <button
        onClick={handleShare}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
        aria-label={isGreek ? "Κοινοποίηση" : "Share"}
      >
        <Share2 className="w-3.5 h-3.5" />
        {isGreek ? "Κοινοποίηση" : "Share"}
      </button>
      <button
        onClick={handleReport}
        className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-all"
        aria-label={isGreek ? "Αναφορά" : "Report"}
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
      <ExternalAuctionLink websiteUrl={a.website_url} isGreek={isGreek} />
    </div>
  );
};

const AuctionCardComponent = ({ a, favoritedIds, onToggleFav }: AuctionCardProps) => { // skipcq: JS-R1005 - Auction cards compose independent image, ownership, date, and action affordances.
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const locale = isGreek ? "el" : "en";
  const badge = countdownBadge(daysUntil(a.auction_date), locale);
  const imageChain = getAuctionImageList(a);
  const imgSrc = imageChain[0] ?? AUCTION_FALLBACK_LOGO_URL;
  const isLogoFallback = imgSrc === AUCTION_FALLBACK_LOGO_URL;
  const isFav = favoritedIds.has(a.id);
  const propertyTypeLabel = getPropertyTypeLabel(a, locale);
  const ownershipStatus = normalizeOwnership(getOwnershipStatus(a.tags));
  const ownershipPct = getOwnershipPct(a.tags);
  const ownershipBadge = getOwnershipBadge(ownershipStatus, locale);
  const price = a.auction_starting_bid ?? a.price ?? 0;
  const floor = getAuctionFloor(a);
  const totalFloors = getAuctionTotalFloors(a);
  const missingLabel = isGreek ? "\u0394\u03b5\u03bd \u03c0\u03b1\u03c1\u03ad\u03c7\u03b5\u03c4\u03b1\u03b9" : "Not provided";
  const auctionDateLabel = a.auction_date ? format(new Date(a.auction_date), "dd MMM yyyy") : missingLabel;
  const groupedDetails: AuctionDetailGroup[] = [
    {
      title: isGreek ? "\u0391\u03ba\u03af\u03bd\u03b7\u03c4\u03bf" : "Property",
      rows: [
        { label: isGreek ? "\u038c\u03c1\u03bf\u03c6\u03bf\u03c2" : "Floor", value: formatAuctionFloorValue(floor, totalFloors, isGreek) ?? missingLabel },
        { label: isGreek ? "\u0395\u03bc\u03b2\u03b1\u03b4\u03cc\u03bd" : "Surface", value: formatAuctionArea(a.sqm, isGreek, missingLabel) },
        { label: isGreek ? "\u0388\u03c4\u03bf\u03c2" : "Built", value: a.year_built ?? missingLabel },
      ],
    },
    {
      title: isGreek ? "\u03a0\u03bb\u03b5\u03b9\u03c3\u03c4\u03b7\u03c1\u03b9\u03b1\u03c3\u03bc\u03cc\u03c2" : "Auction",
      rows: [
        { label: isGreek ? "\u0397\u03bc/\u03bd\u03af\u03b1" : "Date", value: auctionDateLabel },
        { label: isGreek ? "\u039a\u03c5\u03c1\u03b9\u03cc\u03c4\u03b7\u03c4\u03b1" : "Ownership", value: ownershipBadge?.label ?? missingLabel },
      ],
    },
  ];

  return (
    <div data-testid="auction-card" className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group flex h-full min-h-[34rem] flex-col">
      <AuctionMedia
        a={a}
        imgSrc={imgSrc}
        imageChain={imageChain}
        isLogoFallback={isLogoFallback}
        propertyTypeLabel={propertyTypeLabel}
        badge={badge}
        isGreek={isGreek}
      />

      <div data-testid="auction-card-body" className="flex min-h-[21rem] flex-1 flex-col gap-2.5 p-4">
        <div data-testid="auction-card-header" className="min-h-[4.75rem]">
          <Link to={`/auction/${a.id}`} state={{ auction: a }}>
            <h2 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">{a.title}</h2>
          </Link>
          <AuctionLocation address={a.address} city={a.city} />
        </div>
        <div data-testid="auction-card-chips" className="flex min-h-[3.25rem] max-h-[3.25rem] flex-col gap-1 overflow-hidden">
          <AuctionPropertyTypeChip label={propertyTypeLabel} />
          <AuctionOwnershipChip ownershipBadge={ownershipBadge} ownershipPct={ownershipPct} />
        </div>
        <div data-testid="auction-card-pills" className="flex min-h-[1.625rem] max-h-[1.625rem] flex-wrap items-center gap-1.5 overflow-hidden">
          <AuctionYearBuiltPill yearBuilt={a.year_built} isGreek={isGreek} />
          <AuctionFloorPill floor={floor} totalFloors={totalFloors} isGreek={isGreek} />
          <AuctionSizePill sqm={a.sqm} />
        </div>
        <AuctionGroupedDetails groups={groupedDetails} />
        <div data-testid="auction-card-price-zone" className="min-h-[2.25rem]">
          <AuctionPrice amount={price} />
          <AuctionCourt court={a.auction_court} />
        </div>
        <AuctionActions a={a} isFav={isFav} onToggleFav={onToggleFav} isGreek={isGreek} />
      </div>
    </div>
  );
};

export const AuctionCard = memo(AuctionCardComponent);
