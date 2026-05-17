import { lazy, Suspense, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  useHomepageTypeCounts,
  useHomepageFeaturedListings,
  useHomepageAuctionListings,
  useHomepageOpenHouseListings,
} from "@/hooks/useHomepageListings";
import { Navbar } from "@/components/Navbar";
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

  const { data: typeCountsRaw } = useHomepageTypeCounts();
  const typeCounts = useMemo(() => typeCountsRaw ?? {}, [typeCountsRaw]);

  const {
    data: featuredListings = [],
    isLoading: featuredLoading,
    isError: featuredError,
  } = useHomepageFeaturedListings();

  const {
    data: auctionListings = [],
    isLoading: auctionsLoading,
  } = useHomepageAuctionListings();

  const { data: openHouseListings = [] } = useHomepageOpenHouseListings();

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />

      <Helmet>
        <title>mAI prop — Greek Real Estate | Buy, Rent &amp; Invest in Greece</title>
        <meta name="description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <link rel="canonical" href="https://maiprop.co/" />
        <meta property="og:title" content="mAI prop — Greek Real Estate | Buy, Rent &amp; Invest in Greece" />
        <meta property="og:description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <meta property="og:url" content="https://maiprop.co/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://maiprop.co/og-default.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "mAI prop",
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
