import { forwardRef, memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin, Square, Heart, Gavel, Flame,
  Eye, TrendingUp, Video, CheckCircle,
  Calendar, Layers, Building2,
  Share2, Flag, Crown, Clock,
} from "lucide-react";
import { getSubtypeLabel, type PropertyTypeKey } from "@/lib/propertyTypes";
import { useToggleFavorite, useIsFavorited } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { APP_ORIGIN } from "@/lib/config";
import { formatPrice } from "@/lib/format";
import { listingReportSchema, parseMutationInput } from "@/lib/mutationSchemas";
import {
  MAIPROP_LOGO_FALLBACK_URL,
  getImageFallbackChain,
  isMaiPropLogoFallback,
  switchImageToNextFallback,
  switchImageToNextFallbackIfEmpty,
} from "@/lib/imageFallbacks";
import { getListingDetailPath, shouldUseNewBuildRoute } from "@/lib/listingRoutes";

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
  openHouseTransactionType?: "sale" | "rent" | null;
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
  /** True when the card should show the New Building project badge */
  isPreSale?: boolean;
  constructionStatus?: string;
  newBuildUnitSizeMin?: number;
  newBuildUnitSizeMax?: number;
  newBuildUnitCount?: number;
  newBuildAvailableUnitCount?: number;
  newBuildDeliveryYear?: number;
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
  imagePriority?: boolean;
  deferOffscreenRendering?: boolean;
  footerAccessory?: ReactNode;
}

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

