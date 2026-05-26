import { useEffect, useRef, useState } from "react";

const NOMINATIM_DEBOUNCE_MS = 400;
const NOMINATIM_MIN_QUERY_LEN = 3;
const NOMINATIM_LIMIT = 5;

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
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
      setSuggestions([]);
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
          setSuggestions(json.map((r: { display_name: string }) => r.display_name));
        } else {
          setSuggestions([]);
        }
      } catch (_err: unknown) {
        // Aborted or network failure — never surface to the user, just clear.
        setSuggestions([]);
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
  const clear = () => setSuggestions([]);

  return { suggestions, loading, clear };
}
