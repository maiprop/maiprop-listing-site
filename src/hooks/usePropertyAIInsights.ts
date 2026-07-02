import { useState, useEffect, useCallback } from "react";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import { aiQuotaFromJson, fetchAiQuota } from "@/hooks/useAiQuota";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { ListingWithJoins } from "@/hooks/useListings";
import { deriveListingMarketComparison, getPrimaryValuationEstimate } from "@/lib/valuationResult";
import type { ValuationEstimateSource } from "@/lib/valuationResult";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export interface AIInsightsData {
  vsMarket: number | null;
  rentalYield: number;
  estimatedValue: number;
  marketComparison: string | null;
  confidenceLabel: string;
}

export interface AIInsightsQuota {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
  remaining: number;
}

const AI_INSIGHTS_BUCKET = "property-valuation";

type PropertyInsightsResponse = ValuationEstimateSource & {
  error?: string;
  rentalYieldEstimate?: number;
  confidenceLabel?: string;
  estimatedMonthlyRent?: number;
  monthlyRentEstimate?: number;
  marketRentEstimate?: number;
};

const toPositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

const isRentalListing = (listing: ListingWithJoins): boolean =>
  listing.listing_type === "rent" ||
  (listing.listing_type === "open_house" && listing.open_house_transaction_type === "rent");

const getRentalMarketRentEstimate = (data: PropertyInsightsResponse): number | null =>
  toPositiveNumber(data.estimatedMonthlyRent) ??
  toPositiveNumber(data.monthlyRentEstimate) ??
  toPositiveNumber(data.marketRentEstimate);

const getRentalYield = (
  monthlyRent: number | null,
  capitalEstimate: number,
  remoteYield: unknown,
): number => {
  if (monthlyRent && capitalEstimate > monthlyRent * 24) {
    return roundToOneDecimal((monthlyRent * 12 / capitalEstimate) * 100);
  }
  return toPositiveNumber(remoteYield) ?? 0;
};

const getRentalMarketComparison = (
  monthlyRent: number | null,
  marketRentEstimate: number | null,
): { marketComparison: string | null; marketComparisonPct: number | null } => {
  if (!monthlyRent || !marketRentEstimate) {
    return { marketComparison: null, marketComparisonPct: null };
  }
  return deriveListingMarketComparison(monthlyRent, marketRentEstimate);
};

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

  const listingId = dbListing?.id;

  useEffect(() => {
    setAiInsightsData(null);
    setAiInsightsLoaded(false);
    setAiInsightsQuota(null);
  }, [listingId, user?.id]);

  const refreshAiInsightsQuota = useCallback(async () => {
    if (!dbListing || !user) {
      setAiInsightsQuota(null);
      return null;
    }

    setAiInsightsQuotaLoading(true);
    try {
      const quota = await fetchAiQuota(AI_INSIGHTS_BUCKET);
      setAiInsightsQuota(quota);
      return quota;
    } catch (_err: unknown) {
      setAiInsightsQuota(null);
      return null;
    } finally {
      setAiInsightsQuotaLoading(false);
    }
  }, [dbListing, user]);

  const loadAiInsights = useCallback(async () => {
    if (!dbListing || !user || aiInsightsLoading) return;

    const quota = await refreshAiInsightsQuota();
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
        body: {
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
      if (data && !data.error) {
        const estimatedValue = getPrimaryValuationEstimate(data, Number(snapshot.price));
        const marketRentEstimate = rentalListing ? getRentalMarketRentEstimate(data) : null;
        const comparison = rentalListing
          ? getRentalMarketComparison(monthlyRent, marketRentEstimate)
          : deriveListingMarketComparison(snapshot.price, estimatedValue);
        setAiInsightsData({
          vsMarket: comparison.marketComparisonPct,
          rentalYield: rentalListing
            ? getRentalYield(monthlyRent, estimatedValue, data.rentalYieldEstimate)
            : data.rentalYieldEstimate ?? 0,
          estimatedValue,
          marketComparison: comparison.marketComparison,
          confidenceLabel: data.confidenceLabel ?? "Medium",
        });
        await refreshAiInsightsQuota();
      } else if (isAiUsageLimitError(fnErr, data)) {
        const quotaFromError = aiQuotaFromJson(data);
        if (quotaFromError) setAiInsightsQuota(quotaFromError);
        toast.error("You've reached your AI insights limit for this month. Upgrade to continue.");
      } else {
        toast.error("Could not load AI insights. Please try again.");
      }
    } catch (e: unknown) {
      if (isAiUsageLimitError(e, null)) {
        toast.error("You've reached your AI insights limit for this month. Upgrade to continue.");
        await refreshAiInsightsQuota();
      } else {
        toast.error("Could not load AI insights. Please try again.");
      }
    } finally {
      setAiInsightsLoading(false);
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
