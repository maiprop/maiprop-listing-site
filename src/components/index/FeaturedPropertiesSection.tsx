import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/PropertyCardSkeleton";
import { useInView } from "@/hooks/useInView";
import { homepageListingImages, type HomepageListing } from "@/lib/homepageListings";
import { getNewBuildCardSummary } from "@/lib/newBuildCardSummary";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

interface Props {
  listings: HomepageListing[];
  isLoading: boolean;
  isError: boolean;
}

export function FeaturedPropertiesSection({ listings, isLoading, isError }: Props) {
  const { ref, inView } = useInView();
  const visibleListings = listings.slice(0, 4);

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Spotlight Properties</h2>
          <Button variant="outline" size="sm" className="border-border text-xs" asChild>
            <Link to="/listings">View All</Link>
          </Button>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)
            : isError
            ? <p className="col-span-4 py-8 text-center text-sm text-muted-foreground">Could not load Spotlight listings.</p>
            : visibleListings.map((l, index) => {
                const imgs = homepageListingImages(l);
                const isProjectNewBuild = l.listing_type === "new_build" && Boolean(l.project_id);
                const listingType = l.listing_type === "new_build" && !isProjectNewBuild
                  ? "sale"
                  : l.listing_type ?? "sale";
                const newBuildSummary = getNewBuildCardSummary(l);
                return (
                  <PropertyCard
                    key={l.id}
                    imagePriority={index < 4}
                    deferOffscreenRendering={false}
                    property={{
                      id: l.id,
                      title: l.title,
                      address: l.address || l.city,
                      city: l.city,
                      price: Number(l.price),
                      pricePerSqm: calculatePricePerSqm({
                        price: l.price,
                        sqm: l.sqm,
                        storedPricePerSqm: l.price_per_sqm,
                      }) ?? undefined,
                      bedrooms: l.bedrooms ?? undefined,
                      bathrooms: l.bathrooms ?? undefined,
                      sqm: Number(l.sqm),
                      floor: l.floor ?? undefined,
                      totalFloors: l.total_floors ?? undefined,
                      yearBuilt: l.year_built ?? undefined,
                      energyClass: l.energy_class ?? undefined,
                      images: imgs,
                      type: l.property_type ?? "apartment",
                      listingType,
                      aiScore: l.ai_score ?? undefined,
                      views: l.views_count ?? undefined,
                      tags: l.tags || [],
                      isPreSale: isProjectNewBuild,
                      constructionStatus: l.construction_status ?? undefined,
                      ...newBuildSummary,
                    }}
                  />
                );
              })}
        </div>
      </div>
    </section>
  );
}
