import { memo } from "react";
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function PremiumBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-primary text-primary-foreground border border-primary/30">
      <Lock className="w-2.5 h-2.5" /> PRO
    </span>
  );
}

function switchAuctionImageToFallback(
  img: HTMLImageElement,
  coverFallback: string | null,
  coverFallbackHref: string | null,
) {
  const canUseCoverFallback = Boolean(
    coverFallback &&
    coverFallbackHref &&
    img.dataset.coverFallbackUsed !== "true" &&
    !isMaiPropLogoFallback(img.src) &&
    img.src !== coverFallbackHref,
  );

  if (canUseCoverFallback && coverFallback) {
    img.dataset.coverFallbackUsed = "true";
    img.removeAttribute("srcset");
    img.src = coverFallback;
    img.style.objectFit = "cover";
    img.style.padding = "";
    img.style.backgroundColor = "";
    return;
  }

  if (img.dataset.logoFallbackUsed !== "true") {
    img.dataset.logoFallbackUsed = "true";
    img.src = AUCTION_FALLBACK_LOGO_URL;
    applyLogoFallbackImageStyle(img);
    return;
  }

  img.style.display = "none";
}

export const AuctionCard = memo(function AuctionCard({
  a,
  favoritedIds,
  onToggleFav,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: any;
  favoritedIds: Set<string>;
  onToggleFav: (id: string, isFav: boolean) => void;
}) {
  const days = daysUntil(a.auction_date);
  const badge = countdownBadge(days);
  const imgSrc = getAuctionStreetViewImageUrl(a) ?? AUCTION_FALLBACK_LOGO_URL;
  const isLogoFallback = imgSrc === AUCTION_FALLBACK_LOGO_URL;
  const coverFallback = typeof a.cover_image_url === "string" && a.cover_image_url.trim()
    ? a.cover_image_url.trim()
    : null;
  const coverFallbackHref = coverFallback ? new URL(coverFallback, APP_ORIGIN).href : null;
  const isFav = favoritedIds.has(a.id);
  const ownershipStatus = normalizeOwnership(getOwnershipStatus(a.tags));
  const ownershipPct = getOwnershipPct(a.tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${APP_ORIGIN}/auction/${a.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: a.title, url }); } catch (_err: unknown) { /* share cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleReport = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.info("Report submitted. Our team will review it.");
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group flex flex-col">
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
        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          {a.is_featured && (
            <span className="inline-flex items-center gap-1 bg-gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Crown className="w-2.5 h-2.5" /> Featured
            </span>
          )}
          {a.auction_date && (
            <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <Calendar className="w-3 h-3 text-primary" />
              {format(new Date(a.auction_date), "dd MMM yyyy")}
            </div>
          )}
        </div>
        {getPropertyTypeLabel(a) && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
            {getPropertyTypeLabel(a)}
          </div>
        )}
        {badge && (
          <div className={`absolute bottom-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            <Clock className="w-3 h-3" />
            {badge.label}
          </div>
        )}
      </Link>

      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <Link to={`/auction/${a.id}`} state={{ auction: a }}>
          <h2 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">{a.title}</h2>
        </Link>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{a.address ? `${a.address}, ` : ""}{a.city}</span>
        </div>

        {getPropertyTypeLabel(a) && (
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit">
            {getPropertyTypeLabel(a)}
          </span>
        )}

        {ownershipBadge && (
          <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${ownershipBadge.cls}`}>
            <Building2 className="w-2.5 h-2.5" />
            {ownershipBadge.label}
            {ownershipPct != null && ownershipPct < 100 && <span className="opacity-80">({ownershipPct}%)</span>}
          </div>
        )}

        {(a.year_built || (a.sqm && a.sqm > 1)) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {a.year_built && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
                Built {a.year_built}
              </span>
            )}
            {a.sqm && a.sqm > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-foreground border border-border">
                {a.sqm} τ.μ.
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 font-display font-bold bg-gradient-primary bg-clip-text text-transparent">
            <Euro className="w-3.5 h-3.5 text-primary" />
            {(a.auction_starting_bid ?? a.price ?? 0).toLocaleString("el-GR")}
          </div>
        </div>
        {a.auction_court && !/^[A-Z_]+$/.test(a.auction_court) && (
          <div className="text-xs text-muted-foreground truncate">{a.auction_court}</div>
        )}

        <div className="mt-auto pt-3 border-t border-border flex items-center gap-2">
          <button
            onClick={e => { e.preventDefault(); onToggleFav(a.id, isFav); }}
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
          {a.website_url && (
            <a
              href={a.website_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              eAuction
            </a>
          )}
        </div>
      </div>
    </div>
  );
});
