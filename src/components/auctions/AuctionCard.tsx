import { memo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Crown, Calendar, Clock, MapPin, Euro, Heart, Share2, Flag, ExternalLink, Building2, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  daysUntil, countdownBadge, getPropertyTypeLabel,
  normalizeOwnership, getOwnershipStatus, getOwnershipPct, OWNERSHIP_BADGE,
} from "@/lib/auctionUtils";
import { APP_ORIGIN } from "@/lib/config";
import { AUCTION_FALLBACK_LOGO_URL, getAuctionStreetViewImageUrl } from "@/lib/auctionStreetView";
import { applyLogoFallbackImageStyle, isMaiPropLogoFallback } from "@/lib/imageFallbacks";

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

const getCoverFallbackHref = (coverFallback: string | null): string | null => {
  if (!coverFallback) return null;
  try {
    return new URL(coverFallback, APP_ORIGIN).href;
  } catch (_err: unknown) {
    return null;
  }
};

const getCoverFallback = (coverImageUrl: unknown): string | null => {
  if (typeof coverImageUrl !== "string") return null;
  return coverImageUrl.trim() || null;
};

const canUseCoverFallback = (
  img: HTMLImageElement,
  coverFallback: string | null,
  coverFallbackHref: string | null,
): boolean => Boolean(
  coverFallback &&
  coverFallbackHref &&
  img.dataset.coverFallbackUsed !== "true" &&
  !isMaiPropLogoFallback(img.src) &&
  img.src !== coverFallbackHref,
);

const setCoverFallbackImage = (img: HTMLImageElement, coverFallback: string): void => {
  img.dataset.coverFallbackUsed = "true";
  img.removeAttribute("srcset");
  img.src = coverFallback;
  img.style.objectFit = "cover";
  img.style.padding = "";
  img.style.backgroundColor = "";
};

const setLogoFallbackImage = (img: HTMLImageElement): void => {
  img.dataset.logoFallbackUsed = "true";
  img.src = AUCTION_FALLBACK_LOGO_URL;
  applyLogoFallbackImageStyle(img);
};

const switchAuctionImageToFallback = (
  img: HTMLImageElement,
  coverFallback: string | null,
  coverFallbackHref: string | null,
): void => { // skipcq: JS-R1005 - Fallback order must handle Street View, cover image, and logo states distinctly.
  if (coverFallback && canUseCoverFallback(img, coverFallback, coverFallbackHref)) {
    setCoverFallbackImage(img, coverFallback);
    return;
  }

  if (img.dataset.logoFallbackUsed === "true") {
    img.style.display = "none";
    return;
  }

  setLogoFallbackImage(img);
};

