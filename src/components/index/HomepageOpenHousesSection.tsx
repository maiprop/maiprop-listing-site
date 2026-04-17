/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { getStreetViewProxyUrl } from "@/lib/config";

interface Props {
  listings: any[];
}

export function HomepageOpenHousesSection({ listings }: Props) {
  const { ref, inView } = useInView();

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Open Houses</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">Scheduled viewings — no appointment needed</h2>
          </div>
          <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 text-xs" asChild>
            <Link to="/open-houses">
              All Open Houses <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div
          ref={ref}
          className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}
        >
          {listings.slice(0, 4).map((l: any) => {
            const imgs: string[] = l.cover_image_url ? [l.cover_image_url] : [];
            if (!imgs.length && l.listing_images?.length) {
              const sorted = [...l.listing_images].sort((a: any, b: any) => a.sort_order - b.sort_order);
              sorted.forEach((img: any) => imgs.push(img.url));
            }
            const svFallback =
              l.latitude != null && l.longitude != null
                ? getStreetViewProxyUrl({ lat: Number(l.latitude), lng: Number(l.longitude) })
                : null;
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
                  listingType: "open_house",
                  auctionDate: l.open_house_date
                    ? new Date(l.open_house_date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : undefined,
                  aiScore: l.ai_score,
                  views: l.views_count,
                  tags: l.tags || [],
                  isPreSale: l.is_pre_sale ?? false,
                  constructionStatus: l.construction_status ?? undefined,
                }}
              />
            );
          })}
          {listings.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <p className="text-sm font-medium">Open houses coming soon — check back shortly.</p>
              <p className="text-xs mt-1">New open house viewings are added regularly.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
