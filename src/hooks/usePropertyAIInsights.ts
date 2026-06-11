import { useState, useEffect, useCallback } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import { aiQuotaFromJson, fetchAiQuota } from "@/hooks/useAiQuota";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { ListingWithJoins } from "@/hooks/useListings";

export interface AIInsightsData {
  vsMarket: number;
  rentalYield: number;
  estimatedValue: number;
  marketComparison: string;
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

  useEffect(() => {
    void refreshAiInsightsQuota();
  }, [refreshAiInsightsQuota]);

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
    setAiInsightsLoaded(true);

    try {
      const { data, error: fnErr } = await supabaseClient.functions.invoke("property-valuation", {
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
          listingType: snapshot.listing_type,
          floor: snapshot.floor,
          totalFloors: snapshot.total_floors,
          yearBuilt: snapshot.year_built,
          heatingSystem: snapshot.heating_system,
          energyClass: snapshot.energy_class,
          pricePerSqm: snapshot.price_per_sqm ? Number(snapshot.price_per_sqm) : undefined,
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
        setAiInsightsData({
          vsMarket: data.marketComparisonPct ?? 0,
          rentalYield: data.rentalYieldEstimate ?? 0,
          estimatedValue: data.estimatedValue ?? Number(snapshot.price),
          marketComparison: data.marketComparison ?? "at_market",
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
