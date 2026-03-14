import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  BarChart2,
  MapPin,
  TrendingUp,
  Building2,
  Euro,
  Loader2,
  Home,
} from "lucide-react";

type CityStats = {
  city: string;
  count: number;
  avgPrice: number;
  avgPricePerSqm: number;
  minPrice: number;
  maxPrice: number;
};

type TypeStats = {
  property_type: string;
  count: number;
  avg_price: number;
};

function useMarketStats() {
  return useQuery({
    queryKey: ["market-intelligence"],
    queryFn: async () => {
      const { data: listings, error } = await supabase
        .from("listings")
        .select("id, city, price, sqm, property_type, listing_type")
        .eq("status", "active")
        .in("listing_type", ["sale", "rent"]);
      if (error) throw error;

      const saleListings = (listings || []).filter((l: any) => l.listing_type === "sale");
      const rentListings = (listings || []).filter((l: any) => l.listing_type === "rent");

      const byCity: Record<string, { prices: number[]; pricesPerSqm: number[] }> = {};
      for (const l of saleListings) {
        const city = l.city || "Other";
        if (!byCity[city]) byCity[city] = { prices: [], pricesPerSqm: [] };
        byCity[city].prices.push(Number(l.price));
        if (l.sqm && l.price) byCity[city].pricesPerSqm.push(Number(l.price) / Number(l.sqm));
      }

      const cityStats: CityStats[] = Object.entries(byCity)
        .map(([city, d]) => {
          const prices = d.prices.filter(Boolean);
          const pricesPerSqm = d.pricesPerSqm.filter(Boolean);
          return {
            city,
            count: prices.length,
            avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
            avgPricePerSqm: pricesPerSqm.length ? pricesPerSqm.reduce((a, b) => a + b, 0) / pricesPerSqm.length : 0,
            minPrice: prices.length ? Math.min(...prices) : 0,
            maxPrice: prices.length ? Math.max(...prices) : 0,
          };
        })
        .filter((c) => c.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      const byType: Record<string, number[]> = {};
      for (const l of saleListings) {
        const t = l.property_type || "other";
        if (!byType[t]) byType[t] = [];
        byType[t].push(Number(l.price));
      }

      const typeStats: TypeStats[] = Object.entries(byType)
        .map(([property_type, prices]) => ({
          property_type,
          count: prices.length,
          avg_price: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const avgRent = rentListings.length
        ? rentListings.reduce((s, l) => s + Number(l.price), 0) / rentListings.length
        : 0;

      return {
        totalSale: saleListings.length,
        totalRent: rentListings.length,
        cityStats,
        typeStats,
        avgRent: Math.round(avgRent),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function MarketIntelligence() {
  const { data, isLoading, error } = useMarketStats();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="border-b border-border bg-card/50 py-12">
          <div className="container max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
              <BarChart2 className="w-3.5 h-3.5" /> Market Intelligence
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-black mb-2">
              Greek Property Market Overview
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Aggregate stats from active listings. Data refreshes every 5 minutes.
            </p>
          </div>
        </div>

        <div className="container max-w-4xl py-10">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-muted-foreground">
              Could not load market data. Try again later.
            </div>
          ) : data ? (
            <div className="space-y-8">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Home className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">For Sale</span>
                  </div>
                  <p className="font-display font-black text-2xl text-primary">{data.totalSale}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Active listings</p>
                </div>
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">For Rent</span>
                  </div>
                  <p className="font-display font-black text-2xl text-primary">{data.totalRent}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Active listings</p>
                </div>
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Euro className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Avg. Rent</span>
                  </div>
                  <p className="font-display font-black text-2xl text-primary">
                    €{data.avgRent.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">/ month</p>
                </div>
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Cities</span>
                  </div>
                  <p className="font-display font-black text-2xl text-primary">{data.cityStats.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">With data</p>
                </div>
              </div>

              {/* By city */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <h2 className="font-display font-bold text-base">Average Sale Price by City</h2>
                </div>
                <div className="divide-y divide-border">
                  {data.cityStats.map((c) => (
                    <div
                      key={c.city}
                      className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-sm">{c.city}</p>
                        <p className="text-xs text-muted-foreground">{c.count} listings</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-foreground">
                          €{Math.round(c.avgPrice).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          €{Math.round(c.avgPricePerSqm).toLocaleString()}/m²
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* By type */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="font-display font-bold text-base">Average Price by Property Type</h2>
                </div>
                <div className="divide-y divide-border">
                  {data.typeStats.map((t) => (
                    <div
                      key={t.property_type}
                      className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-sm capitalize">{t.property_type}</p>
                        <p className="text-xs text-muted-foreground">{t.count} listings</p>
                      </div>
                      <p className="font-display font-bold text-foreground">
                        €{Math.round(t.avg_price).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Data derived from active listings on maiProp. For professional analysis, use mAI Prop OS.
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <Footer />
    </div>
  );
}
