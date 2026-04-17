import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "@/hooks/useInView";
import { supabase } from "@/integrations/supabase/client";
import thessalonikiLandmark from "@/assets/thessaloniki-landmark.webp";

const FALLBACK = [
  { name: "Athens", listings: 24860, trend: "+1.2%", trendUp: true, image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80" },
  { name: "Thessaloniki", listings: 8240, trend: "+0.8%", trendUp: true, image: thessalonikiLandmark },
  { name: "Mykonos", listings: 1820, trend: "+2.3%", trendUp: true, image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=600&q=80" },
  { name: "Santorini", listings: 1240, trend: "+1.9%", trendUp: true, image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80" },
] as const;

type Location = { name: string; listings: number; trend: string; trendUp: boolean; image: string };

export function PopularLocationsSection() {
  const { ref, inView } = useInView();

  const { data, isError } = useQuery({
    queryKey: ["homepage-popular-locations", "v2"],
    enabled: inView,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const cities = FALLBACK.map((c) => c.name);

      const { data: cityRows, error: cityCountError } = await supabase
        .from("listings").select("city").eq("status", "active").in("city", cities);
      if (cityCountError) throw cityCountError;

      const listingsByCity: Record<string, number> = Object.fromEntries(cities.map((c) => [c, 0]));
      (cityRows ?? []).forEach((row) => {
        const city = (row.city as string | null)?.trim();
        if (city && city in listingsByCity) listingsByCity[city]++;
      });

      const now = new Date();
      const currStart = new Date(now); currStart.setDate(currStart.getDate() - 30);
      const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 60);

      const { data: priceData, error } = await supabase
        .from("listings").select("city, price_per_sqm, created_at")
        .eq("status", "active").eq("listing_type", "sale").in("city", cities)
        .not("price_per_sqm", "is", null)
        .gte("created_at", prevStart.toISOString()).lt("created_at", now.toISOString());
      if (error) throw error;

      const currentPrices: Record<string, number[]> = {};
      const prevPrices: Record<string, number[]> = {};
      (priceData ?? []).forEach((row: { city?: string; price_per_sqm?: number | string | null; created_at?: string }) => {
        const city = (row.city as string | undefined)?.trim();
        if (!city) return;
        const p = row.price_per_sqm == null ? NaN : Number(row.price_per_sqm);
        if (!Number.isFinite(p)) return;
        const createdAt = row.created_at ? new Date(row.created_at) : null;
        if (!createdAt) return;
        if (createdAt >= currStart) {
          currentPrices[city] = currentPrices[city] ?? []; currentPrices[city].push(p);
        } else {
          prevPrices[city] = prevPrices[city] ?? []; prevPrices[city].push(p);
        }
      });

      const fallbackByCity = Object.fromEntries(FALLBACK.map((c) => [c.name, c])) as Record<string, Location>;

      return cities.map((city) => {
        const fallback = fallbackByCity[city];
        const prev = prevPrices[city] ?? [];
        const curr = currentPrices[city] ?? [];
        let trend = fallback.trend, trendUp = fallback.trendUp;
        if (prev.length >= 2 && curr.length >= 2) {
          const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
          const currAvg = curr.reduce((a, b) => a + b, 0) / curr.length;
          if (Number.isFinite(prevAvg) && prevAvg > 0 && Number.isFinite(currAvg)) {
            const pct = ((currAvg - prevAvg) / prevAvg) * 100;
            trendUp = pct >= 0;
            const abs = Math.abs(Math.round(pct * 10) / 10);
            trend = `${trendUp ? "+" : "-"}${abs.toFixed(1)}%`;
          }
        }
        return { ...fallback, listings: listingsByCity[city] ?? fallback.listings, trend, trendUp };
      });
    },
  });

  const locations: readonly Location[] = isError ? FALLBACK : (data ?? FALLBACK);

  return (
    <section className="py-10 sm:py-16 bg-secondary">
      <div ref={ref} className="container">
        <div className={`flex items-center justify-between mb-6 sm:mb-8 reveal ${inView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Popular Locations</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            Explore All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {locations.map((city, idx) => (
            <Link
              key={city.name}
              to={`/listings?city=${city.name}`}
              className={`reveal ${inView ? "in-view" : ""}`}
              style={{ transitionDelay: `${idx * 0.1}s` }}
            >
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] group shadow-card hover:shadow-elevated transition-shadow duration-500">
                <img src={city.image} alt={city.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent group-hover:from-background/95 transition-all duration-500" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, transparent 60%)" }} />
                <div className="absolute bottom-4 left-4 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                  <div className="font-display font-bold text-lg text-foreground">{city.name}</div>
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
