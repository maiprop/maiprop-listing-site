import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
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
import { APP_ORIGIN } from "@/lib/config";

const Footer = lazy(() => import("@/components/Footer").then(m => ({ default: m.Footer })));
const OSSection = lazy(() => import("@/components/index/OSSection").then(m => ({ default: m.OSSection })));

type DeferredHomepageSectionOptions = {
  rootMargin?: string;
  idleDelayMs?: number;
};

function useDeferredHomepageSection({
  rootMargin = "900px 0px",
  idleDelayMs = 1_800,
}: DeferredHomepageSectionOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (enabled) return;

    let cancelled = false;
    let idleId: number | undefined;
    const activate = () => {
      if (!cancelled) setEnabled(true);
    };
    const scheduleIdle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 0));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const idleTimer = window.setTimeout(() => {
      idleId = scheduleIdle(activate, { timeout: 800 });
    }, idleDelayMs);

    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) {
      return () => {
        cancelled = true;
        window.clearTimeout(idleTimer);
        if (idleId !== undefined) cancelIdle(idleId);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          activate();
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    observer.observe(element);

    return () => {
      cancelled = true;
      window.clearTimeout(idleTimer);
      if (idleId !== undefined) cancelIdle(idleId);
      observer.disconnect();
    };
  }, [enabled, idleDelayMs, rootMargin]);

  return { ref, enabled };
}

export default function Index() {
  const queryClient = useQueryClient();
  const auctionsSection = useDeferredHomepageSection({ idleDelayMs: 1_800 });
  const openHousesSection = useDeferredHomepageSection({ idleDelayMs: 2_400 });
  const popularLocationsSection = useDeferredHomepageSection({ rootMargin: "800px 0px", idleDelayMs: 3_000 });
  const osSection = useDeferredHomepageSection({ rootMargin: "600px 0px", idleDelayMs: 5_000 });

  const { pulling, refreshing, progress } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["homepage-featured"] }),
        queryClient.invalidateQueries({ queryKey: ["auction-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["homepage-open-houses"] }),
      ]);
    },
  });

  const {
    data: featuredListings = [],
    isLoading: featuredLoading,
    isError: featuredError,
    refetch: refetchFeatured,
  } = useHomepageFeaturedListings();

  const {
    data: auctionListings = [],
    isLoading: auctionsLoading,
    isError: auctionsError,
    refetch: refetchAuctions,
  } = useHomepageAuctionListings({ enabled: auctionsSection.enabled });

  const {
    data: openHouseListings = [],
    isLoading: openHousesLoading,
    isError: openHousesError,
    refetch: refetchOpenHouses,
  } = useHomepageOpenHouseListings({ enabled: openHousesSection.enabled });

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />

      <Helmet>
        <title>mAI prop — Greek Real Estate | Buy, Rent &amp; Invest in Greece</title>
        <meta name="description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <link rel="canonical" href={`${APP_ORIGIN}/`} />
        <link rel="preload" href="/hero-poster.jpg" as="image" />
        <meta property="og:title" content="mAI prop — Greek Real Estate | Buy, Rent &amp; Invest in Greece" />
        <meta property="og:description" content="Browse verified Greek property listings — apartments, villas, land &amp; commercial. AI-powered search, auction alerts, and instant viewings." />
        <meta property="og:url" content={`${APP_ORIGIN}/`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${APP_ORIGIN}/og-image.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "mAI prop",
          "url": APP_ORIGIN,
          "description": "Greek real estate marketplace — buy, sell, rent and invest",
          "potentialAction": {
            "@type": "SearchAction",
            "target": `${APP_ORIGIN}/listings?q={search_term_string}`,
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
        <FeaturedPropertiesSection
          listings={featuredListings}
          isLoading={featuredLoading}
          isError={featuredError}
          onRetry={() => void refetchFeatured()}
        />
        <BrowseByTypeSection />
        <div ref={auctionsSection.ref}>
          <HomepageAuctionsSection
            listings={auctionListings}
            isLoading={!auctionsSection.enabled || auctionsLoading}
            isError={auctionsSection.enabled && auctionsError}
            onRetry={() => void refetchAuctions()}
          />
        </div>
        <div ref={openHousesSection.ref}>
          <HomepageOpenHousesSection
            listings={openHouseListings}
            isLoading={!openHousesSection.enabled || openHousesLoading}
            isError={openHousesSection.enabled && openHousesError}
            onRetry={() => void refetchOpenHouses()}
          />
        </div>
        <QuickSaleCTASection />
        <div ref={popularLocationsSection.ref}>
          <PopularLocationsSection enabled={popularLocationsSection.enabled} />
        </div>
        <ProfessionalsCTASection />
        <div ref={osSection.ref}>
          {osSection.enabled && (
            <Suspense fallback={null}>
              <OSSection />
            </Suspense>
          )}
        </div>

        <Suspense fallback={null}>
          <Footer />
        </Suspense>
        <div className="h-20 lg:hidden" />
      </main>
    </div>
  );
}
