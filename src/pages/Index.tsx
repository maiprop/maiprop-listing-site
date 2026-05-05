import { lazy, Suspense, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { HeroSection } from "@/components/index/HeroSection";
import { BrowseByTypeSection } from "@/components/index/BrowseByTypeSection";
import { FeaturedPropertiesSection } from "@/components/index/FeaturedPropertiesSection";
import { HomepageAuctionsSection } from "@/components/index/HomepageAuctionsSection";
import { HomepageOpenHousesSection } from "@/components/index/HomepageOpenHousesSection";
import { QuickSaleCTASection } from "@/components/index/QuickSaleCTASection";
import { PopularLocationsSection } from "@/components/index/PopularLocationsSection";
import { ProfessionalsCTASection } from "@/components/index/ProfessionalsCTASection";
import { OSSection } from "@/components/index/OSSection";

const Footer = lazy(() => import("@/components/Footer").then(m => ({ default: m.Footer })));

const featuredSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags";

const auctionSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags, auction_date, auction_starting_bid, latitude, longitude";

const queryTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), ms))]);

export default function Index() {
  const queryClient = useQueryClient();

  const { pulling, refreshing, progress } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["homepage-featured"] }),
        queryClient.invalidateQueries({ queryKey: ["homepage-auctions"] }),
        queryClient.invalidateQueries({ queryKey: ["homepage-open-houses"] }),
      ]);
    },
  });

  // Listing counts for Browse by Type section
  const { data: typeCountsRaw } = useQuery({
    queryKey: ["homepage-type-counts"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("listings").select("property_type").eq("status", "active");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row) => {
        const k = row.property_type as string;
        counts[k] = (counts[k] || 0) + 1;
      });
      return counts;
    },
  });
  const typeCounts = useMemo(() => typeCountsRaw ?? {}, [typeCountsRaw]);

  const today = new Date().toISOString().split("T")[0];

  const {
    data: featuredListings = [],
    isLoading: featuredLoading,
    isError: featuredError,
  } = useQuery({
    queryKey: ["homepage-featured"],
    queryFn: async () => {
      const run = async () => {
        const { data, error } = await supabase
          .from("listings")
          .select(`${featuredSelect}, listing_images(url, sort_order)`)
          .eq("status", "active").eq("listing_type", "sale")
          .order("created_at", { ascending: false }).limit(4);
        if (error) {
          const fallback = await supabase.from("listings").select(featuredSelect)
            .eq("status", "active").eq("listing_type", "sale")
            .order("created_at", { ascending: false }).limit(4);
          if (fallback.error) throw fallback.error;
          return fallback.data || [];
        }
        return data || [];
      };
      return queryTimeout(run(), 12_000);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const {
    data: auctionListings = [],
    isLoading: auctionsLoading,
  } = useQuery({
    queryKey: ["homepage-auctions"],
    queryFn: async () => {
      const run = async () => {
        const { data, error } = await supabase
          .from("listings")
          .select(`${auctionSelect}, listing_images(url, sort_order)`)
          .eq("status", "active").eq("listing_type", "auction")
          .or(`auction_date.gte.${today},auction_date.is.null`)
          .order("auction_date", { ascending: true, nullsFirst: false }).limit(6);
        if (error) {
          const fallback = await supabase.from("listings").select(auctionSelect)
            .eq("status", "active").eq("listing_type", "auction")
            .or(`auction_date.gte.${today},auction_date.is.null`)
            .order("auction_date", { ascending: true, nullsFirst: false }).limit(6);
          if (fallback.error) throw fallback.error;
          const list = fallback.data || [];
          return list.sort((a, b) => {
            const aHasImg = !!a.cover_image_url;
            const bHasImg = !!b.cover_image_url;
            return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
          });
        }
        return (data || []).sort((a, b) => {
          const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
          const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
          return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
        });
      };
      return queryTimeout(run(), 12_000);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: openHouseListings = [] } = useQuery({
    queryKey: ["homepage-open-houses"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags, open_house_date, latitude, longitude, listing_images(url, sort_order)",
        )
        .eq("status", "active").eq("listing_type", "open_house")
        .gte("open_house_date", now).order("open_house_date", { ascending: true }).limit(6);
      if (error) return [];
      return (data || []).sort((a, b) => {
        const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
        const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
        return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
      });
    },
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />

      <Helmet>
        <title>maiProp — Greek Real Estate | Buy, Rent &amp; Invest in Greece</title>
        <meta name="description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <link rel="canonical" href="https://maiprop.co/" />
        <meta property="og:title" content="maiProp — Greek Real Estate | Buy, Rent &amp; Invest in Greece" />
        <meta property="og:description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <meta property="og:url" content="https://maiprop.co/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://maiprop.co/og-default.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "maiProp",
          "url": "https://maiprop.co",
          "description": "Greek real estate marketplace — buy, sell, rent and invest",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://maiprop.co/listings?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        })}</script>
      </Helmet>

      {/* Pull-to-refresh indicator — mobile only */}
      {(pulling || refreshing) && (
        <div className="lg:hidden fixed top-14 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border shadow-elevated mt-2 transition-all">
            <div
              className={`w-4 h-4 rounded-full border-2 border-primary transition-all ${refreshing ? "animate-spin border-t-transparent" : ""}`}
              style={!refreshing ? { background: `conic-gradient(hsl(var(--primary)) ${progress * 360}deg, transparent 0deg)` } : undefined}
            />
            <span className="text-xs font-medium text-foreground">
              {refreshing ? "Refreshing…" : progress >= 1 ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      <main id="main-content">
        <HeroSection />
        <BrowseByTypeSection typeCounts={typeCounts} />
        <FeaturedPropertiesSection listings={featuredListings} isLoading={featuredLoading} isError={featuredError} />
        <HomepageAuctionsSection listings={auctionListings} isLoading={auctionsLoading} />
        <HomepageOpenHousesSection listings={openHouseListings} />
        <QuickSaleCTASection />
        <PopularLocationsSection />
        <ProfessionalsCTASection />
        <OSSection />

        <Suspense fallback={null}>
          <Footer />
        </Suspense>
        <div className="h-20 lg:hidden" />
      </main>
    </div>
  );
}