const AuctionTopBadges = ({
  isFeatured,
  auctionDate,
}: {
  isFeatured: boolean;
  auctionDate?: string | null;
}) => (
  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
    {isFeatured && (
      <span className="inline-flex items-center gap-1 bg-gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
        <Crown className="w-2.5 h-2.5" /> Featured
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
  isLogoFallback,
  coverFallback,
  coverFallbackHref,
  propertyTypeLabel,
  badge,
}: {
  a: AuctionCardProps["a"];
  imgSrc: string;
  isLogoFallback: boolean;
  coverFallback: string | null;
  coverFallbackHref: string | null;
  propertyTypeLabel: string | null;
  badge: AuctionCountdownBadge;
}) => (
  <Link to={`/auction/${a.id}`} state={{ auction: a }} className="relative h-44 bg-secondary overflow-hidden block">
    <img
      src={imgSrc}
      alt={a.title}
      width={480}
      height={256}
      decoding="async"
      loading="lazy"
      className={`w-full h-full transition-transform duration-300 ${
        isLogoFallback
          ? "object-contain p-8 bg-background"
          : "object-cover group-hover:scale-105"
      }`}
      onError={e => switchAuctionImageToFallback(e.currentTarget, coverFallback, coverFallbackHref)}
    />
    <AuctionTopBadges isFeatured={Boolean(a.is_featured)} auctionDate={a.auction_date} />
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

const AuctionYearBuiltPill = ({ yearBuilt }: { yearBuilt?: string | number | null }) => {
  if (!yearBuilt) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
      Built {yearBuilt}
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

const shareAuctionLink = async (title: string, url: string): Promise<void> => {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (_err: unknown) {
      // Share was cancelled by the user.
    }
    return;
  }

  await navigator.clipboard.writeText(url);
  toast.success("Link copied to clipboard");
};

const ExternalAuctionLink = ({ websiteUrl }: { websiteUrl?: string | null }) => {
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
      eAuction
    </a>
  );
};

const AuctionActions = ({
  a,
  isFav,
  onToggleFav,
}: {
  a: AuctionCardProps["a"];
  isFav: boolean;
  onToggleFav: AuctionCardProps["onToggleFav"];
}) => {
  const handleFavorite = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onToggleFav(a.id, isFav);
  };

  const handleShare = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await shareAuctionLink(a.title, `${APP_ORIGIN}/auction/${a.id}`);
  };

  const handleReport = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    toast.info("Report submitted. Our team will review it.");
  };

  return (
    <div className="mt-auto pt-3 border-t border-border flex items-center gap-2">
      <button
        onClick={handleFavorite}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
          isFav ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Save"
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current text-rose-400" : ""}`} />
        {isFav ? "Saved" : "Save"}
      </button>
      <button
        onClick={handleShare}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
        aria-label="Share"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>
      <button
        onClick={handleReport}
        className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-all"
        aria-label="Report"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
      <ExternalAuctionLink websiteUrl={a.website_url} />
    </div>
  );
};

const AuctionCardComponent = ({ a, favoritedIds, onToggleFav }: AuctionCardProps) => { // skipcq: JS-R1005 - Auction cards compose independent image, ownership, date, and action affordances.
  const badge = countdownBadge(daysUntil(a.auction_date));
  const imgSrc = getAuctionStreetViewImageUrl(a) ?? AUCTION_FALLBACK_LOGO_URL;
  const isLogoFallback = imgSrc === AUCTION_FALLBACK_LOGO_URL;
  const coverFallback = getCoverFallback(a.cover_image_url);
  const coverFallbackHref = getCoverFallbackHref(coverFallback);
  const isFav = favoritedIds.has(a.id);
  const propertyTypeLabel = getPropertyTypeLabel(a);
  const ownershipStatus = normalizeOwnership(getOwnershipStatus(a.tags));
  const ownershipPct = getOwnershipPct(a.tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;
  const price = a.auction_starting_bid ?? a.price ?? 0;

  return (
    <div data-testid="auction-card" className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group flex flex-col">
      <AuctionMedia
        a={a}
        imgSrc={imgSrc}
        isLogoFallback={isLogoFallback}
        coverFallback={coverFallback}
        coverFallbackHref={coverFallbackHref}
        propertyTypeLabel={propertyTypeLabel}
        badge={badge}
      />

      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <Link to={`/auction/${a.id}`} state={{ auction: a }}>
          <h2 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">{a.title}</h2>
        </Link>
        <AuctionLocation address={a.address} city={a.city} />
        <AuctionPropertyTypeChip label={propertyTypeLabel} />
        <AuctionOwnershipChip ownershipBadge={ownershipBadge} ownershipPct={ownershipPct} />
        <div className="flex flex-wrap items-center gap-1.5 mt-1 empty:hidden">
          <AuctionYearBuiltPill yearBuilt={a.year_built} />
          <AuctionSizePill sqm={a.sqm} />
        </div>
        <AuctionPrice amount={price} />
        <AuctionCourt court={a.auction_court} />
        <AuctionActions a={a} isFav={isFav} onToggleFav={onToggleFav} />
      </div>
    </div>
  );
};

export const AuctionCard = memo(AuctionCardComponent);
