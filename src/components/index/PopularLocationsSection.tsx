import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "@/hooks/useInView";
import { fetchPublicApi } from "@/lib/publicApi";
import thessalonikiLandmark from "@/assets/thessaloniki-landmark.webp";

const FALLBACK = [
  { name: "Athens", listings: 24860, trend: "+1.2%", trendUp: true, image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80" },
  { name: "Thessaloniki", listings: 8240, trend: "+0.8%", trendUp: true, image: thessalonikiLandmark },
  { name: "Mykonos", listings: 1820, trend: "+2.3%", trendUp: true, image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=600&q=80" },
  { name: "Santorini", listings: 1240, trend: "+1.9%", trendUp: true, image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80" },
] as const;

type Location = { name: string; listings: number; trend: string; trendUp: boolean; image: string };
type LocationStats = Pick<Location, "name" | "listings" | "trend" | "trendUp">;
type PopularLocationsSectionProps = {
  enabled?: boolean;
};

function mergeLocationStats(stats: LocationStats[] | null): Location[] {
  const statsByCity = new Map((stats ?? []).map((city) => [city.name, city]));
  return FALLBACK.map((fallback) => ({ ...fallback, ...statsByCity.get(fallback.name) }));
}

export function PopularLocationsSection({ enabled = true }: PopularLocationsSectionProps) {
  const { ref, inView } = useInView();

  const { data, isError } = useQuery({
    queryKey: ["homepage-popular-locations", "v2"],
    enabled: enabled && inView,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const stats = await fetchPublicApi<LocationStats[]>("/api/public/homepage?section=popular-locations");
      return mergeLocationStats(stats);
    },
  });

  const locations: readonly Location[] = isError ? FALLBACK : (data ?? FALLBACK);

  return (
    <section className="py-8 sm:py-12 bg-secondary">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Popular Locations</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            Explore All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {locations.map((city, idx) => (
            <Link
              key={city.name}
              to={`/listings?city=${city.name}`}
              className={`reveal ${inView ? "in-view" : ""}`}
              style={{ transitionDelay: `${idx * 0.1}s` }}
            >
              <div className="relative rounded-lg overflow-hidden aspect-[4/3] group shadow-card hover:shadow-elevated transition-shadow duration-500">
                <img src={city.image} alt={city.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent group-hover:from-background/95 transition-all duration-500" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, transparent 60%)" }} />
                <div className="absolute bottom-3 left-3 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                  <div className="font-display font-bold text-base sm:text-lg text-foreground">{city.name}</div>
                  <div className="text-xs text-muted-foreground">{city.listings.toLocaleString()} listings</div>
                  <div className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${city.trendUp ? "text-brand-emerald" : "text-destructive"}`}>
                    {city.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {city.trend}
                  </div>
                </div>
                <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-primary/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300">
                  <ArrowRight className="w-4 h-4 text-primary-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
