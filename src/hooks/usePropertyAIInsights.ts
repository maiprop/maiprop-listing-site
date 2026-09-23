import { useState, useEffect, useCallback, useRef } from "react";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import { aiQuotaFromJson, fetchAiQuota } from "@/hooks/useAiQuota";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { ListingWithJoins } from "@/hooks/useListings";
import { parseValuationResponseV2, selectPrimaryValuation, type ValuationFieldSource, type ValuationResponseV2, type ValuationUnit } from "@/lib/valuationResult";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export interface AIInsightsData {
  vsMarket: number | null;
  rentalYield: number | null;
  estimatedValue: number | null;
  pricePerSqmEstimate?: number;
  marketComparison: string | null;
  confidenceLabel: string | null;
  estimateSource: ValuationFieldSource | null;
  estimateUnit: ValuationUnit | null;
  valuation: ValuationResponseV2;
}

export interface AIInsightsQuota {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
  remaining: number;
}

const AI_INSIGHTS_BUCKET = "property-valuation";
const AI_INSIGHTS_FUNCTION_TIMEOUT_MS = 45_000;

type PropertyInsightsResponse = {
  error?: string;
  [key: string]: unknown;
};

const toPositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const isRentalListing = (listing: ListingWithJoins): boolean =>
  listing.listing_type === "rent" ||
  (listing.listing_type === "open_house" && listing.open_house_transaction_type === "rent");

