import { forwardRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Gavel, Flame,
  Eye, TrendingUp, Video, CheckCircle,
  Calendar, Layers,
  Share2, Flag, Crown, Clock,
} from "lucide-react";
import { getSubtypeLabel, type PropertyTypeKey } from "@/lib/propertyTypes";
import { useToggleFavorite, useIsFavorited } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { APP_ORIGIN } from "@/lib/config";
import { formatPrice } from "@/lib/format";
import {
  MAIPROP_LOGO_FALLBACK_URL,
  getImageFallbackChain,
  isMaiPropLogoFallback,
  switchImageToNextFallback,
} from "@/lib/imageFallbacks";

export interface Property {
  id: string;
  title: string;
  address: string;
  city: string;
  price: number;
  pricePerSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqm: number;
  images: string[];
  type: PropertyTypeKey;
  listingType: "sale" | "rent" | "auction" | "firesale" | "open_house" | "new_build";
  subtype?: string;
  auctionDate?: string;
  auctionStartingBid?: number;
  isNew?: boolean;
  isFeatured?: boolean;
  isPremium?: boolean;
  agent?: {
    name: string;
    avatar?: string;
    verified: boolean;
  };
  /** Owner type for badge: agent vs private seller/landlord */
  ownerParticipantType?: "agent" | "seller" | null;
  aiScore?: number;
  views?: number;
  priceChange?: number;
  tags?: string[];
  hasVideo?: boolean;
  hasVirtualTour?: boolean;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  energyClass?: string;
  ownershipStatus?: string;
  ownershipPercentage?: number;
  /** ISO date string for open house — used for countdown badge */
  openHouseDateIso?: string;
  /** True when listing is a pre-sale / off-plan new build */
  isPreSale?: boolean;
  constructionStatus?: string;
  /** Neighbourhood quality scores populated by the neighbourhood-report edge function */
  walkabilityScore?: number;
  safetyScore?: number;
  noiseScore?: number;
  /** Raw DB listing row used to seed detail pages for instant card-to-detail opens. */
  _raw?: unknown;
}

interface PropertyCardProps {
  property: Property;
  compact?: boolean;
  testId?: string;
}

const energyColors: Record<string, string> = {
  /* A+/A use brand-cyan-deep so the white text in line ~369 meets AA contrast. */
  "A+": "bg-brand-cyan-deep", A: "bg-brand-cyan-deep/85", "B+": "bg-primary/80",
  B: "bg-primary/60", C: "bg-brand-gold/80", D: "bg-brand-gold/60",
  E: "bg-destructive/80", F: "bg-destructive", G: "bg-destructive",
};

// Internal/system tag prefixes that should never be shown to users
const SYSTEM_TAG_PREFIXES = [
  "os_auction:", "source:", "auction_status:", "ownership:", "ownership_pct:",
  "round:", "status:", "posted", "sync:", "land_type:", "commercial_type:",
];

const PROPERTY_IMAGE_WIDTHS = [320, 480, 768, 1024];
const PROPERTY_CARD_IMAGE_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
const COMPACT_PROPERTY_IMAGE_SIZES = "96px";

const withUnsplashImageParams = (url: URL, width: number): string | null => {
  if (!url.hostname.includes("images.unsplash.com")) return null;

  url.searchParams.set("auto", "format");
  url.searchParams.set("q", "80");
  url.searchParams.set("w", String(width));
  return url.toString();
};

const withSupabaseImageParams = (url: URL, width: number): string | null => {
  if (!url.hostname.endsWith("supabase.co") || !url.pathname.includes("/storage/v1/object/public/")) return null;

  url.pathname = url.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  url.searchParams.set("quality", "80");
  url.searchParams.set("resize", "cover");
  url.searchParams.set("width", String(width));
  return url.toString();
};

