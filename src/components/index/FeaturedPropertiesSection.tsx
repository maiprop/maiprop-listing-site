import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/PropertyCardSkeleton";
import { useInView } from "@/hooks/useInView";
import type { HomepageListing } from "@/lib/homepageListings";
import { homepageListingToCard } from "@/lib/homepageListingToCard";

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
                return (
                  <PropertyCard
                    key={l.id}
                    imagePriority={index < 4}
                    deferOffscreenRendering={false}
                    property={homepageListingToCard(l)}
                  />
                );
              })}
        </div>
      </div>
    </section>
  );
}