const getSizedImageUrl = (src: string, width: number): string | null => {
  try {
    const url = new URL(src, APP_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/storage/v1/object/public/")) return null;

    return withUnsplashImageParams(url, width);
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

const formatFloorLabel = (
  floor: number,
  totalFloors: number | undefined,
  t: (key: string) => string,
) => {
  const floorLabel =
    floor === -1
      ? t("propertyCard.basement")
      : floor === 0
        ? t("propertyCard.groundFloor")
        : `${floor}${t("propertyCard.floor")}`;

  return totalFloors != null ? `${floorLabel}/${totalFloors}` : floorLabel;
};

const formatCompactNumber = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
};

const formatNewBuildSizeLabel = (property: Property, sqmLabel: string): string => {
  const min = property.newBuildUnitSizeMin;
  const max = property.newBuildUnitSizeMax;
  if (min != null && max != null) {
    const range = min === max
      ? formatCompactNumber(min)
      : `${formatCompactNumber(min)}-${formatCompactNumber(max)}`;
    return `${range} ${sqmLabel}`;
  }
  return `${property.sqm} ${sqmLabel}`;
};

const formatNewBuildUnitLabel = (property: Property): string | null => {
  const total = property.newBuildUnitCount;
  if (!total) return null;
  const available = property.newBuildAvailableUnitCount;
  const prefix = available != null && available !== total ? `${available}/${total}` : String(total);
  return `${prefix} unit${total === 1 ? "" : "s"}`;
};

export const PropertyCard = memo(forwardRef<HTMLDivElement, PropertyCardProps>(function PropertyCard({ property, compact = false, testId = "property-card", imagePriority = false, deferOffscreenRendering = true, footerAccessory }, _ref) { // skipcq: JS-R1005, JS-W1044 - Card rendering branches compact, auction, and standard listing affordances in one reusable surface.
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

  const routeListing = {
    id: property.id,
    is_pre_sale: property.isPreSale,
    listing_type: property.listingType,
  };
  const isNewBuildListing = shouldUseNewBuildRoute(routeListing);
  const detailPath = getListingDetailPath(routeListing);
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
    const payload = parseMutationInput(listingReportSchema, {
      entity_type: entityType,
      entity_id: property.id,
      reporter_id: user.id,
    }, "listing report");
    const { error } = await supabase.from("listing_reports").insert(payload);
    if (error) toast.error(t("propertyCard.errorReport"));
    else toast.success(t("propertyCard.reportSubmitted"));
  };

  const getBadge = () => { // skipcq: JS-R1005 - Badge priority intentionally checks mutually exclusive listing states in order.
  if (property.listingType === "auction") return { label: t("propertyCard.badges.auction"), cls: "badge-auction" };
    if (property.listingType === "open_house") return { label: t("propertyCard.badges.openHouse"), cls: "badge-open-house" };
    if (property.listingType === "firesale") return { label: t("propertyCard.badges.quickSale"), cls: "badge-firesale" };
    if (isNewBuildListing) return { label: t("propertyCard.badges.newBuild"), cls: "bg-teal-600/90 text-white" };
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
  const isRentalPricing =
    property.listingType === "rent" ||
    (property.listingType === "open_house" && property.openHouseTransactionType === "rent");
  const displayPrice = `${formatPrice(property.price)}${isRentalPricing ? "/mo" : ""}`;
  const specItems = isNewBuildListing
    ? [
        {
          key: "new-build-size",
          icon: Square,
          label: formatNewBuildSizeLabel(property, t("common.sqm")),
          className: "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
        },
        {
          key: "new-build-units",
          icon: Building2,
          label: formatNewBuildUnitLabel(property),
          className: "bg-secondary text-muted-foreground border-border",
        },
        {
          key: "new-build-delivery",
          icon: Calendar,
          label: property.newBuildDeliveryYear != null ? String(property.newBuildDeliveryYear) : property.yearBuilt != null ? String(property.yearBuilt) : null,
          className: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
        },
      ].filter((item): item is { key: string; icon: typeof Square; label: string; className: string } => Boolean(item.label))
    : [
        {
          key: "size",
          icon: Square,
          label: `${property.sqm} ${t("common.sqm")}`,
          className: "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
        },
        property.floor != null
          ? {
              key: "floor",
              icon: Layers,
              label: formatFloorLabel(property.floor, property.totalFloors, t),
              className: "bg-secondary text-muted-foreground border-border",
            }
          : null,
        property.yearBuilt != null
          ? {
              key: "year",
              icon: Calendar,
              label: String(property.yearBuilt),
              className: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
            }
          : null,
      ].filter((item): item is { key: string; icon: typeof Square; label: string; className: string } => Boolean(item));
  const hasPrimaryDetailAction = property.listingType === "auction" || property.listingType === "open_house";

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
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : undefined}
            decoding="async"
            data-image-fallback-index={imageChain.length ? "0" : undefined}
            className={`w-full h-full transition-transform duration-300 ${
              thumbIsLogoFallback ? "object-contain p-3 bg-background" : "object-cover group-hover:scale-105"
            }`}
            onLoad={(e) => switchImageToNextFallbackIfEmpty(e.currentTarget, imageChain)}
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
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
            {specItems.slice(0, 3).map((spec) => {
              const Icon = spec.icon;
              return (
                <span key={spec.key} className="flex items-center gap-0.5">
                  <Icon className="w-3 h-3" aria-hidden="true" />{spec.label}
                </span>
              );
            })}
          </div>
          <div className="font-display font-bold text-sm text-primary mt-1">{displayPrice}</div>
        </div>
      </Link>
    );
  }

  const mainImage = imageChain[0] || MAIPROP_LOGO_FALLBACK_URL;
  const mainImageSrcSet = isMaiPropLogoFallback(mainImage) ? undefined : getPropertyImageSrcSet(mainImage);
  const mainImageIsLogoFallback = isMaiPropLogoFallback(mainImage);
  const offscreenRenderingClass = deferOffscreenRendering
    ? "[content-visibility:auto] [contain-intrinsic-size:332px]"
    : "";

  return (
    <div data-testid={testId} className={`property-card h-[332px] w-full min-w-0 rounded-2xl overflow-hidden group grid grid-rows-[132px_minmax(0,1fr)] bg-card transition-shadow duration-300 ${offscreenRenderingClass} ${
      property.isFeatured
        ? "border-2 border-amber-400/70 shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_4px_24px_rgba(251,191,36,0.22)] hover:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_32px_rgba(251,191,36,0.35)]"
        : "border border-border"
    }`}>
      {/* Image — taller on mobile (4/3) for better thumbnail, 3/2 on larger screens */}
      <div data-testid="property-card-media" className="relative h-[132px] overflow-hidden bg-secondary">
        <img
          src={mainImage}
          srcSet={mainImageSrcSet}
          sizes={mainImageSrcSet ? PROPERTY_CARD_IMAGE_SIZES : undefined}
          alt={property.title}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : undefined}
          decoding="async"
          data-image-fallback-index={imageChain.length ? "0" : undefined}
          className={`w-full h-full transition-transform duration-500 ${
            mainImageIsLogoFallback ? "object-contain p-8 bg-background" : "object-cover group-hover:scale-105"
          }`}
          onLoad={(e) => switchImageToNextFallbackIfEmpty(e.currentTarget, imageChain)}
          onError={(e) => switchImageToNextFallback(e.currentTarget, imageChain)}
        />
        {/* Soft gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

        {/* Badges top-left */}
        <div className="absolute top-2.5 left-2.5 right-14 flex gap-1.5 overflow-hidden">
          {countdown && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm flex items-center gap-1 ${
              countdown.urgent ? "bg-destructive/90 text-white" : "bg-brand-gold text-background"
            }`}>
              {countdown.urgent ? <Flame className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {countdown.label}
            </span>
          )}
          {badges.map((b) => (
            <span key={b.label} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-sm ${b.cls} ${b.label === "Featured" ? "inline-flex items-center gap-1" : ""}`}>
              {b.label === "Featured" && <Crown className="w-2.5 h-2.5" />}
              {b.label}
            </span>
          ))}
          {property.subtype && (
            <span className="shrink-0 rounded-full bg-accent/90 px-2 py-0.5 text-[11px] font-semibold capitalize text-accent-foreground shadow-sm">
              {getSubtypeLabel(property.type, property.subtype)}
            </span>
          )}
          {discountPct !== null && discountPct > 0 && (
            <span className="shrink-0 rounded-full bg-destructive/90 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
              -{discountPct}% off
            </span>
          )}
        </div>

        {/* Top-right controls */}
        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 items-end">
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
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-end justify-between">
            <div>
              {/* Amber-highlighted price */}
              <div className="inline-flex items-baseline gap-1.5 rounded-xl bg-primary/90 px-2.5 py-1.5 shadow-md backdrop-blur-sm">
                <span className="text-base sm:text-lg font-display font-bold text-primary-foreground leading-none">
                  {displayPrice}
                </span>
              </div>
              {Boolean(property.pricePerSqm) && (
                <div className="ml-1 mt-0.5 text-[11px] text-white/70">€{property.pricePerSqm}/m²</div>
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
      <div data-testid="property-card-body" className="grid min-h-0 grid-rows-[3.5rem_1.5rem_minmax(0,1fr)_2.5rem] gap-1.5 p-3">
        {/* Title + location */}
        <div className="min-h-0 overflow-hidden">
          <Link to={detailPath} state={detailState}>
            <h3 className="min-h-[2.15rem] font-display text-sm font-semibold leading-snug text-foreground transition-colors line-clamp-2 hover:text-primary">
              {property.title}
            </h3>
          </Link>
          <Link
            to={detailPath}
            state={detailState}
            className="flex h-4 max-w-full items-center gap-1 overflow-hidden text-muted-foreground text-xs group/addr hover:text-primary transition-colors"
          >
            <MapPin className="w-3 h-3 shrink-0 text-primary/70 group-hover/addr:text-primary transition-colors" />
            <span className="truncate underline-offset-2 group-hover/addr:underline text-xs sm:text-xs">
              {property.address}, {property.city}
            </span>
          </Link>
        </div>

        {/* Key specs */}
        <div data-testid="property-card-specs" className="grid h-[1.5rem] grid-cols-3 items-center gap-1 overflow-hidden text-[10px] min-[1180px]:text-[11px]">
          {specItems.slice(0, 3).map((spec) => {
            const Icon = spec.icon;
            return (
              <span key={spec.key} className={`flex h-6 min-w-0 items-center gap-1 rounded-lg border px-1 font-medium ${spec.className}`}>
                <Icon className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{spec.label}</span>
              </span>
            );
          })}
        </div>

        <div className="min-h-0 overflow-hidden">
        {/* Auction banner */}
        {property.listingType === "open_house" && property.auctionDate && (
          <div className="flex h-full min-h-[2.25rem] items-center gap-2 rounded-xl border border-brand-cyan/25 bg-brand-cyan/10 px-2 py-1.5">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-brand-purple">{t("propertyCard.openHouseDate")}</div>
              <div className="truncate text-[11px] text-muted-foreground">{property.auctionDate}</div>
            </div>
          </div>
        )}
        {property.listingType === "auction" && property.auctionDate && (
          <div className="flex h-full min-h-[2.25rem] items-center gap-2 rounded-xl border border-brand-auction/25 bg-brand-auction/10 px-2 py-1.5">
            <Gavel className="w-4 h-4 text-brand-auction shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-brand-auction">{t("propertyCard.auctionDate")}</div>
              <div className="truncate text-[11px] text-muted-foreground">{property.auctionDate}</div>
            </div>
            {property.auctionStartingBid && (
              <div className="shrink-0 text-xs font-bold text-brand-auction">
                From €{property.auctionStartingBid.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Firesale urgency */}
        {property.listingType === "firesale" && (
          <div className="flex h-full min-h-[2.25rem] items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-2 py-1.5">
            <Flame className="w-4 h-4 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-destructive">{t("propertyCard.badges.quickSale")}</div>
              <div className="truncate text-[11px] text-muted-foreground">{t("propertyCard.motivatedSeller")}</div>
            </div>
          </div>
        )}

        </div>

        {/* Agent row + CTA */}
        <div data-testid="property-card-footer" className="flex min-h-[2.5rem] max-h-[2.5rem] items-center gap-2 overflow-hidden border-t border-border pt-2">
          {/* Agent info */}
          {property.agent && (
            <div className={`min-w-0 flex-1 items-center gap-2 ${hasPrimaryDetailAction ? "hidden min-[640px]:flex" : "flex"}`}>
              <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                {property.agent.name[0]}
              </div>
              <span className="text-[11px] text-muted-foreground truncate flex-1">{property.agent.name}</span>
              {property.agent.verified && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary font-semibold">
                  <CheckCircle className="w-2.5 h-2.5" aria-hidden="true" /> {t("propertyCard.badges.verified")}
                </span>
              )}
            </div>
          )}
          {/* Action row: detail CTA for special inventory + Share + Report */}
          <div className={`flex min-w-0 shrink-0 items-center gap-2 ${hasPrimaryDetailAction ? "flex-1" : "ml-auto"}`}>
            {property.listingType === "open_house" && (
              <Link to={detailPath} state={detailState} className="min-w-0 flex-1">
                <button className="flex h-9 md:h-8 w-full items-center justify-center gap-1.5 truncate rounded-xl bg-gradient-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t("propertyCard.actions.viewOpenHouse")}</span>
                </button>
              </Link>
            )}
            {property.listingType === "auction" && (
              <Link to={detailPath} state={detailState} className="min-w-0 flex-1">
                <button className="flex h-9 md:h-8 w-full items-center justify-center gap-1.5 truncate rounded-xl bg-brand-auction px-2.5 text-[11px] font-semibold text-white transition-all hover:bg-brand-purple-dark hover:shadow-md active:scale-[0.98]">
                  <Gavel className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("propertyCard.actions.viewAuction")}</span>
                </button>
              </Link>
            )}
            {footerAccessory}
            <button
              onClick={handleShare}
              className="flex h-9 w-9 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
              aria-label={t("propertyCard.actions.share")}
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleReport}
              className="flex h-9 w-9 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground/50 transition-all hover:text-muted-foreground"
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

