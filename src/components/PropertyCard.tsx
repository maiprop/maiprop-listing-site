import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, ExternalLink, Gavel, Flame,
  Eye, TrendingUp, Star, Calendar, Video
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  type: "apartment" | "house" | "land" | "commercial" | "villa";
  listingType: "sale" | "rent" | "auction" | "firesale";
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
}

interface PropertyCardProps {
  property: Property;
  compact?: boolean;
}

export function PropertyCard({ property, compact = false }: PropertyCardProps) {
  const [liked, setLiked] = useState(false);

  const formatPrice = (price: number, type: string) => {
    if (type === "rent") return `€${price.toLocaleString()}/mo`;
    return `€${price.toLocaleString()}`;
  };

  const getBadge = () => {
    if (property.listingType === "auction") return { label: "AUCTION", class: "badge-auction" };
    if (property.listingType === "firesale") return { label: "FIRESALE", class: "badge-firesale" };
    if (property.isNew) return { label: "NEW", class: "badge-new" };
    if (property.isPremium) return { label: "PREMIUM", class: "bg-brand-purple text-white text-xs" };
    return null;
  };

  const badge = getBadge();

  return (
    <div className={`property-card glass-card rounded-xl overflow-hidden group ${compact ? "" : ""}`}>
      {/* Image */}
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={property.images[0]}
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${badge.class}`}>
              {badge.label}
            </span>
          )}
          {property.aiScore && property.aiScore >= 80 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gradient-primary text-primary-foreground uppercase tracking-wide">
              AI {property.aiScore}
            </span>
          )}
        </div>

        {/* Like button */}
        <button
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-sm transition-all ${
            liked ? "bg-destructive text-white" : "bg-background/40 text-foreground hover:bg-background/70"
          }`}
          onClick={(e) => { e.preventDefault(); setLiked(!liked); }}
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
        </button>

        {/* Bottom overlay info */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <div className="text-xl font-display font-bold text-foreground">
              {formatPrice(property.price, property.listingType)}
            </div>
            {property.pricePerSqm && (
              <div className="text-xs text-muted-foreground">
                €{property.pricePerSqm}/m²
              </div>
            )}
          </div>
          {property.priceChange !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-semibold ${property.priceChange > 0 ? "text-brand-emerald" : "text-destructive"}`}>
              <TrendingUp className="w-3 h-3" />
              {property.priceChange > 0 ? "+" : ""}{property.priceChange}%
            </div>
          )}
        </div>

        {/* Video/tour indicators */}
        <div className="absolute bottom-10 right-3 flex gap-1">
          {property.hasVideo && (
            <span className="bg-background/60 backdrop-blur-sm p-1 rounded text-xs text-primary">
              <Video className="w-3 h-3" />
            </span>
          )}
          {property.hasVirtualTour && (
            <span className="bg-background/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-primary font-semibold">
              360°
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Link to={`/property/${property.id}`}>
          <h3 className="font-display font-semibold text-sm text-foreground hover:text-primary transition-colors line-clamp-1">
            {property.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1 mt-1 text-muted-foreground text-xs">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{property.address}, {property.city}</span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {property.bedrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bed className="w-3 h-3" />
              {property.bedrooms}
            </span>
          )}
          {property.bathrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bath className="w-3 h-3" />
              {property.bathrooms}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Square className="w-3 h-3" />
            {property.sqm} m²
          </span>
          {property.views && (
            <span className="flex items-center gap-1 ml-auto">
              <Eye className="w-3 h-3" />
              {property.views}
            </span>
          )}
        </div>

        {/* Auction specific */}
        {property.listingType === "auction" && property.auctionDate && (
          <div className="mt-3 flex items-center gap-2 bg-brand-gold/10 rounded-lg p-2 border border-brand-gold/20">
            <Gavel className="w-3.5 h-3.5 text-brand-gold" />
            <div>
              <div className="text-xs font-semibold text-brand-gold">Auction</div>
              <div className="text-[10px] text-muted-foreground">{property.auctionDate}</div>
            </div>
            {property.auctionStartingBid && (
              <div className="ml-auto text-xs font-bold text-brand-gold">
                From €{property.auctionStartingBid.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Agent */}
        {!compact && property.agent && (
          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border">
            <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
              {property.agent.name[0]}
            </div>
            <span className="text-xs text-muted-foreground truncate">{property.agent.name}</span>
            {property.agent.verified && (
              <Star className="w-3 h-3 text-brand-gold fill-brand-gold ml-auto" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
