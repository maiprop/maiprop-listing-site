/**
 * AI helpers for the listing creation wizard.
 * Calls the listing-ai-assist edge function to generate a description
 * or price estimate based on the current form state.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ListingFormData, AIPriceSuggestion } from "@/hooks/listingForm.types";

interface UseListingAIReturn {
  aiDescLoading: boolean;
  aiPriceLoading: boolean;
  aiPriceSuggestion: AIPriceSuggestion | null;
  handleAiDescription: () => Promise<void>;
  handleAiPrice: () => Promise<void>;
}

function parseAIPriceSuggestion(content: unknown): AIPriceSuggestion {
  const text = typeof content === "string" ? content : "";
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const objectMatch = fenceMatch?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(objectMatch.trim()) as Partial<AIPriceSuggestion>;
  const min = Number(parsed.min);
  const max = Number(parsed.max);
  const suggested = Number(parsed.suggested);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(suggested)) {
    throw new Error("AI price suggestion returned an unexpected format");
  }
  return {
    ...parsed,
    min,
    max,
    suggested,
  } as AIPriceSuggestion;
}

export function useListingAI(
  form: ListingFormData,
  set: (key: string, value: unknown) => void,
): UseListingAIReturn {
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiPriceLoading, setAiPriceLoading] = useState(false);
  const [aiPriceSuggestion, setAiPriceSuggestion] = useState<AIPriceSuggestion | null>(null);

  const getActiveFeatures = useCallback(() => {
    const featureKeys = [
      "has_elevator", "has_ac", "has_solar_water", "has_storage", "has_secure_door",
      "has_parking", "has_balcony", "has_garden", "has_pool", "has_view",
      "has_fireplace", "has_furnished", "has_smart_home", "has_disability_access",
    ] as const;
    return featureKeys
      .filter(k => (form as unknown as Record<string, unknown>)[k])
      .map(k => k.replace("has_", "").replace("is_", "").replace(/_/g, " "));
  }, [form]);

  const handleAiDescription = useCallback(async () => {
    if (!form.property_type || !form.sqm) {
      toast.error("Please fill in property type and area first");
      return;
    }
    setAiDescLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("listing-ai-assist", {
        body: {
          type: "description",
          property: {
            property_type: form.property_type,
            listing_type: form.listing_type,
            city: form.city || "Greece",
            address: form.address,
            sqm: form.sqm,
            bedrooms: form.bedrooms,
            bathrooms: form.bathrooms,
            floor: form.floor,
            year_built: form.year_built,
            energy_class: form.energy_class,
            features: getActiveFeatures(),
            condition: form.construction_status,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      set("description", data.content);
      toast.success("AI description generated!");
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Failed to generate description");
    } finally {
      setAiDescLoading(false);
    }
  }, [form, set, getActiveFeatures]);

  const handleAiPrice = useCallback(async () => {
    if (!form.property_type || !form.sqm || !form.city) {
      toast.error("Please fill in property type, area, and city first");
      return;
    }
    setAiPriceLoading(true);
    setAiPriceSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("listing-ai-assist", {
        body: {
          type: "price",
          property: {
            property_type: form.property_type,
            listing_type: form.listing_type,
            city: form.city,
            region: form.region,
            sqm: form.sqm,
            bedrooms: form.bedrooms,
            floor: form.floor,
            year_built: form.year_built,
            energy_class: form.energy_class,
            features: getActiveFeatures(),
            condition: form.construction_status,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      try {
        const parsed = parseAIPriceSuggestion(data.content);
        setAiPriceSuggestion(parsed);
      } catch (_err: unknown) {
        throw new Error("AI price suggestion returned an unexpected format");
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Failed to get price estimate");
    } finally {
      setAiPriceLoading(false);
    }
  }, [form, getActiveFeatures]);

  return { aiDescLoading, aiPriceLoading, aiPriceSuggestion, handleAiDescription, handleAiPrice };
}
