import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Gavel, Flame,
  Eye, TrendingUp, Star, Video, Zap, CheckCircle,
  Home, ArrowRight, Calendar, Layers
} from "lucide-react";
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
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  energyClass?: string;
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

export function PropertyCard({ property, compact = false }: PropertyCardProps) {
  const [liked, setLiked] = useState(false);

  const formatPrice = (price: number, type: string) => {
    if (type === "rent") return `€${price.toLocaleString()}/mo`;
    return `€${price.toLocaleString()}`;
  };

  const getBadge = () => {
    if (property.listingType === "auction") return { label: "AUCTION", cls: "badge-auction" };
    if (property.listingType === "firesale") return { label: "FIRESALE™", cls: "badge-firesale" };
    if (property.isNew) return { label: "NEW", cls: "badge-new" };
    if (property.isPremium) return { label: "PREMIUM", cls: "bg-brand-purple/90 text-white" };
    return null;
  };

  const badge = getBadge();
  const discountPct = property.listingType === "auction" && property.auctionStartingBid
    ? Math.round((1 - property.auctionStartingBid / property.price) * 100)
    : null;

  if (compact) {
    return (
      <Link to={`/property/${property.id}`} className="glass-card rounded-xl overflow-hidden flex gap-3 p-3 property-card group">
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

  return (
    <div className="property-card glass-card rounded-xl overflow-hidden group flex flex-col">
      {/* Image */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "4/3" }}>
        <img
          src={property.images[0]}
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

        {/* Top: badges left, like right */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[70%]">
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {property.aiScore && property.aiScore >= 80 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/90 text-primary-foreground flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" /> {property.aiScore}
            </span>
          )}
          {discountPct && discountPct > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-destructive/90 text-destructive-foreground">
              -{discountPct}%
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3 flex gap-1.5">
          {property.hasVirtualTour && (
            <span className="bg-background/70 backdrop-blur-sm px-2 py-1 rounded-full text-[10px] text-primary font-semibold">360°</span>
          )}
          {property.hasVideo && (
            <span className="bg-background/70 backdrop-blur-sm p-1.5 rounded-full text-primary">
              <Video className="w-3 h-3" />
            </span>
          )}
          <button
            className={`p-1.5 rounded-full backdrop-blur-sm transition-all ${
              liked ? "bg-destructive text-white" : "bg-background/60 text-foreground hover:bg-background/80"
            }`}
            onClick={(e) => { e.preventDefault(); setLiked(!liked); }}
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Bottom overlay: price + price change */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <div className="text-xl font-display font-bold text-foreground drop-shadow-sm">
              {formatPrice(property.price, property.listingType)}
            </div>
            {property.pricePerSqm && (
              <div className="text-[11px] text-foreground/70">€{property.pricePerSqm}/m²</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {property.priceChange !== undefined && (
              <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                property.priceChange > 0
                  ? "bg-brand-emerald/20 text-brand-emerald"
                  : "bg-destructive/20 text-destructive"
              }`}>
                <TrendingUp className="w-3 h-3" />
                {property.priceChange > 0 ? "+" : ""}{property.priceChange}%
              </div>
            )}
            {property.views && (
              <div className="flex items-center gap-1 text-[11px] text-foreground/70 backdrop-blur-sm">
                <Eye className="w-3 h-3" /> {property.views}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Title + location */}
        <div>
          <Link to={`/property/${property.id}`}>
            <h3 className="font-display font-semibold text-sm text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug">
              {property.title}
            </h3>
          </Link>
          <div className="flex items-center gap-1 mt-1.5 text-muted-foreground text-xs">
            <MapPin className="w-3 h-3 shrink-0 text-primary/60" />
            <span className="truncate">{property.address}, {property.city}</span>
          </div>
        </div>

        {/* Key specs row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg">
              <Bed className="w-3 h-3" /> {property.bedrooms}bd
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg">
              <Bath className="w-3 h-3" /> {property.bathrooms}ba
            </span>
          )}
          <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg">
            <Square className="w-3 h-3" /> {property.sqm}m²
          </span>
          <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg capitalize">
            <Home className="w-3 h-3" /> {property.type}
          </span>
          {property.floor != null && (
            <span className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg">
              <Layers className="w-3 h-3" /> {property.floor}{property.totalFloors ? `/${property.totalFloors}F` : "F"}
            </span>
          )}
        </div>

        {/* Extra data row: year, energy */}
        {(property.yearBuilt || property.energyClass) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {property.yearBuilt && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Built {property.yearBuilt}
              </span>
            )}
            {property.energyClass && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${energyColors[property.energyClass] || "bg-muted"}`}>
                {property.energyClass}
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {property.tags && property.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {property.tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Auction banner */}
        {property.listingType === "auction" && property.auctionDate && (
          <div className="flex items-center gap-2 bg-brand-gold/10 rounded-lg p-2.5 border border-brand-gold/20">
            <Gavel className="w-3.5 h-3.5 text-brand-gold shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-brand-gold">Auction</div>
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
          <div className="flex items-center gap-2 bg-destructive/10 rounded-lg p-2.5 border border-destructive/20">
            <Flame className="w-3.5 h-3.5 text-destructive shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-destructive">Quick Sale</div>
              <div className="text-[11px] text-muted-foreground">Motivated seller · fast close</div>
            </div>
          </div>
        )}

        {/* Agent + CTA */}
        <div className="flex items-center gap-2 pt-2 border-t border-border mt-auto">
          {property.agent ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                {property.agent.name[0]}
              </div>
              <span className="text-xs text-muted-foreground truncate">{property.agent.name}</span>
              {property.agent.verified && (
                <CheckCircle className="w-3 h-3 text-primary shrink-0" />
              )}
            </div>
          ) : <div className="flex-1" />}
          <Link
            to={`/property/${property.id}`}
            className="flex items-center gap-1 text-xs text-primary font-medium hover:gap-2 transition-all shrink-0"
          >
            View <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