const getSizedImageUrl = (src: string, width: number): string | null => {
  try {
    const url = new URL(src, APP_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    return withUnsplashImageParams(url, width) ?? withSupabaseImageParams(url, width);
  } catch {
    return null;
  }
};

const getPropertyImageSrcSet = (src: string): string | undefined => {
  const srcSet = PROPERTY_IMAGE_WIDTHS
    .map((width) => {
      const sizedUrl = getSizedImageUrl(src, width);
      return sizedUrl ? `${sizedUrl} ${width}w` : null;
    })
    .filter(Boolean)
    .join(", ");

  return srcSet || undefined;
};

export const PropertyCard = memo(forwardRef<HTMLDivElement, PropertyCardProps>(function PropertyCard({ property, compact = false, testId = "property-card" }, _ref) { // skipcq: JS-R1005, JS-W1044 - Card rendering branches compact, auction, and standard listing affordances in one reusable surface.
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: isFavorited = false } = useIsFavorited(property.id);
  const toggleFav = useToggleFavorite();
  const imageChain = getImageFallbackChain(property.images);

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) { navigate("/login"); return; }
    toggleFav.mutate({ listing_id: property.id, isFavorited });
  };

  const detailPath = property.listingType === "auction"
    ? `/auction/${property.id}`
    : property.listingType === "open_house"
    ? `/open-house/${property.id}`
    : (property.isPreSale || property.constructionStatus)
    ? `/new-build/${property.id}`
    : `/property/${property.id}`;
  const rawListing = property._raw && typeof property._raw === "object"
    ? {
        ...(property._raw as Record<string, unknown>),
        ownerParticipantType: property.ownerParticipantType ?? (property._raw as Record<string, unknown>).ownerParticipantType,
      }
    : null;
  const detailState = rawListing
    ? property.listingType === "auction"
      ? { auction: rawListing, listing: rawListing }
      : { listing: rawListing }
    : undefined;
  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${APP_ORIGIN}${detailPath}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: property.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("propertyCard.linkCopied"));
      }
    } catch (_err: unknown) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("propertyCard.linkCopied"));
      } catch (_clipErr: unknown) {
        toast.error(t("propertyCard.copyFailed"));
      }
    }
  };

  const handleReport = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast.error(t("propertyCard.signInToReport")); navigate("/login"); return; }
    const entityType = property.listingType === "firesale" ? "firesale_request" : "listing";
    const { error } = await supabase.from("listing_reports").insert({
      entity_type: entityType,
      entity_id: property.id,
      reporter_id: user.id,
    });
    if (error) toast.error(t("propertyCard.errorReport"));
    else toast.success(t("propertyCard.reportSubmitted"));
  };

  const getBadge = () => { // skipcq: JS-R1005 - Badge priority intentionally checks mutually exclusive listing states in order.
  if (property.listingType === "auction") return { label: t("propertyCard.badges.auction"), cls: "badge-auction" };
    if (property.listingType === "open_house") return { label: t("propertyCard.badges.openHouse"), cls: "badge-open-house" };
    if (property.listingType === "firesale") return { label: t("propertyCard.badges.quickSale"), cls: "badge-firesale" };
    if (property.isPreSale || property.constructionStatus) return { label: t("propertyCard.badges.newBuild"), cls: "bg-teal-600/90 text-white" };
    if (property.isNew) return { label: t("propertyCard.badges.new"), cls: "badge-new" };
    if (property.isPremium) return { label: t("propertyCard.badges.premium"), cls: "bg-brand-purple/90 text-white" };
    return null;
  };

  const badge = getBadge();
  const badges = [...(badge ? [badge] : []), ...(property.isFeatured ? [{ label: t("propertyCard.badges.featured"), cls: "bg-brand-gold/90 text-white flex items-center gap-1" }] : [])];
  const countdown = property.listingType === "open_house" && property.openHouseDateIso ? (() => {
    const diff = new Date(property.openHouseDateIso).getTime() - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hours > 48) return null;
    if (hours === 0) return { label: `${mins}m`, urgent: true };
    return { label: `${hours}h ${mins}m`, urgent: hours < 6 };
  })() : null;
  const discountPct = property.listingType === "auction" && property.auctionStartingBid
    ? Math.round((1 - property.auctionStartingBid / property.price) * 100)
    : null;

  if (compact) {
    const thumb = imageChain[0] || MAIPROP_LOGO_FALLBACK_URL;
    const thumbSrcSet = isMaiPropLogoFallback(thumb) ? undefined : getPropertyImageSrcSet(thumb);
    const thumbIsLogoFallback = isMaiPropLogoFallback(thumb);
    return (
      <Link to={detailPath} state={detailState} className="glass-card rounded-xl overflow-hidden flex gap-3 p-3 property-card group" data-testid={testId}>
        <div className="relative w-24 h-20 rounded-lg overflow-hidden shrink-0 bg-muted">
          <img
            src={thumb}
            srcSet={thumbSrcSet}
            sizes={thumbSrcSet ? COMPACT_PROPERTY_IMAGE_SIZES : undefined}
            alt={property.title}
            loading="lazy"
            data-image-fallback-index={imageChain.length ? "0" : undefined}
            className={`w-full h-full transition-transform duration-300 ${
              thumbIsLogoFallback ? "object-contain p-3 bg-background" : "object-cover group-hover:scale-105"
            }`}
            onError={(e) => switchImageToNextFallback(e.currentTarget, imageChain)}
          />
          <div className="absolute top-1 left-1 flex gap-1 flex-wrap">
            {badges.map((b) => (
              <span key={b.label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${b.cls} ${b.label === "Featured" ? "inline-flex items-center gap-0.5" : ""}`}>
                {b.label === "Featured" && <Crown className="w-2 h-2" />}
                {b.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-2">{property.title}</h3>
          <div className="flex items-center gap-1 mt-1 text-muted-foreground text-[11px]">
            <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{property.city}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
            {property.bedrooms != null && <span className="flex items-center gap-0.5"><Bed className="w-3 h-3" />{property.bedrooms}</span>}
            <span className="flex items-center gap-0.5"><Square className="w-3 h-3" />{property.sqm}m²</span>
          </div>
          <div className="font-display font-bold text-sm text-primary mt-1">{property.listingType === "rent" ? `${formatPrice(property.price)}/mo` : formatPrice(property.price)}</div>
        </div>
      </Link>
    );
  }

  const mainImage = imageChain[0] || MAIPROP_LOGO_FALLBACK_URL;
  const mainImageSrcSet = isMaiPropLogoFallback(mainImage) ? undefined : getPropertyImageSrcSet(mainImage);
  const mainImageIsLogoFallback = isMaiPropLogoFallback(mainImage);

  return (
    <div data-testid={testId} className={`property-card rounded-2xl overflow-hidden group flex flex-col bg-card transition-shadow duration-300 ${
      property.isFeatured
        ? "border-2 border-amber-400/70 shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_4px_24px_rgba(251,191,36,0.22)] hover:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_32px_rgba(251,191,36,0.35)]"
        : "border border-border"
    }`}>
      {/* Image — taller on mobile (4/3) for better thumbnail, 3/2 on larger screens */}
      <div className="relative overflow-hidden bg-secondary aspect-[4/3] sm:aspect-[3/2]">
        <img
          src={mainImage}
          srcSet={mainImageSrcSet}
          sizes={mainImageSrcSet ? PROPERTY_CARD_IMAGE_SIZES : undefined}
          alt={property.title}
          loading="lazy"
          data-image-fallback-index={imageChain.length ? "0" : undefined}
          className={`w-full h-full transition-transform duration-500 ${
            mainImageIsLogoFallback ? "object-contain p-8 bg-background" : "object-cover group-hover:scale-105"
          }`}
          onError={(e) => switchImageToNextFallback(e.currentTarget, imageChain)}
        />
        {/* Soft gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

        {/* Badges top-left */}
        <div className="absolute top-3 left-3 right-16 flex gap-1.5 flex-wrap">
          {countdown && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1 ${
              countdown.urgent ? "bg-destructive/90 text-white" : "bg-brand-gold text-background"
            }`}>
              {countdown.urgent ? <Flame className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {countdown.label}
            </span>
          )}
          {badges.map((b) => (
            <span key={b.label} className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm ${b.cls} ${b.label === "Featured" ? "inline-flex items-center gap-1" : ""}`}>
              {b.label === "Featured" && <Crown className="w-2.5 h-2.5" />}
              {b.label}
            </span>
          ))}
          {property.subtype && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/90 text-accent-foreground shadow-sm capitalize">
              {getSubtypeLabel(property.type, property.subtype)}
            </span>
          )}
          {discountPct !== null && discountPct > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-destructive/90 text-white shadow-sm">
              -{discountPct}% off
            </span>
          )}
        </div>

        {/* Top-right controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
          {property.hasVirtualTour && (
            <span className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full text-xs text-white font-semibold">360°</span>
          )}
          {property.hasVideo && (
            <span className="bg-black/60 backdrop-blur-sm p-1.5 rounded-full text-white">
              <Video className="w-3 h-3" />
            </span>
          )}
          {/* Favorite button — 44px touch target on mobile */}
          <button
            className={`min-h-[44px] min-w-[44px] w-11 h-11 md:w-9 md:h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-90 ${
              isFavorited
                ? "bg-rose-500 text-white scale-110"
                : "bg-white/90 backdrop-blur-sm text-foreground hover:bg-white hover:scale-105"
            }`}
            onClick={handleFavorite}
            aria-label={isFavorited ? t("propertyCard.actions.unsave") : t("propertyCard.actions.save")}
          >
            <Heart className={`w-4 h-4 transition-all ${isFavorited ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Price block — bottom-left overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end justify-between">
            <div>
              {/* Amber-highlighted price */}
              <div className="inline-flex items-baseline gap-1.5 bg-primary/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-3 sm:py-1.5 shadow-md">
                <span className="text-lg sm:text-xl font-display font-bold text-primary-foreground leading-none">
                  {property.listingType === "rent" ? `${formatPrice(property.price)}/mo` : formatPrice(property.price)}
                </span>
              </div>
              {Boolean(property.pricePerSqm) && (
                <div className="text-xs text-white/70 mt-1 ml-1">€{property.pricePerSqm}/m²</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {property.priceChange !== undefined && (
                <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                  property.priceChange > 0
                    ? "bg-brand-emerald/25 text-brand-emerald"
                    : "bg-destructive/25 text-red-400"
                }`}>
                  <TrendingUp className="w-3 h-3" />
                  {property.priceChange > 0 ? "+" : ""}{property.priceChange}%
                </div>
              )}
              {(property.views ?? 0) > 0 && (
                <div className="flex items-center gap-1 text-xs text-white/60">
                  <Eye className="w-3 h-3" /> {property.views}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card body — more padding and slightly larger type on mobile for 2-col thumbnail view */}
      <div className="p-4 sm:p-4 flex flex-col flex-1 gap-3">
        {/* Title + location */}
        <div>
          <Link to={detailPath} state={detailState}>
            <h3 className="font-display font-semibold text-[15px] sm:text-base text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug">
              {property.title}
            </h3>
          </Link>
          <Link
            to={detailPath}
            state={detailState}
            className="flex items-center gap-1 mt-1.5 text-muted-foreground text-xs group/addr hover:text-primary transition-colors w-fit max-w-full"
          >
            <MapPin className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0 text-primary/70 group-hover/addr:text-primary transition-colors" />
            <span className="truncate underline-offset-2 group-hover/addr:underline text-xs sm:text-xs">
              {property.address}, {property.city}
            </span>
          </Link>
          {property.ownerParticipantType && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/80 border border-border/60">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {property.ownerParticipantType === "agent" ? t("propertyCard.agentListing") : t("propertyCard.privateSeller")}
              </span>
            </div>
          )}
        </div>

        {/* Key specs */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <span className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg font-medium">
              <Bed className="w-3.5 h-3.5" aria-hidden="true" /> {property.bedrooms} {t("common.bed")}
            </span>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <span className="flex items-center gap-1 bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-lg font-medium">
              <Bath className="w-3.5 h-3.5" aria-hidden="true" /> {property.bathrooms} {t("common.bath")}
            </span>
          )}
          <span className="flex items-center gap-1 bg-brand-purple/10 text-brand-purple border border-brand-purple/20 px-2.5 py-1 rounded-lg font-medium">
            <Square className="w-3.5 h-3.5" aria-hidden="true" /> {property.sqm} {t("common.sqm")}
          </span>
          {property.floor != null && (
            <span className="flex items-center gap-1 bg-secondary text-muted-foreground border border-border px-2.5 py-1 rounded-lg font-medium">
              <Layers className="w-3.5 h-3.5" />
              {property.floor === -1 ? t("propertyCard.basement") : property.floor === 0 ? t("propertyCard.groundFloor") : `${property.floor}${t("propertyCard.floor")}`}
              {property.totalFloors != null && `/${property.totalFloors}`}
            </span>
          )}
          {property.yearBuilt != null && (
            <span className="flex items-center gap-1 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 px-2.5 py-1 rounded-lg font-medium">
              <Calendar className="w-3.5 h-3.5" /> {property.yearBuilt}
            </span>
          )}
          {property.energyClass && (
            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold text-primary-foreground ${energyColors[property.energyClass] || "bg-muted"}`}>
              {property.energyClass}
            </span>
          )}
          {/* Neighbourhood quality scores */}
          {property.walkabilityScore != null && (
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-[10px] border ${
              property.walkabilityScore >= 70
                ? "bg-brand-emerald/10 text-brand-emerald border-brand-emerald/25"
                : property.walkabilityScore >= 40
                ? "bg-brand-gold/10 text-brand-gold border-brand-gold/25"
                : "bg-secondary text-muted-foreground border-border"
            }`}>
              🚶 {property.walkabilityScore}
            </span>
          )}
          {property.safetyScore != null && (
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-[10px] border ${
              property.safetyScore >= 70
                ? "bg-brand-emerald/10 text-brand-emerald border-brand-emerald/25"
                : property.safetyScore >= 40
                ? "bg-brand-gold/10 text-brand-gold border-brand-gold/25"
                : "bg-secondary text-muted-foreground border-border"
            }`}>
              🛡 {property.safetyScore}
            </span>
          )}
          {/* Ownership status pill */}
          {property.ownershipStatus && (() => {
            const ownershipMap: Record<string, { label: string; cls: string }> = {
              full:    { label: t("propertyCard.ownership.full"), cls: "bg-primary/15 text-primary border border-primary/30" },
              partial: { label: t("propertyCard.ownership.partial"), cls: "bg-brand-gold/15 text-brand-gold border border-brand-gold/30" },
              common:  { label: t("propertyCard.ownership.undivided"), cls: "bg-brand-purple/15 text-brand-purple border border-brand-purple/30" },
              none:    { label: t("propertyCard.ownership.none"), cls: "bg-destructive/15 text-destructive border border-destructive/30" },
            };
            const ow = ownershipMap[property.ownershipStatus] || { label: property.ownershipStatus, cls: "bg-secondary border border-border" };
            return (
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-[10px] ${ow.cls}`}>
                {ow.label}
                {property.ownershipPercentage != null && property.ownershipStatus !== "full" && ` ${property.ownershipPercentage}%`}
              </span>
            );
          })()}
        </div>

        {/* Auction banner */}
        {property.listingType === "open_house" && property.auctionDate && (
          <div className="flex items-center gap-2 bg-brand-cyan/10 rounded-xl p-2.5 border border-brand-cyan/25">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-xs font-bold text-brand-purple">{t("propertyCard.openHouseDate")}</div>
              <div className="text-[11px] text-muted-foreground truncate">{property.auctionDate}</div>
            </div>
          </div>
        )}
        {property.listingType === "auction" && property.auctionDate && (
          <div className="flex items-center gap-2 bg-brand-auction/10 rounded-xl p-2.5 border border-brand-auction/25">
            <Gavel className="w-4 h-4 text-brand-auction shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-brand-auction">{t("propertyCard.auctionDate")}</div>
              <div className="text-[11px] text-muted-foreground truncate">{property.auctionDate}</div>
            </div>
            {property.auctionStartingBid && (
              <div className="text-xs font-bold text-brand-auction shrink-0">
                From €{property.auctionStartingBid.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Firesale urgency */}
        {property.listingType === "firesale" && (
          <div className="flex items-center gap-2 bg-destructive/10 rounded-xl p-2.5 border border-destructive/20">
            <Flame className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-destructive">{t("propertyCard.badges.quickSale")}</div>
              <div className="text-[11px] text-muted-foreground">{t("propertyCard.motivatedSeller")}</div>
            </div>
          </div>
        )}

        {/* Tags — system/internal tags are filtered out */}
        {(() => {
          const visibleTags = (property.tags || []).filter(
            (t: string) => !SYSTEM_TAG_PREFIXES.some(p => t.toLowerCase().startsWith(p.toLowerCase()))
          );
          if (!visibleTags.length) return null;
          return (
            <div className="flex gap-1.5 flex-wrap">
              {visibleTags.slice(0, 3).map(tag => (
                <span key={tag} className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-medium">
                  {tag}
                </span>
              ))}
            </div>
          );
        })()}



        {/* Agent row + CTA */}
        <div className="mt-auto pt-3 border-t border-border space-y-2.5">
          {/* Agent info */}
          {property.agent && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0">
                {property.agent.name[0]}
              </div>
              <span className="text-xs text-muted-foreground truncate flex-1">{property.agent.name}</span>
              {property.agent.verified && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary font-semibold">
                  <CheckCircle className="w-3 h-3" aria-hidden="true" /> {t("propertyCard.badges.verified")}
                </span>
              )}
            </div>
          )}
          {/* Action row: detail CTA for special inventory + Share + Report */}
          <div className={`flex items-center gap-2 ${property.listingType === "auction" || property.listingType === "open_house" ? "" : "justify-end"}`}>
            {property.listingType === "open_house" && (
              <Link to={detailPath} state={detailState} className="flex-1">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]">
                  <Calendar className="w-4 h-4" />
                  {t("propertyCard.actions.viewOpenHouse")}
                </button>
              </Link>
            )}
            {property.listingType === "auction" && (
              <Link to={detailPath} state={detailState} className="flex-1">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-auction text-white font-semibold text-sm transition-all hover:bg-brand-purple-dark hover:shadow-md active:scale-[0.98]">
                  <Gavel className="w-4 h-4" aria-hidden="true" />
                  {t("propertyCard.actions.viewAuction")}
                </button>
              </Link>
            )}
            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
              aria-label={t("propertyCard.actions.share")}
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleReport}
              className="p-2.5 rounded-xl border border-border bg-secondary text-muted-foreground/50 hover:text-muted-foreground transition-all"
              aria-label={t("propertyCard.actions.report")}
            >
              <Flag className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}));

PropertyCard.displayName = "PropertyCard";

