import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SmartFilterConfig {
  sections: string[];
  features: { key: string; label: string }[];
  sizeLabel: string;
  priceLabel: string;
  bedsLabel: string | null;
  featuresLabel: string;
}

// In-memory cache to avoid redundant AI calls per session
const cache = new Map<string, SmartFilterConfig>();

// Fallback config used while loading or on error
const DEFAULT_CONFIG: SmartFilterConfig = {
  sections: ["size", "bedrooms", "bathrooms", "floor", "year_built", "heating", "energy_class", "construction_status"],
  features: [
    { key: "has_parking",    label: "🚗 Parking" },
    { key: "has_elevator",   label: "🛗 Elevator" },
    { key: "has_balcony",    label: "🏞️ Balcony" },
    { key: "has_pool",       label: "🏊 Pool" },
    { key: "has_furnished",  label: "🛋️ Furnished" },
    { key: "has_garden",     label: "🌿 Garden" },
    { key: "has_ac",         label: "❄️ AC" },
    { key: "has_fireplace",  label: "🔥 Fireplace" },
    { key: "has_storage",    label: "📦 Storage" },
    { key: "has_view",       label: "👁️ View" },
  ],
  sizeLabel: "Size (m²)",
  priceLabel: "Price",
  bedsLabel: "Bedrooms",
  featuresLabel: "Features & Amenities",
};

export function useSmartFilters(type: string, subtype: string, listingType: string) {
  const cacheKey = `${type}|${subtype}|${listingType}`;
  const [config, setConfig] = useState<SmartFilterConfig>(
    () => cache.get(cacheKey) ?? DEFAULT_CONFIG
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey) && !!type);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // If no type selected, use default
    if (!type) {
      setConfig(DEFAULT_CONFIG);
      setLoading(false);
      return;
    }

    // Cache hit
    if (cache.has(cacheKey)) {
      setConfig(cache.get(cacheKey)!);
      setLoading(false);
      return;
    }

    // Fetch from AI
    setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    supabase.functions
      .invoke("smart-filters", {
        body: { type, subtype: subtype || null, listing_type: listingType || null },
      })
      .then(({ data, error }) => {
        if (error || !data || data.error) {
          console.warn("smart-filters fallback:", error || data?.error);
          setLoading(false);
          return;
        }
        const result = data as SmartFilterConfig;
        cache.set(cacheKey, result);
        setConfig(result);
        setLoading(false);
      });

    return () => abortRef.current?.abort();
  }, [cacheKey, type]);

  return { config, loading };
}
