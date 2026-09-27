import { useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { useModal } from "@/hooks/useModal";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  Loader2,
  AlertCircle, Info, LayoutGrid, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import ViewingDialog from "@/components/ViewingDialog";
import { useListing, useOwnerProStatus, useTrackListingView } from "@/hooks/useListings";
import type { ListingWithJoins } from "@/hooks/useListings";
import { dedupeSimilarListings, useSimilarListings } from "@/hooks/useSimilarListings";
import { useIsFavorited, useToggleFavorite } from "@/hooks/useFavorites";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";
import { PropertyAuctionSection } from "@/components/property/PropertyAuctionSection";
import { toast } from "sonner";
import PropertyValuation from "@/components/PropertyValuation";
const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"));
const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"));
import { buildPropertyFeatureGroups, buildDetailGroups } from "@/lib/propertyFeatures";
const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { APP_ORIGIN, getStreetViewProxyUrl } from "@/lib/config";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import { dbListingToCard } from "@/lib/listingUtils";
import type { DbListingCardRow } from "@/lib/domainContracts";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import PropertyGallery from "@/components/property/PropertyGallery";
import PropertyFeatureList from "@/components/property/PropertyFeatureList";
import PropertyOwnerCard from "@/components/property/PropertyOwnerCard";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { PropertyScoresSection } from "@/components/property/PropertyScoresSection";
import { PropertyTitleSection } from "@/components/property/PropertyTitleSection";
import { PropertyDetailsAndEnergy } from "@/components/property/PropertyDetailsAndEnergy";
import { PropertyDescriptionSection } from "@/components/property/PropertyDescriptionSection";
import { PropertyValuationLockedCard } from "@/components/property/PropertyValuationLockedCard";
import { DeferredDetailPanel } from "@/components/DeferredDetailPanel";
import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";
import { shouldUseNewBuildRoute } from "@/lib/listingRoutes";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import { useListingReport } from "@/hooks/useListingReport";

const safeExternalUrl = (url: string | null | undefined): string | null =>
  url && /^https?:\/\//i.test(url) ? url : null;

// ─── Main component ──────────────────────────────────────────────────────────
const PropertyDetail = () => { // skipcq: JS-R1005 - Detail route coordinates listing data, media, modals, and gated owner actions in one page shell.
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { state } = useLocation() as {
    state?: { listing?: ListingWithJoins; auction?: ListingWithJoins };
  };
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();

  const routeListing = state?.listing ?? state?.auction;
  const listingFromState = routeListing?.id === id ? routeListing : undefined;
  const {
    data: dbListing,
    isLoading,
    isFetching,
    isPlaceholderData,
    isError,
  } = useListing(id || "", {
    initialData: listingFromState,
    publicScope: true,
    publicationId: listingFromState?.publicationId,
  });
  const { mutate: trackViewMutate } = useTrackListingView();
  const ownerId = (dbListing as ListingWithJoins | null)?.owner_id;
  const embeddedOwnerIsPro = Boolean((dbListing as ListingWithJoins | null)?.ownerIsPro);
  const { data: ownerProStatus = false } = useOwnerProStatus(dbListing?.id, ownerId, {
    enabled: !embeddedOwnerIsPro,
    initialData: embeddedOwnerIsPro ? true : undefined,
  });
  const ownerIsPro = embeddedOwnerIsPro || ownerProStatus;
  // Video viewing: free for buyers, Pro required for all other roles
  const isBuyer = getParticipantTypeFromProfile(profile) === "buyer";
  const canVideoView = isPro || isBuyer;
  const { data: similarFromDb = [] } = useSimilarListings({
    excludeId: id ?? dbListing?.id,
    city: dbListing?.city,
    propertyType: dbListing?.property_type,
    listingType: dbListing?.listing_type,
    price: dbListing ? Number(dbListing.price) : undefined,
    limit: 8,
    publicationId: dbListing?.publicationId,
  });

  // Track view once per session; sessionStorage in useTrackListingView prevents double-counting on refetch
  useEffect(() => {
    if (id && dbListing) trackViewMutate(id);
  }, [id, dbListing, trackViewMutate]);

  // Redirect: canonical routes per listing type
  // - new build  → /new-build/:id
  // - auction    → /auction/:id  (AuctionRouter renders PropertyDetail there too,
  //                so UI is identical; this just keeps the URL canonical)
  useEffect(() => { // skipcq: JS-R1005 - Canonical route redirect checks new-build and auction variants together.
    if (!dbListing) return;
    const _db = dbListing as ListingWithJoins;
    if (shouldUseNewBuildRoute(_db)) {
      navigate(`/new-build/${id}`, {
        replace: true,
        state: { listing: _db },
      });
      return;
    }
    if (_db.listing_type === "auction" && window.location.pathname.startsWith("/property/")) {
      navigate(`/auction/${id}`, {
        replace: true,
        state: { auction: _db, listing: _db },
      });
    }
  }, [dbListing, id, navigate]);

  const modal = useModal<"viewing" | "auctionAlert">();

  // AI Market Insights — quota is checked on load, and provider work only runs after user action.
  const {
    aiInsightsData,
    aiInsightsLoading,
    aiInsightsLoaded,
    aiInsightsQuota,
    aiInsightsQuotaLoading,
    loadAiInsights,
  } = usePropertyAIInsights(
    dbListing as ListingWithJoins | null,
    user,
    id,
    isPro,
  );

  const { data: isFavorited = false } = useIsFavorited(id ?? "");
  const toggleFav = useToggleFavorite();
  const startConversation = useStartConversation();
  const report = useListingReport({
    messages: {
      signIn: t("property.signInToReport"),
      error: t("property.errorReport"),
      success: t("property.reportSubmitted"),
    },
    onSignInRequired: () => navigate("/login"),
  });


  const handleFavorite = () => {
    if (!user) {toast.error(t("property.signInToSave"));return;}
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };

  const handleContact = async () => { // skipcq: JS-R1005 - Contact flow validates auth, owner state, and conversation creation together.
    if (!user) {toast.error(t("property.signInToContact"));navigate("/login");return;}
    const ownerId = dbListing ?
    (dbListing as ListingWithJoins).profiles?.user_id ?? (dbListing as ListingWithJoins).owner_id :
    undefined;
    if (!ownerId) {toast.info(t("property.contactUnavailable"));return;}
    if (ownerId === user.id) {toast.info(t("property.ownListingContact"));return;}
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch (err: unknown) {
      toast.error(getPlanLimitErrorMessage(err) ?? t("property.errorStartConversation"));
    }
  };

  if (isLoading && !dbListing) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main id="main-content" className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </div>);

  }

  if (!dbListing) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main id="main-content" className="container pt-32 text-center">
          <p className="text-muted-foreground">
            {isError ? t("property.errorLoad") : t("property.notAvailable")}
          </p>
          <Button className="mt-4" onClick={() => navigate("/listings")}>{t("property.backToListings")}</Button>
        </main>
        <Footer />
      </div>);

  }

  // Single cast — all fields are typed via ListingWithJoins
  const db = dbListing as ListingWithJoins;
  const title = db.title;
  const city = db.city;
  // Use DB address; fall back to city
  const address = db.address ?? city;
  const price = Number(db.price);
  const sqm = Number(db.sqm);
  const bedrooms = db.bedrooms;
  const bathrooms = db.bathrooms;
  const listingType = db.listing_type;
  const propertyType = db.property_type;
  const description = db.description;
  const ownerProfile = db.profiles
    ? {
        display_name: db.profiles.display_name,
        avatar_url: db.profiles.avatar_url,
        verified: db.profiles.verified ?? undefined,
      }
    : null;
  const ownerParticipantType = db.ownerParticipantType ?? null;
  const pricePerSqm = calculatePricePerSqm({
    price,
    sqm,
    storedPricePerSqm: db.price_per_sqm,
  });
  const energyClass = db.energy_class;
  const isLandType = propertyType === "land";
  const isAuction = listingType === "auction";
  const hasRouteAuctionFallback = isAuction && Boolean(listingFromState);
  const verificationFailed = hasRouteAuctionFallback && isError;
  const verificationPending = hasRouteAuctionFallback && !verificationFailed && Boolean(
    isPlaceholderData || isFetching,
  );
  const auctionWebsiteUrl = isAuction ? safeExternalUrl(db.website_url) : null;

  // Extract ownership info from tags (for auction listings)
  const tags: string[] = db.tags ?? [];
  const ownershipTag = tags.find((t) => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
  const ownershipStatus = ownershipTag ? ownershipTag.replace("ownership:", "") : null;
  const ownershipPctTag = tags.find((t) => t.startsWith("ownership_pct:"));
  const ownershipPct = ownershipPctTag ? Number(ownershipPctTag.replace("ownership_pct:", "")) : null;

  const OWNERSHIP_LABEL: Record<string, {label: string;cls: string;}> = {
    full: {
      label: t("property.ownership.full"),
      cls: "bg-gradient-primary text-white border border-white/20 shadow-[0_0_0_1px_hsl(var(--brand-indigo)/0.35)]",
    },
    partial: {
      label: t("property.ownership.partial"),
      cls: "bg-brand-purple/15 text-brand-purple border border-brand-purple/30",
    },
    common: {
      label: t("property.ownership.common"),
      cls: "bg-accent/15 text-accent border border-accent/25",
    },
    none: {
      label: t("property.ownership.none"),
      cls: "bg-destructive/15 text-destructive border border-destructive/30",
    },
  };
  const ownershipDisplay = ownershipStatus ? OWNERSHIP_LABEL[ownershipStatus] ?? { label: ownershipStatus, cls: "bg-muted text-muted-foreground border-border" } : null;

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {await navigator.share({ title, url });} catch (_err: unknown) { /* share cancelled or not supported */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success(t("property.linkCopied"));
    }
  };

  const dbImages = [
    ...(db.cover_image_url ? [db.cover_image_url] : []),
    ...(db.listing_images?.map((img) => img.url).filter(Boolean) ?? []),
  ];


  // Street View fallback via proxy (key never in client URLs)
  const streetViewFallback = (() => { // skipcq: JS-R1005 - Street View fallback supports coordinate and address lookup paths.
    if (db.latitude != null && db.longitude != null) {
      return getStreetViewProxyUrl({ lat: Number(db.latitude), lng: Number(db.longitude) });
    }
    if (db.address || db.city) {
      return getStreetViewProxyUrl({ location: `${db.address ?? ""} ${db.city ?? ""}`.trim() });
    }
    return null;
  })();

  // Final fallback chain: DB images → Street View → nothing
  const images = dbImages.length ?
  dbImages :
  streetViewFallback ?
  [streetViewFallback] :
  [];

  // ── Feature groups ──────────────────────────────────────────────────────────
  const { internalFeatures, externalFeatures, constructionFeatures, suitabilityFeatures } =
    buildPropertyFeatureGroups(db);

  const similarListings = dedupeSimilarListings(similarFromDb, dbListing ?? null).filter(l => l.id !== id).slice(0, 6);

  const detailGroups = buildDetailGroups(db, price, sqm, pricePerSqm, isLandType);


  const ogImage = images[0] ?? `${APP_ORIGIN}/og-image.png`;
  const ogDescription = description
    ? description.slice(0, 160)
    : `${propertyType?.replace(/_/g, " ")} in ${city} — ${sqm} m² · €${price.toLocaleString()}`;
  const canonicalUrl = `${APP_ORIGIN}/${isAuction ? "auction" : "property"}/${db.id}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: title,
    description: ogDescription,
    url: canonicalUrl,
    image: ogImage,
    offers: {
      "@type": "Offer",
      price: price,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: city,
      addressCountry: "GR",
      ...(db.postal_code ? { postalCode: db.postal_code } : {}),
    },
    numberOfRooms: bedrooms ?? undefined,
    floorSize: sqm ? { "@type": "QuantitativeValue", value: sqm, unitCode: "MTK" } : undefined,
  };

  return (
    <div className="min-h-screen bg-background pb-mobile-nav-room lg:pb-0">
      <Helmet>
        <title>{`${title} — mAI prop`}</title>
        <meta name="description" content={ogDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={`${title} — mAI prop`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — mAI prop`} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <Navbar />

      <main id="main-content" className="pt-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="container min-w-0 overflow-hidden py-2 sm:py-3">
          <ol className="m-0 flex min-w-0 max-w-full list-none items-center gap-1 overflow-hidden p-0 text-xs text-muted-foreground sm:gap-1.5">
            <li className="shrink-0"><Link to="/" className="transition-colors hover:text-foreground">{t("property.breadcrumbHome")}</Link></li>
            <li aria-hidden="true" className="shrink-0"><ChevronRight className="h-3 w-3" /></li>
            <li className="shrink-0">
              {isAuction ?
              <Link to="/auctions" className="transition-colors hover:text-foreground">{t("property.breadcrumbAuctions")}</Link> :
              <Link to="/listings" className="transition-colors hover:text-foreground">{t("property.breadcrumbListings")}</Link>
              }
            </li>
            <li aria-hidden="true" className="shrink-0"><ChevronRight className="h-3 w-3" /></li>
            <li className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground" aria-current="page">{title}</span></li>
          </ol>
        </nav>

        <div className="container pb-10">
          {verificationPending && (
            <div
              role="status"
              data-testid="auction-verification-status"
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p>{t("auctions.detail.verifyingCached", {
                defaultValue: "Showing cached auction details while we verify the latest information.",
              })}</p>
            </div>
          )}
          {verificationFailed && (
            <div
              role="alert"
              data-testid="auction-verification-status"
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p>{t("auctions.detail.refreshFailed", {
                defaultValue: "Live auction details could not be refreshed. The information shown may be outdated.",
              })}</p>
            </div>
          )}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-8">

            {/* ──── LEFT COLUMN ──── */}
            <div className="min-w-0 space-y-5">

              {/* ── Gallery ── */}
              <PropertyGallery
                images={images}
                listingType={listingType}
                isFavorited={isFavorited}
                onFavorite={handleFavorite}
                onShare={handleShare}
                viewsCount={db.views_count || 0}
                title={title}
              />

              {/* ── Title + Price hero ── */}
              <PropertyTitleSection
                db={db}
                isAuction={isAuction}
              />

              {/* ── AI Market Insights — dynamic from property-valuation ── */}
              <PropertyAIInsightsSection
                user={user}
                isPro={isPro}
                loading={aiInsightsLoading}
                data={aiInsightsData}
                quota={aiInsightsQuota}
                quotaLoading={aiInsightsQuotaLoading}
                hasRequested={aiInsightsLoaded}
                listingType={listingType}
                onLoad={loadAiInsights}
              />

              {/* ── Description (hidden for auctions) ── */}
              {!isAuction && <PropertyDescriptionSection description={description} />}

              {/* ── Auction Details (shown first for auction listings) ── */}
              {isAuction && (
                <PropertyAuctionSection
                  listingId={db.id}
                  auctionDate={db.auction_date}
                  auctionStartingBid={Number(db.auction_starting_bid) || 0}
                  ownershipDisplay={ownershipDisplay}
                  ownershipPct={ownershipPct}
                  ownershipStatus={ownershipStatus}
                  websiteUrl={auctionWebsiteUrl}
                />
              )}

              {/* ── Property Details + Energy Certificate ── */}
              <PropertyDetailsAndEnergy detailGroups={detailGroups} energyClass={energyClass} />

              {/* ── Features & Amenities ── */}
              <PropertyFeatureList
                internalFeatures={internalFeatures}
                externalFeatures={externalFeatures}
                constructionFeatures={constructionFeatures}
                suitabilityFeatures={suitabilityFeatures}
              />

              {/* ── Website Link (distinctive section) ── */}
              {/* ── Mini map ── */}
              <DeferredDetailPanel
                className="rounded-2xl overflow-hidden"
                placeholder={<div aria-hidden="true" className="h-96 rounded-2xl bg-muted" />}
              >
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-2xl" />}>
                  <PropertyMiniMap
                    latitude={db?.latitude}
                    longitude={db?.longitude}
                    address={address}
                    city={city}
                    title={title}
                  />
                </Suspense>
              </DeferredDetailPanel>

              {/* ── Neighbourhood Report — sign-in only ── */}
              <DeferredDetailPanel placeholder={<div aria-hidden="true" className="h-64 rounded-lg bg-muted" />}>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                  <NeighbourhoodReport
                    city={city}
                    address={address}
                    region={db?.region}
                    municipality={db?.region}
                    propertyType={propertyType}
                    lat={db?.latitude ? Number(db.latitude) : undefined}
                    lng={db?.longitude ? Number(db.longitude) : undefined}
                    listingId={id ?? undefined}
                    isPro={isPro} />
                </Suspense>
              </DeferredDetailPanel>

            </div>

            {/* ──── RIGHT SIDEBAR ──── */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">

              {/* ① Contact / Buy card */}
              <PropertyOwnerCard
                ownerProfile={ownerProfile}
                ownerParticipantType={ownerParticipantType}
                isAuction={isAuction}
                ownerIsPro={ownerIsPro}
                price={price}
                listingType={listingType}
                pricePerSqm={pricePerSqm ? Number(pricePerSqm) : null}
                viewsCount={db.views_count || 0}
                onContact={handleContact}
                isContactPending={startConversation.isPending}
                onRequestViewing={() => {
                  if (!user) { toast.error(t("property.signInToView")); navigate("/login"); return; }
                  modal.open("viewing");
                }}
                onRequestVideoViewing={() => {
                  if (!user) { toast.error(t("property.signInToView")); navigate("/login"); return; }
                  if (canVideoView) { modal.open("viewing"); } else {
                    toast.info(t("property.videoViewingProOnly"));
                    navigate("/pricing");
                  }
                }}
                canVideoView={canVideoView}
              />

              {/* ② Walk Score + Safety + Noise scores */}
              <PropertyScoresSection
                walkabilityScore={db?.walkability_score != null ? Number(db.walkability_score) : null}
                safetyScore={db?.safety_score != null ? Number(db.safety_score) : null}
                noiseScore={db?.noise_score != null ? Number(db.noise_score) : null}
              />

              {/* ③ Property Valuation — unlocked for Pro users */}
              {isPro ?
              <PropertyValuation
                title={title}
                city={city}
                address={address}
                price={price}
                sqm={sqm}
                bedrooms={bedrooms}
                bathrooms={bathrooms}
                propertyType={propertyType}
                listingType={db?.listing_type}
                floor={db?.floor}
                totalFloors={db?.total_floors}
                yearBuilt={db?.year_built}
                heatingSystem={db?.heating_system ?? undefined}
                energyClass={energyClass}
                pricePerSqm={pricePerSqm ? Number(pricePerSqm) : undefined}
                hasParking={db?.has_parking}
                hasPool={db?.has_pool}
                hasElevator={db?.has_elevator}
                hasGarden={db?.has_garden}
                hasStorage={db?.has_storage}
                hasBalcony={db?.has_balcony}
                hasView={db?.has_view}
                hasFurnished={db?.has_furnished}
                region={db?.region}
                description={db?.description}
                tags={db?.tags}
                ownershipStatus={ownershipStatus ?? undefined}
                ownershipPercentage={ownershipPct ?? undefined}
                auctionCourt={db?.auction_court}
                plotSurface={db?.plot_surface}
                condition={db?.construction_status ?? undefined}
                isNeoclassical={db?.is_neoclassical}
                isPreserved={db?.is_preserved}
                distanceFromSea={db?.distance_from_sea}
                withinCityPlan={db?.within_city_plan}
                withinSettlement={db?.within_settlement}
                buildingAllowance={db?.building_allowance}
                coverageRatio={db?.coverage_ratio}
                isBuildable={db?.is_buildable}
                cadastreNumber={db?.cadastre_number}
                hasLandConcession={db?.has_land_concession}
                landUse={db?.land_use}
                latitude={db?.latitude != null ? Number(db.latitude) : undefined}
                longitude={db?.longitude != null ? Number(db.longitude) : undefined}
                listingId={id ?? undefined} /> : (
              <PropertyValuationLockedCard />
              )}

              {/* ④ Property Report — Pro only, 3 free/month, EUR 49 each extra */}
              <PropertyReportCard listingId={db.id} listing={db} />

              {/* Professional add-ons — valuation & legal */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5 text-brand-gold" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">{t("property.professionalAddons", { defaultValue: "Professional Add-ons" })}</h4>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("property.professionalAddonsDescription", {
                      defaultValue: "Formal valuation reports, legal due diligence, and building legality checks — book accredited professionals in your area.",
                    })}
                  </p>
                  <Link
                    to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    
                    {t("property.findProfessionalsIn", { city: city || t("property.greece", { defaultValue: "Greece" }), defaultValue: "Find valuers & lawyers in {{city}}" })} <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* ⑤ Verified listing badge — hidden for auctions */}
              {!isAuction


















              }

              {/* Report error */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => report.submit({ entityType: "listing", entityId: id ?? null })}
                  disabled={report.isPending}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto transition-colors"
                >
                  <Info className="w-3 h-3" />{t("property.reportListingCta")}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Similar Listings / Similar Deals */}
        {similarListings.length > 0 &&
        <div className="container pb-16">
            <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" />
              {isAuction ? t("property.similarDeals") : t("property.similarListings", { defaultValue: "Similar Listings" })}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              {isAuction ? "More auctions from the OS database" : "Related properties you might like"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarListings.map((l) =>
            <PropertyCard key={l.id} property={dbListingToCard(l as unknown as DbListingCardRow, { includeOwnership: true, includeRaw: true, maxImages: 3 })} />
            )}
            </div>
          </div>
        }
      </main>

      <Footer />

      <ViewingDialog
        open={modal.isOpen("viewing")}
        onClose={() => modal.close()}
        canVideoView={canVideoView}
        ownerId={db.owner_id ?? db.profiles?.user_id ?? ""}
        property={{
          id: db.id, title: db.title, city: db.city,
          price: Number(db.price), sqm: Number(db.sqm),
          type: db.property_type, listingType: db.listing_type,
          images: images, address: db.address || db.city,
          tags: []
        }} />
      

      <Suspense fallback={null}>
        <AIAssistantWidget
          propertyContext={{
            title: db.title ?? undefined,
            city: db.city ?? undefined,
            address: db.address ?? undefined,
            price: db.price ? Number(db.price) : undefined,
            pricePerSqm: pricePerSqm ?? undefined,
            sqm: db.sqm ? Number(db.sqm) : undefined,
            bedrooms: db.bedrooms ?? undefined,
            bathrooms: db.bathrooms ?? undefined,
            propertyType: db.property_type ?? undefined,
            listingType: db.listing_type ?? undefined,
            floor: db.floor ?? undefined,
            yearBuilt: db.year_built ?? undefined,
            energyClass: db.energy_class ?? undefined,
            heatingSystem: db.heating_system ?? undefined,
            hasParking: db.has_parking ?? undefined,
            hasPool: db.has_pool ?? undefined,
            hasElevator: db.has_elevator ?? undefined,
            hasGarden: db.has_garden ?? undefined,
            hasBalcony: db.has_balcony ?? undefined,
            hasAC: db.has_ac ?? undefined,
            hasFireplace: db.has_fireplace ?? undefined,
            hasFurnished: db.has_furnished ?? undefined,
            hasStorage: db.has_storage ?? undefined,
            hasSmartHome: db.has_smart_home ?? undefined,
            petsAllowed: db.pets_allowed ?? undefined,
            hasView: db.has_view ?? undefined,
            latitude: db.latitude ?? undefined,
            longitude: db.longitude ?? undefined,
            region: db.region ?? undefined
          }} />
      </Suspense>
      

      {/* Auction Alert Modal */}
      <AuctionAlertModal
        open={modal.isOpen("auctionAlert")}
        onClose={() => modal.close()} />

    </div>);

};

export default PropertyDetail;