export function usePropertyAIInsights(
  dbListing: ListingWithJoins | null | undefined,
  user: User | null,
  _id: string | undefined,
  _isPro: boolean,
) {
  const [aiInsightsData, setAiInsightsData] = useState<AIInsightsData | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsLoaded, setAiInsightsLoaded] = useState(false);
  const [aiInsightsQuota, setAiInsightsQuota] = useState<AIInsightsQuota | null>(null);
  const [aiInsightsQuotaLoading, setAiInsightsQuotaLoading] = useState(false);
  const requestGeneration = useRef(0);

  const listingId = dbListing?.id;

  useEffect(() => {
    requestGeneration.current += 1;
    setAiInsightsData(null);
    setAiInsightsLoaded(false);
    setAiInsightsQuota(null);
    setAiInsightsLoading(false);
    setAiInsightsQuotaLoading(false);
  }, [listingId, user?.id]);

  const refreshAiInsightsQuota = useCallback(async (expectedGeneration = requestGeneration.current) => {
    if (!dbListing || !user) {
      if (expectedGeneration === requestGeneration.current) setAiInsightsQuota(null);
      return null;
    }

    if (expectedGeneration === requestGeneration.current) setAiInsightsQuotaLoading(true);
    try {
      const quota = await fetchAiQuota(AI_INSIGHTS_BUCKET);
      if (expectedGeneration === requestGeneration.current) setAiInsightsQuota(quota);
      return quota;
    } catch (_err: unknown) {
      if (expectedGeneration === requestGeneration.current) setAiInsightsQuota(null);
      return null;
    } finally {
      if (expectedGeneration === requestGeneration.current) setAiInsightsQuotaLoading(false);
    }
  }, [dbListing, user]);

  const loadAiInsights = useCallback(async () => {
    if (!dbListing || !user || aiInsightsLoading) return;
    const generation = requestGeneration.current;

    const quota = await refreshAiInsightsQuota(generation);
    if (generation !== requestGeneration.current) return;
    if (quota && !quota.allowed) {
      toast.error(
        quota.reason === "monthly_limit_reached"
          ? "You've reached your AI insights limit for this month. Upgrade to continue."
          : "AI insights are not included in your current plan.",
      );
      return;
    }

    setAiInsightsLoading(true);
    const snapshot = dbListing;
    const rentalListing = isRentalListing(snapshot);
    const monthlyRent = rentalListing ? toPositiveNumber(snapshot.price) : null;
    const pricePerSqm = calculatePricePerSqm({
      price: snapshot.price,
      sqm: snapshot.sqm,
      storedPricePerSqm: snapshot.price_per_sqm,
    });
    setAiInsightsLoaded(true);

    try {
      const { data, error: fnErr } = await invokeAuthenticatedFunction<PropertyInsightsResponse>("property-valuation", {
        timeout: AI_INSIGHTS_FUNCTION_TIMEOUT_MS,
        body: {
          responseVersion: 2,
          listingId: snapshot.id,
          title: snapshot.title,
          city: snapshot.city,
          address: snapshot.address,
          price: Number(snapshot.price),
          sqm: Number(snapshot.sqm),
          latitude: snapshot.latitude != null ? Number(snapshot.latitude) : undefined,
          longitude: snapshot.longitude != null ? Number(snapshot.longitude) : undefined,
          bedrooms: snapshot.bedrooms,
          bathrooms: snapshot.bathrooms,
          propertyType: snapshot.property_type,
          listingType: rentalListing ? "rent" : snapshot.listing_type,
          openHouseTransactionType: snapshot.open_house_transaction_type,
          askingMonthlyRent: monthlyRent ?? undefined,
          floor: snapshot.floor,
          totalFloors: snapshot.total_floors,
          yearBuilt: snapshot.year_built,
          heatingSystem: snapshot.heating_system,
          energyClass: snapshot.energy_class,
          pricePerSqm: pricePerSqm ?? undefined,
          hasParking: snapshot.has_parking,
          hasPool: snapshot.has_pool,
          hasElevator: snapshot.has_elevator,
          hasGarden: snapshot.has_garden,
          hasStorage: snapshot.has_storage,
          hasBalcony: snapshot.has_balcony,
          hasView: snapshot.has_view,
          hasFurnished: snapshot.has_furnished,
          region: snapshot.region,
          description: snapshot.description,
          tags: snapshot.tags,
          auctionCourt: snapshot.auction_court,
          plotSurface: snapshot.plot_surface,
          condition: snapshot.construction_status,
          isNeoclassical: snapshot.is_neoclassical,
          isPreserved: snapshot.is_preserved,
          distanceFromSea: snapshot.distance_from_sea,
          withinCityPlan: snapshot.within_city_plan,
          withinSettlement: snapshot.within_settlement,
          buildingAllowance: snapshot.building_allowance,
          coverageRatio: snapshot.coverage_ratio,
          isBuildable: snapshot.is_buildable,
          cadastreNumber: snapshot.cadastre_number,
          hasLandConcession: snapshot.has_land_concession,
          landUse: snapshot.land_use,
          ownershipStatus: (() => {
            const t = (snapshot as ListingWithJoins).tags ?? [];
            const tag = t.find((x) => x.startsWith("ownership:") && !x.startsWith("ownership_pct:"));
            return tag ? tag.replace("ownership:", "") : undefined;
          })(),
          ownershipPercentage: (() => {
            const t = (snapshot as ListingWithJoins).tags ?? [];
            const tag = t.find((x) => x.startsWith("ownership_pct:"));
            return tag ? Number(tag.replace("ownership_pct:", "")) : undefined;
          })(),
        },
      });
      if (generation !== requestGeneration.current) return;
      if (!fnErr && data && !data.error) {
        const parsed = parseValuationResponseV2(data);
        if (!parsed) throw new Error("Unsupported valuation response");
        const primary = selectPrimaryValuation(parsed);
        const returnedPricePerSqm = toPositiveNumber(parsed.pricePerSqmEstimate);
        setAiInsightsData({
          vsMarket: parsed.marketComparisonPct,
          rentalYield: parsed.rentalYieldEstimate,
          estimatedValue: primary?.value ?? null,
          ...(returnedPricePerSqm ? { pricePerSqmEstimate: returnedPricePerSqm } : {}),
          marketComparison: parsed.marketComparison,
          confidenceLabel: parsed.confidenceLabel,
          estimateSource: primary?.source ?? null,
          estimateUnit: primary?.unit ?? null,
          valuation: parsed,
        });
        await refreshAiInsightsQuota(generation);
      } else if (isAiUsageLimitError(fnErr, data)) {
        const quotaFromError = aiQuotaFromJson(data);
        if (quotaFromError) setAiInsightsQuota(quotaFromError);
        toast.error("You've reached your AI insights limit for this month. Upgrade to continue.");
      } else {
        toast.error("Could not load AI insights. Please try again.");
      }
    } catch (e: unknown) {
      if (generation !== requestGeneration.current) return;
      if (isAiUsageLimitError(e, null)) {
        toast.error("You've reached your AI insights limit for this month. Upgrade to continue.");
        await refreshAiInsightsQuota(generation);
      } else {
        toast.error("Could not load AI insights. Please try again.");
      }
    } finally {
      if (generation === requestGeneration.current) setAiInsightsLoading(false);
    }
  }, [aiInsightsLoading, dbListing, refreshAiInsightsQuota, user]);

  return {
    aiInsightsData,
    aiInsightsLoading,
    aiInsightsLoaded,
    aiInsightsQuota,
    aiInsightsQuotaLoading,
    loadAiInsights,
    refreshAiInsightsQuota,
  };
}
