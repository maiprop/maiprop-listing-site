/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "react-router-dom";
import { Gavel, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { getStreetViewProxyUrl } from "@/lib/config";

interface Props {
  listings: any[];
  isLoading: boolean;
}

export function HomepageAuctionsSection({ listings, isLoading }: Props) {
  const { ref, inView } = useInView();

  return (
    <section className="py-10 sm:py-16 bg-secondary">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gavel className="w-4 h-4 text-brand-purple-dark" />
              <span className="text-xs font-semibold text-brand-purple-dark uppercase tracking-widest">Greek Auctions</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">This Week's Auctions</h2>
          </div>
          <Button variant="outline" size="sm" className="border-brand-purple-dark/30 text-brand-purple-dark hover:bg-brand-purple-dark/10 text-xs" asChild>
            <Link to="/auctions">
              All Auctions <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {listings.slice(0, 4).map((l: any) => {
            const svFallback =
              l.latitude != null && l.longitude != null
                ? getStreetViewProxyUrl({ lat: Number(l.latitude), lng: Number(l.longitude) })
                : null;
            const imgs: string[] = l.cover_image_url ? [l.cover_image_url] : [];
            if (!imgs.length && l.listing_images?.length) {
              const sorted = [...l.listing_images].sort((a: any, b: any) => a.sort_order - b.sort_order);
              sorted.forEach((img: any) => imgs.push(img.url));
            }
            if (!imgs.length && svFallback) imgs.push(svFallback);
            return (
              <PropertyCard
                key={l.id}
                property={{
                  id: l.id,
                  title: l.title,
                  address: l.address || l.city,
                  city: l.city,
                  price: Number(l.price),
                  pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
                  bedrooms: l.bedrooms,
                  bathrooms: l.bathrooms,
                  sqm: Number(l.sqm),
                  floor: l.floor,
                  totalFloors: l.total_floors,
                  yearBuilt: l.year_built,
                  energyClass: l.energy_class,
                  images: imgs,
                  type: l.property_type,
                  listingType: l.listing_type,
                  auctionDate: l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
                  auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
                  aiScore: l.ai_score,
                  views: l.views_count,
                  tags: l.tags || [],
                  isPreSale: l.is_pre_sale ?? false,
                  constructionStatus: l.construction_status ?? undefined,
                }}
              />
            );
          })}
          {isLoading && listings.length === 0 &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl border border-border overflow-hidden animate-pulse">
                <div className="bg-muted h-52 w-full" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-muted rounded-md w-3/4" />
                  <div className="h-3 bg-muted rounded-md w-1/2" />
                  <div className="h-5 bg-muted rounded-md w-1/3" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
