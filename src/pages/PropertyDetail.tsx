import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { useModal } from "@/hooks/useModal";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  Loader2,
  Info, LayoutGrid, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import ViewingDialog from "@/components/ViewingDialog";
import { useListing, useTrackListingView } from "@/hooks/useListings";
import type { ListingWithJoins } from "@/hooks/useListings";
import { useSimilarListings } from "@/hooks/useSimilarListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";
import { PropertyAuctionSection } from "@/components/property/PropertyAuctionSection";
import { toast } from "sonner";
import PropertyValuation from "@/components/PropertyValuation";
const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"));
const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"));
import { buildPropertyFeatureGroups, buildDetailRows } from "@/lib/propertyFeatures";
const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { getStreetViewProxyUrl } from "@/lib/config";
import { dbListingToCard } from "@/lib/listingUtils";
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
import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";

// ─── Main component ──────────────────────────────────────────────────────────
export default function PropertyDetail() {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();

  const { data: dbListing, isLoading, isError } = useListing(id || "");
  const { mutate: trackViewMutate } = useTrackListingView();
  const ownerIsPro = !!(dbListing as ListingWithJoins | null)?.ownerIsPro;
  // Video viewing: free for buyers, Pro required for all other roles
  const isBuyer = getParticipantTypeFromProfile(profile) === "buyer";
  const canVideoView = isPro || isBuyer;
  const { data: similarFromDb = [] } = useSimilarListings({
    excludeId: id ?? dbListing?.id,
    city: dbListing?.city,
    propertyType: dbListing?.property_type,
    listingType: dbListing?.listing_type,
    price: dbListing ? Number(dbListing.price) : undefined,
    limit: 8
  });

  // Track view once per session; sessionStorage in useTrackListingView prevents double-counting on refetch
  useEffect(() => {
    if (id && dbListing) trackViewMutate(id);
  }, [id, dbListing, trackViewMutate]);

  // Redirect: canonical routes per listing type
  // - new build  → /new-build/:id
  // - auction    → /auction/:id  (AuctionRouter renders PropertyDetail there too,
  //                so UI is identical; this just keeps the URL canonical)
  useEffect(() => {
    if (!dbListing) return;
    const _db = dbListing as ListingWithJoins;
    if (_db.is_pre_sale || _db.construction_status) {
      navigate(`/new-build/${id}`, { replace: true });
      return;
    }
    if (_db.listing_type === "auction" && window.location.pathname.startsWith("/property/")) {
      navigate(`/auction/${id}`, { replace: true });
    }
  }, [dbListing, id, navigate]);

  const modal = useModal<"viewing" | "auctionAlert">();
  const [walkScore, setWalkScore] = useState<number | null>(null);

  // AI Market Insights — delegated to custom hook; skips API call for non-Pro users
  const { aiInsightsData, aiInsightsLoading } = usePropertyAIInsights(
    dbListing as ListingWithJoins | null,
    user,
    id,
    isPro,
  );

  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const startConversation = useStartConversation();

  const isFavorited = useMemo(() => favorites.some((f: { listing_id: string }) => f.listing_id === id), [favorites, id]);

  const handleFavorite = () => {
    if (!user) {toast.error(t("property.signInToSave"));return;}
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };

  const handleContact = async () => {
    if (!user) {toast.error(t("property.signInToContact"));navigate("/login");return;}
    const ownerId = dbListing ?
    (dbListing as ListingWithJoins).profiles?.user_id ?? (dbListing as ListingWithJoins).owner_id :
    undefined;
    if (!ownerId) {toast.info(t("property.contactUnavailable"));return;}
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch (_err: unknown) {toast.error(t("property.errorStartConversation"));}
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>);

  }

  if (!isLoading && (isError || !dbListing)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container pt-32 text-center">
          <p className="text-muted-foreground">
            {isError ? t("property.errorLoad") : t("property.notAvailable")}
          </p>
          <Button className="mt-4" onClick={() => navigate("/listings")}>{t("property.backToListings")}</Button>
        </div>
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
  const pricePerSqm = db.price_per_sqm;
  const energyClass = db.energy_class;
  const isLandType = propertyType === "land";
  const isAuction = listingType === "auction";

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
  const streetViewFallback = (() => {
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

  const similarListings = similarFromDb.filter(l => l.id !== id).slice(0, 6);

  // Build property details rows
  const detailRows = buildDetailRows(db, price, sqm, pricePerSqm, isLandType);


  const ogImage = images[0] ?? "https://maiprop.co/og-default.jpg";
  const ogDescription = description
    ? description.slice(0, 160)
    : `${propertyType?.replace(/_/g, " ")} in ${city} — ${sqm} m² · €${price.toLocaleString()}`;
  const canonicalUrl = `https://maiprop.co/${isAuction ? "auction" : "property"}/${db.id}`;

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
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{`${title} — maiProp`}</title>
        <meta name="description" content={ogDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={`${title} — maiProp`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — maiProp`} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <Navbar />

      <main id="main-content" className="pt-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="container py-2 sm:py-3">
          <ol className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none list-none p-0 m-0">
            <li><Link to="/" className="hover:text-foreground transition-colors shrink-0">{t("property.breadcrumbHome")}</Link></li>
            <li aria-hidden="true"><ChevronRight className="w-3 h-3 shrink-0" /></li>
            <li>
              {isAuction ?
              <Link to="/auctions" className="hover:text-foreground transition-colors shrink-0">{t("property.breadcrumbAuctions")}</Link> :
              <Link to="/listings" className="hover:text-foreground transition-colors shrink-0">{t("property.breadcrumbListings")}</Link>
              }
            </li>
            <li aria-hidden="true"><ChevronRight className="w-3 h-3 shrink-0" /></li>
            <li><span className="text-foreground truncate font-medium" aria-current="page">{title}</span></li>
          </ol>
        </nav>

        <div className="container pb-10">
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">

            {/* ──── LEFT COLUMN ──── */}
            <div className="space-y-5">

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
                ownershipDisplay={ownershipDisplay}
                ownershipPct={ownershipPct}
                ownershipStatus={ownershipStatus}
              />

              {/* ── AI Market Insights — dynamic from property-valuation ── */}
              <PropertyAIInsightsSection
                user={user}
                isPro={isPro}
                loading={aiInsightsLoading}
                data={aiInsightsData}
              />

              {/* ── Description (hidden for auctions) ── */}
              {!isAuction && <PropertyDescriptionSection description={description} />}

              {/* ── Auction Details (shown first for auction listings) ── */}
              {isAuction && (
                <PropertyAuctionSection
                  listingId={id!}
                  auctionDate={db.auction_date}
                  auctionStartingBid={Number(db.auction_starting_bid) || 0}
                  ownershipDisplay={ownershipDisplay}
                  ownershipPct={ownershipPct}
                  ownershipStatus={ownershipStatus}
                />
              )}

              {/* ── Property Details + Energy Certificate ── */}
              <PropertyDetailsAndEnergy detailRows={detailRows} energyClass={energyClass} />

              {/* ── Features & Amenities ── */}
              <PropertyFeatureList
                internalFeatures={internalFeatures}
                externalFeatures={externalFeatures}
                constructionFeatures={constructionFeatures}
                suitabilityFeatures={suitabilityFeatures}
              />

              {/* ── Website Link (distinctive section) ── */}
              {/* ── Mini map ── */}
              <div className="rounded-2xl overflow-hidden">
                <Suspense fallback={<div className="h-96 bg-muted animate-pulse rounded-2xl" />}>
                  <PropertyMiniMap
                    latitude={db?.latitude}
                    longitude={db?.longitude}
                    address={address}
                    city={city}
                    title={title}
                    onWalkScoreChange={setWalkScore} />
                </Suspense>
              </div>

              {/* ── Neighbourhood Report — sign-in only ── */}
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                <NeighbourhoodReport
                  city={city}
                  address={address}
                  region={db?.region}
                  propertyType={propertyType}
                  lat={db?.latitude ? Number(db.latitude) : undefined}
                  lng={db?.longitude ? Number(db.longitude) : undefined}
                  listingId={id ?? undefined}
                  isPro={isPro} />
              </Suspense>

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
                walkScore={walkScore}
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
                listingId={id ?? undefined} /> : (
              <PropertyValuationLockedCard />
              )}

              {/* ④ Property Report — Pro only, 3 free/month, €9 each extra */}
              <PropertyReportCard listingId={id!} listing={db} />

              {/* Professional add-ons — valuation & legal */}
              <div className="glass-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5 text-brand-gold" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">Professional Add-ons</h4>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">Formal valuation reports, legal due diligence, and building legality checks — book accredited professionals in your area.</p>
                  <Link
                    to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    
                    Find valuers &amp; lawyers in {city || "Greece"} <ExternalLink className="w-3.5 h-3.5" />
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
                  onClick={async () => {
                    if (!user) { toast.error(t("property.signInToReport")); navigate("/login"); return; }
                    if (!id) return;
                    const { error } = await supabaseClient.from("listing_reports").insert({
                      entity_type: "listing",
                      entity_id: id,
                      reporter_id: user.id,
                    });
                    if (error) toast.error(t("property.errorReport"));
                    else toast.success(t("property.reportSubmitted"));
                  }}
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
            <PropertyCard key={l.id} property={dbListingToCard(l, { includeOwnership: true, includeRaw: true, maxImages: 3 })} />
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
            pricePerSqm: db.price_per_sqm ? Number(db.price_per_sqm) : undefined,
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

}
