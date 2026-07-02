import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { useInView } from "@/hooks/useInView";
import { getStreetViewProxyUrl } from "@/lib/config";
import { useTranslation } from "react-i18next";
import { homepageListingImages, type HomepageListing } from "@/lib/homepageListings";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

interface Props {
  listings: HomepageListing[];
  isLoading?: boolean;
}

const LOADING_CARD_KEYS = ["open-house-loading-1", "open-house-loading-2", "open-house-loading-3", "open-house-loading-4"];

const LoadingCard = () => (
  <div
    data-testid="open-house-loading-card"
    className="glass-card rounded-2xl border border-border overflow-hidden animate-pulse"
  >
    <div className="bg-muted h-52 w-full" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-muted rounded-md w-3/4" />
      <div className="h-3 bg-muted rounded-md w-1/2" />
      <div className="h-5 bg-muted rounded-md w-1/3" />
    </div>
  </div>
);

export function HomepageOpenHousesSection({ listings, isLoading = false }: Props) {
  const { ref, inView } = useInView();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const showLoadingCards = isLoading && listings.length === 0;

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">{isGreek ? "Ανοιχτές επισκέψεις" : "Open Houses"}</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">{isGreek ? "Προγραμματισμένες επισκέψεις σε ακίνητα" : "Scheduled viewings — no appointment needed"}</h2>
          </div>
          <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs" asChild>
            <Link to="/open-houses">
              {isGreek ? "Όλες οι ανοιχτές επισκέψεις" : "All Open Houses"} <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
        <div
          ref={ref}
          className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 reveal reveal-delay-1 ${inView ? "in-view" : ""}`}
        >
          {listings.slice(0, 4).map((l, index) => {
            const imgs = homepageListingImages(l);
            const svFallback =
              l.latitude != null && l.longitude != null
                ? getStreetViewProxyUrl({ lat: Number(l.latitude), lng: Number(l.longitude) })
                : null;
            if (!imgs.length && svFallback) imgs.push(svFallback);
            return (
              <PropertyCard
                key={l.id}
                imagePriority={index < 4}
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
                  listingType: "open_house",
                  openHouseTransactionType: l.open_house_transaction_type === "rent" ? "rent" : "sale",
                  auctionDate: l.open_house_date
                    ? new Date(l.open_house_date).toLocaleDateString(dateLocale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : undefined,
                  aiScore: l.ai_score ?? undefined,
                  views: l.views_count ?? undefined,
                  tags: l.tags || [],
                  isPreSale: l.listing_type === "new_build",
                  constructionStatus: l.construction_status ?? undefined,
                }}
              />
            );
          })}
          {showLoadingCards && LOADING_CARD_KEYS.map((key) => <LoadingCard key={key} />)}
          {!isLoading && listings.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <p className="text-sm font-medium">{isGreek ? "Οι ανοιχτές επισκέψεις έρχονται σύντομα." : "Open houses coming soon — check back shortly."}</p>
              <p className="text-xs mt-1">{isGreek ? "Νέες επισκέψεις προστίθενται τακτικά." : "New open house viewings are added regularly."}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
