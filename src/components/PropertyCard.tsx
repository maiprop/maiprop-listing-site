import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Gavel, Flame,
  Eye, TrendingUp, Video, Zap, CheckCircle,
  Home, Calendar, Layers, MessageCircle,
  Share2, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSubtypeLabel, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { useToggleFavorite, useIsFavorited } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  type: "apartment" | "house" | "land" | "commercial" | "villa" | "office";
  listingType: "sale" | "rent" | "auction" | "firesale";
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
}

interface PropertyCardProps {
  property: Property;
  compact?: boolean;
}

const energyColors: Record<string, string> = {
  "A+": "bg-emerald-500", A: "bg-emerald-400", "B+": "bg-green-400",
  B: "bg-lime-400", C: "bg-yellow-400", D: "bg-orange-400",
  E: "bg-orange-500", F: "bg-red-500", G: "bg-red-600",
};

// Internal/system tag prefixes that should never be shown to users
const SYSTEM_TAG_PREFIXES = [
  "os_auction:", "source:", "auction_status:", "ownership:", "ownership_pct:",
  "round:", "status:", "posted", "sync:",
];

export function PropertyCard({ property, compact = false }: PropertyCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: isFavorited = false } = useIsFavorited(property.id);
  const toggleFav = useToggleFavorite();

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) { navigate("/login"); return; }
    toggleFav.mutate({ listing_id: property.id, isFavorited });
  };

  const detailPath = property.listingType === "auction"
    ? `/auction/${property.id}`
    : `/property/${property.id}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}${detailPath}`;
    if (navigator.share) {
      try { await navigator.share({ title: property.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleReport = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.info("Report submitted. Our team will review it.");
  };

  const formatPrice = (price: number, type: string) => {
    if (type === "rent") return `€${price.toLocaleString()}/mo`;
    return `€${price.toLocaleString()}`;
  };

  const getBadge = () => {
    if (property.listingType === "auction") return { label: "Auction", cls: "badge-auction" };
    if (property.listingType === "firesale") return { label: "Quick Sale", cls: "badge-firesale" };
    if (property.isNew) return { label: "New", cls: "badge-new" };
    if (property.isPremium) return { label: "Premium", cls: "bg-brand-coral/90 text-white" };
    return null;
  };

  const badge = getBadge();
  const discountPct = property.listingType === "auction" && property.auctionStartingBid
    ? Math.round((1 - property.auctionStartingBid / property.price) * 100)
    : null;

  if (compact) {
    return (
      <Link to={detailPath} className="glass-card rounded-xl overflow-hidden flex gap-3 p-3 property-card group">
        <div className="relative w-24 h-20 rounded-lg overflow-hidden shrink-0">
          <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          {badge && (
            <span className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
          )}
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
          <div className="font-display font-bold text-sm text-primary mt-1">{formatPrice(property.price, property.listingType)}</div>
        </div>
      </Link>
    );
  }

  const mainImage = property.images?.[0];

  return (
    <div className="property-card rounded-2xl overflow-hidden group flex flex-col bg-card border border-border">
      {/* Image — taller ratio */}
      <div className="relative overflow-hidden bg-secondary" style={{ aspectRatio: "3/2" }}>
        {mainImage ? (
          <img
            src={mainImage}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Home className="w-10 h-10 text-muted-foreground/20" />
            <span className="text-xs text-muted-foreground/40">No photo</span>
          </div>
        )}
        {/* Soft gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

        {/* Badges top-left */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[70%]">
          {badge && (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {property.subtype && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-accent/90 text-accent-foreground shadow-sm capitalize">
              {getSubtypeLabel(property.type, property.subtype)}
            </span>
          )}
          {property.aiScore && property.aiScore >= 80 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/90 text-primary-foreground flex items-center gap-1 shadow-sm">
              <Zap className="w-2.5 h-2.5" /> AI {property.aiScore}
            </span>
          )}
          {discountPct && discountPct > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-destructive/90 text-white shadow-sm">
              -{discountPct}% off
            </span>
          )}
        </div>

        {/* Top-right controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
          {property.hasVirtualTour && (
            <span className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full text-[10px] text-white font-semibold">360°</span>
          )}
          {property.hasVideo && (
            <span className="bg-black/60 backdrop-blur-sm p-1.5 rounded-full text-white">
              <Video className="w-3 h-3" />
            </span>
          )}
          {/* Favorite button */}
          <button
            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-90 ${
              isFavorited
                ? "bg-rose-500 text-white scale-110"
                : "bg-white/90 backdrop-blur-sm text-foreground hover:bg-white hover:scale-105"
            }`}
            onClick={handleFavorite}
            aria-label={isFavorited ? "Remove from saved" : "Save property"}
          >
            <Heart className={`w-4 h-4 transition-all ${isFavorited ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Price block — bottom-left overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end justify-between">
            <div>
              {/* Amber-highlighted price */}
              <div className="inline-flex items-baseline gap-1.5 bg-primary/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-md">
                <span className="text-xl font-display font-bold text-primary-foreground leading-none">
                  {formatPrice(property.price, property.listingType)}
                </span>
              </div>
              {property.pricePerSqm && (
                <div className="text-[11px] text-white/70 mt-1 ml-1">€{property.pricePerSqm}/m²</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {property.priceChange !== undefined && (
                <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                  property.priceChange > 0
                    ? "bg-brand-emerald/25 text-brand-emerald"
                    : "bg-destructive/25 text-red-400"
                }`}>
                  <TrendingUp className="w-3 h-3" />
                  {property.priceChange > 0 ? "+" : ""}{property.priceChange}%
                </div>
              )}
              {property.views && (
                <div className="flex items-center gap-1 text-[11px] text-white/60">
                  <Eye className="w-3 h-3" /> {property.views}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Title + location */}
        <div>
          <Link to={detailPath}>
            <h3 className="font-display font-semibold text-base text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug">
              {property.title}
            </h3>
          </Link>
          <Link
            to={detailPath}
            className="flex items-center gap-1 mt-1.5 text-muted-foreground text-xs group/addr hover:text-primary transition-colors w-fit max-w-full"
          >
            <MapPin className="w-3 h-3 shrink-0 text-primary/70 group-hover/addr:text-primary transition-colors" />
            <span className="truncate underline-offset-2 group-hover/addr:underline">{property.address}, {property.city}</span>
          </Link>
        </div>

        {/* Key specs */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg font-medium">
              <Bed className="w-3.5 h-3.5" /> {property.bedrooms} bed
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg font-medium">
              <Bath className="w-3.5 h-3.5" /> {property.bathrooms} bath
            </span>
          )}
          <span className="flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg font-medium">
            <Square className="w-3.5 h-3.5" /> {property.sqm} m²
          </span>
          {property.floor != null && (
            <span className="flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg font-medium">
              <Layers className="w-3.5 h-3.5" />
              {property.floor === -1 ? "Basement" : property.floor === 0 ? "Ground" : `${property.floor}F`}
              {property.totalFloors != null && `/${property.totalFloors}`}
            </span>
          )}
          {property.yearBuilt != null && (
            <span className="flex items-center gap-1 bg-secondary px-2.5 py-1 rounded-lg font-medium">
              <Calendar className="w-3.5 h-3.5" /> {property.yearBuilt}
            </span>
          )}
          {property.energyClass && (
            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold text-white ${energyColors[property.energyClass] || "bg-muted"}`}>
              {property.energyClass}
            </span>
          )}
          {/* Ownership status pill — shown for all statuses when present */}
          {property.ownershipStatus && (() => {
            const ownershipMap: Record<string, { label: string; cls: string }> = {
              full:    { label: "Πλήρης κυριότητα", cls: "bg-emerald-500/15 text-emerald-700 border border-emerald-400/30" },
              partial: { label: "Μερική κυριότητα", cls: "bg-amber-500/15 text-amber-700 border border-amber-400/30" },
              common:  { label: "Εξ αδιαιρέτου", cls: "bg-sky-500/15 text-sky-700 border border-sky-400/30" },
              none:    { label: "Χωρίς κυριότητα", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
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
        {property.listingType === "auction" && property.auctionDate && (
          <div className="flex items-center gap-2 bg-brand-gold/10 rounded-xl p-2.5 border border-brand-gold/25">
            <Gavel className="w-4 h-4 text-brand-gold shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-brand-gold">Auction Date</div>
              <div className="text-[11px] text-muted-foreground truncate">{property.auctionDate}</div>
            </div>
            {property.auctionStartingBid && (
              <div className="text-xs font-bold text-brand-gold shrink-0">
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
              <div className="text-xs font-semibold text-destructive">Quick Sale</div>
              <div className="text-[11px] text-muted-foreground">Motivated seller · fast close</div>
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
                <span className="flex items-center gap-0.5 text-[10px] text-brand-emerald font-semibold">
                  <CheckCircle className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
          )}
          {/* Action row: Contact (non-auction only) + Share + Report */}
          <div className="flex items-center gap-2">
            {property.listingType !== "auction" && (
              <Link to={detailPath} className="flex-1">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]">
                  <MessageCircle className="w-4 h-4" />
                  Contact Agent
                </button>
              </Link>
            )}
            {property.listingType === "auction" && (
              <Link to={detailPath} className="flex-1">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-gold text-black font-semibold text-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]">
                  <Gavel className="w-4 h-4" />
                  View Auction
                </button>
              </Link>
            )}
            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
              aria-label="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleReport}
              className="p-2.5 rounded-xl border border-border bg-secondary text-muted-foreground/50 hover:text-muted-foreground transition-all"
              aria-label="Report"
            >
              <Flag className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
