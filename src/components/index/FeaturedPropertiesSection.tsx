import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/PropertyCardSkeleton";
import { useInView } from "@/hooks/useInView";
import type { HomepageListing } from "@/lib/homepageListings";
import { homepageListingToCard } from "@/lib/homepageListingToCard";
import { useTranslation } from "react-i18next";

interface Props {
  listings: HomepageListing[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => unknown;
}

export function FeaturedPropertiesSection({ listings, isLoading, isError, onRetry }: Props) {
  const { ref, inView } = useInView();
  const { t } = useTranslation();
  const visibleListings = listings.slice(0, 4);

  if (!isLoading && !isError && visibleListings.length === 0) {
    return null;
  }

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">{t("home.sections.featuredProperties")}</h2>
          <Button variant="outline" size="sm" className="border-border text-xs" asChild>
            <Link to="/listings">{t("home.sections.viewAll")}</Link>
          </Button>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)
            : isError
            ? (
              <div role="alert" className="col-span-4 py-8 text-center text-sm text-muted-foreground">
                <p>{t("home.catalogue.featuredError")}</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                  {t("common.retry")}
                </Button>
              </div>
            )
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
