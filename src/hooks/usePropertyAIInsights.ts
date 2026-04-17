import { useState, useEffect } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
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

export function usePropertyAIInsights(
  dbListing: ListingWithJoins | null | undefined,
  user: User | null,
  id: string | undefined,
) {
  const [aiInsightsData, setAiInsightsData] = useState<AIInsightsData | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsLoaded, setAiInsightsLoaded] = useState(false);

  useEffect(() => {
    if (!dbListing || aiInsightsLoaded || !user) return;
    setAiInsightsLoaded(true);
    setAiInsightsLoading(true);
    const snapshot = dbListing;
    const listingId = id ?? snapshot.id;
    const invokeValuation = async () => {
      try {
        if (listingId) {
          const { data: osRes } = await supabaseClient.functions.invoke("fetch-report-from-os", {
            body: { listing_id: listingId, report_type: "valuation" },
          });
          if (
            osRes?.ok &&
            osRes.report != null &&
            typeof osRes.report === "object" &&
            typeof osRes.report.estimatedValue === "number"
          ) {
            const r = osRes.report as Record<string, unknown>;
            setAiInsightsData({
              vsMarket: typeof r.marketComparisonPct === "number" ? r.marketComparisonPct : 0,
              rentalYield: typeof r.rentalYieldEstimate === "number" ? r.rentalYieldEstimate : 0,
              estimatedValue: typeof r.estimatedValue === "number" ? r.estimatedValue : 0,
              marketComparison: typeof r.marketComparison === "string" ? r.marketComparison : "at_market",
              confidenceLabel: typeof r.confidenceLabel === "string" ? r.confidenceLabel : "Medium",
            });
            setAiInsightsLoading(false);
            return;
          }
        }
        const { data, error: fnErr } = await supabaseClient.functions.invoke("property-valuation", {
          body: {
            title: snapshot.title,
            city: snapshot.city,
            address: snapshot.address,
            price: Number(snapshot.price),
            sqm: Number(snapshot.sqm),
            bedrooms: snapshot.bedrooms,
            bathrooms: snapshot.bathrooms,
            propertyType: snapshot.property_type,
            listingType: snapshot.listing_type,
            floor: snapshot.floor,
            yearBuilt: snapshot.year_built,
            energyClass: snapshot.energy_class,
            pricePerSqm: snapshot.price_per_sqm ? Number(snapshot.price_per_sqm) : undefined,
            hasParking: snapshot.has_parking,
            hasPool: snapshot.has_pool,
            hasElevator: snapshot.has_elevator,
            region: snapshot.region,
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
        } else if (isAiUsageLimitError(fnErr, data)) {
          toast.error("AI insights are temporarily unavailable due to usage limits. Please try again later.");
        }
      } catch (e: unknown) {
        if (isAiUsageLimitError(e, null))
          toast.error("AI insights are temporarily unavailable due to usage limits. Please try again later.");
      } finally {
        setAiInsightsLoading(false);
      }
    };
    invokeValuation();
  }, [dbListing, aiInsightsLoaded, user, id]);

  return { aiInsightsData, aiInsightsLoading };
}
