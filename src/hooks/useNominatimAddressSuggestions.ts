import { useEffect, useRef, useState } from "react";

const NOMINATIM_DEBOUNCE_MS = 400;
const NOMINATIM_MIN_QUERY_LEN = 3;
const NOMINATIM_LIMIT = 5;

export interface NominatimAddressSuggestion {
  display_name: string;
  lat?: string;
  lon?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    residential?: string;
    path?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    municipality?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state_district?: string;
    state?: string;
    postcode?: string;
  };
}

/**
 * Address-autocomplete hook backed by OpenStreetMap Nominatim.
 *
 * Behaviour:
 *  - Returns `[]` when the query is shorter than 3 characters.
 *  - Debounces by 400 ms — typing fast does not fire a request per keystroke.
 *  - Aborts the in-flight fetch when the query changes or the component
 *    unmounts, so suggestions never overwrite a more-recent query.
 *  - Silently returns `[]` on any network or parse error.
 *
 * Nominatim is a free service. The query is restricted to Greece and asks
 * for Greek/English result text.
 */
export function useNominatimAddressSuggestions(query: string) {
  const [rawSuggestions, setRawSuggestions] = useState<NominatimAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    // Always cancel a previous in-flight request before starting a new one.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (q.length < NOMINATIM_MIN_QUERY_LEN) {
      setRawSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${NOMINATIM_LIMIT}&countrycodes=gr&q=${encodeURIComponent(q)}`,
          {
            headers: {
              "Accept-Language": "el,en",
            },
            signal: controller.signal,
          },
        );
        const json = await res.json().catch(() => []);
        if (Array.isArray(json)) {
          setRawSuggestions(
            json.filter((r: Partial<NominatimAddressSuggestion>) => typeof r.display_name === "string"),
          );
        } else {
          setRawSuggestions([]);
        }
      } catch (_err: unknown) {
        // Aborted or network failure — never surface to the user, just clear.
        setRawSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, NOMINATIM_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  /** Imperative reset — used after the user picks a suggestion. */
  const clear = () => setRawSuggestions([]);
  const suggestions = rawSuggestions.map((suggestion) => suggestion.display_name);

  return { suggestions, rawSuggestions, loading, clear };
}
