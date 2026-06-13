/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom";
import { Star, MapPin } from "lucide-react";
import { getListingDetailPath } from "@/lib/listingRoutes";

export function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.floor(rating) ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

const REVIEW_SERVICE_TYPES: Record<string, string[]> = {
  real_estate_agent: ["Bought", "Sold", "Rented", "Let", "Other"],
  lawyer: ["Conveyancing", "Legal Advice", "Contract Review", "Other"],
  notary: ["Conveyancing", "Legal Advice", "Contract Review", "Other"],
  architect: ["Design", "Survey", "Renovation Supervision", "Other"],
  civil_engineer: ["Design", "Survey", "Renovation Supervision", "Other"],
  valuer: ["Property Valuation", "Investment Analysis", "Other"],
  property_manager: ["Property Management", "Tenant Screening", "Other"],
};

export function getReviewServiceTypes(category: string): string[] {
  return REVIEW_SERVICE_TYPES[category] ?? ["Consultation", "Project Work", "Other"];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ListingGrid({ listings }: { listings: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {listings.map((listing: any) => (
        <Link
          key={listing.id}
          to={getListingDetailPath(listing)}
          className="group border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors bg-card"
        >
          {listing.cover_image_url && (
            <div className="aspect-video overflow-hidden">
              <img
                src={listing.cover_image_url}
                alt={listing.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
          )}
          <div className="p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">{listing.title}</p>
              {listing.listing_type === "new_build" && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 font-medium">New Building</span>
              )}
              {listing.listing_type === "open_house" && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">Open House</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <MapPin className="w-3 h-3" /> {listing.city}
            </p>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-brand-gold">
                {listing.listing_type === "rent"
                  ? `€${listing.price?.toLocaleString()}/mo`
                  : `€${listing.price?.toLocaleString()}`}
              </span>
              <span className="text-xs text-muted-foreground">{listing.sqm}m² · {listing.bedrooms}BR</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
