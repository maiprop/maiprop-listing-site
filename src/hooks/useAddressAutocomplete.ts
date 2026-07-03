import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPopularAddressPredictions,
  mapMapboxFeatureToAddressPrediction,
  mapNominatimSuggestionToAddressPrediction,
  mapTextLocationToAddressPrediction,
  mergeAddressPredictions,
  type MapboxLike,
  type AddressPrediction,
} from "@/lib/location/addressFormat";
import type { NominatimAddressSuggestion } from "@/hooks/useNominatimAddressSuggestions";

const AUTOCOMPLETE_DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;
const LIMIT = 6;

type AddressAutocompleteMode = "city" | "address";

type UseAddressAutocompleteOptions = {
  mode?: AddressAutocompleteMode;
  enabled?: boolean;
  includePopular?: boolean;
};

type MapboxResponse = {
  features?: unknown[];
};

const getMapboxAddressToken = () => {
  if (import.meta.env.MODE === "test") return "";
  return import.meta.env.VITE_MAPBOX_TOKEN ?? "";
};

const mapboxTypesForMode = (mode: AddressAutocompleteMode) =>
  mode === "address"
    ? "address,street,postcode,place,locality,neighborhood"
    : "place,locality,neighborhood";

async function fetchMapboxPredictions(query: string, mode: AddressAutocompleteMode, signal: AbortSignal) {
  const token = getMapboxAddressToken();
  if (!token) return null;
  const encodedQuery = encodeURIComponent(query);
  const params = new URLSearchParams({
    access_token: token,
    country: "gr",
    language: "el,en",
    limit: String(LIMIT),
    types: mapboxTypesForMode(mode),
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const json: MapboxResponse = await response.json().catch((): MapboxResponse => ({}));
  if (!Array.isArray(json.features)) return [];
  return json.features
    .filter((feature): feature is MapboxLike =>
      Boolean(feature) && typeof feature === "object",
    )
    .map(mapMapboxFeatureToAddressPrediction)
    .filter((prediction: AddressPrediction) => prediction.value);
}

async function fetchNominatimPredictions(query: string, signal: AbortSignal) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${LIMIT}&countrycodes=gr&q=${encodeURIComponent(query)}`,
    {
      headers: { "Accept-Language": "el,en" },
      signal,
    },
  );
  const json = await response.json().catch(() => []);
  if (!Array.isArray(json)) return [];
  return json
    .filter((item: Partial<NominatimAddressSuggestion>) => typeof item.display_name === "string")
    .map((item) => mapNominatimSuggestionToAddressPrediction(item as NominatimAddressSuggestion))
    .filter((prediction) => prediction.value);
}

export function useAddressAutocomplete(
  query: string,
  {
    mode = "city",
    enabled = true,
    includePopular = mode === "city",
  }: UseAddressAutocompleteOptions = {},
) {
  const [remotePredictions, setRemotePredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const normalizedQuery = query.trim();

  const popularPredictions = useMemo(
    () => (includePopular ? getPopularAddressPredictions(normalizedQuery) : []),
    [includePopular, normalizedQuery],
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (!enabled || normalizedQuery.length < MIN_QUERY_LEN) {
      setRemotePredictions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const mapboxPredictions = await fetchMapboxPredictions(normalizedQuery, mode, controller.signal);
        const predictions =
          mapboxPredictions && mapboxPredictions.length > 0
            ? mapboxPredictions
            : await fetchNominatimPredictions(normalizedQuery, controller.signal);
        setRemotePredictions(predictions.slice(0, LIMIT));
      } catch (_error) {
        setRemotePredictions([]);
      } finally {
        setLoading(false);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, mode, normalizedQuery]);

  const predictions = useMemo(() => {
    const manualPrediction =
      normalizedQuery && popularPredictions.length === 0 && remotePredictions.length === 0
        ? [mapTextLocationToAddressPrediction(normalizedQuery, "manual")]
        : [];
    return mergeAddressPredictions(popularPredictions, remotePredictions, manualPrediction).slice(0, LIMIT);
  }, [normalizedQuery, popularPredictions, remotePredictions]);

  return {
    predictions,
    loading,
    clear: () => setRemotePredictions([]),
  };
}
