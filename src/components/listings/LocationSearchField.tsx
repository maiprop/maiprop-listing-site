import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import { useNominatimAddressSuggestions } from "@/hooks/useNominatimAddressSuggestions";
import { getPopularLocationSuggestions, mergeLocationSuggestions } from "@/lib/locationSuggestions";

type GooglePlace = {
  address_components?: Array<{ types: string[]; long_name: string }>;
  formatted_address?: string;
};

type GoogleWindow = typeof window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (el: HTMLInputElement, opts: object) => {
          addListener(eventName: string, handler: () => void): void;
          getPlace(): GooglePlace;
        };
      };
    };
  };
};

const getSearchValueFromGooglePlace = (place: GooglePlace) => {
  const components = place.address_components ?? [];
  const get = (type: string) => components.find((item) => item.types.includes(type))?.long_name ?? "";
  const city =
    get("locality") ||
    get("postal_town") ||
    get("administrative_area_level_3") ||
    get("administrative_area_level_2") ||
    get("administrative_area_level_1");
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  return city || street || place.formatted_address || "";
};

interface LocationSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  compact?: boolean;
}

export function LocationSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  compact = false,
}: LocationSearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const [googlePlacesRequested, setGooglePlacesRequested] = useState(false);
  const [googlePlacesUnavailable, setGooglePlacesUnavailable] = useState(!GOOGLE_MAPS_API_KEY);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const query = value.trim();
  const popularSuggestions = useMemo(() => getPopularLocationSuggestions(query), [query]);
  const shouldUseNominatim = Boolean(query) && (googlePlacesUnavailable || popularSuggestions.length === 0);
  const { suggestions: nominatimSuggestions, loading, clear } = useNominatimAddressSuggestions(
    shouldUseNominatim ? query : "",
  );

  const suggestions = useMemo(
    () => mergeLocationSuggestions(
      popularSuggestions,
      shouldUseNominatim ? [query] : [],
      shouldUseNominatim ? nominatimSuggestions : [],
    ).slice(0, 8),
    [nominatimSuggestions, popularSuggestions, query, shouldUseNominatim],
  );

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

  const initGoogle = useCallback(() => {
    const input = inputRef.current;
    const Autocomplete = (window as GoogleWindow).google?.maps?.places?.Autocomplete;
    if (!input || !Autocomplete || initializedRef.current) return;

    const autocomplete = new Autocomplete(input, {
      types: ["geocode"],
      componentRestrictions: { country: "gr" },
      fields: ["address_components", "formatted_address"],
    });
    autocomplete.addListener("place_changed", () => {
      const nextValue = getSearchValueFromGooglePlace(autocomplete.getPlace()).trim();
      if (nextValue) {
        onChange(nextValue);
        setFocused(false);
        clear();
      }
    });
    initializedRef.current = true;
  }, [clear, onChange]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const portal = document.getElementById("listing-location-dropdown-portal");
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (portal?.contains(event.target as Node)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (document.activeElement === inputRef.current) setFocused(true);
  }, [value]);

  useEffect(() => {
    if (!googlePlacesRequested || !GOOGLE_MAPS_API_KEY) return;
    let cancelled = false;

    loadGoogleMapsPlaces()
      .then(() => {
        if (cancelled) return;
        initGoogle();
      })
      .catch(() => {
        if (!cancelled) setGooglePlacesUnavailable(true);
      });

    return () => { cancelled = true; };
  }, [googlePlacesRequested, initGoogle]);

  const selectSuggestion = (nextValue: string) => {
    onChange(nextValue);
    clear();
    setFocused(false);
  };

  const showDropdown = focused && (suggestions.length > 0 || loading);
  const pos = showDropdown ? getPos() : null;
  const dropdown = showDropdown && pos ? (
    <div
      id="listing-location-dropdown-portal"
      style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {query ? "Location Suggestions" : "Popular Locations"}
        </span>
      </div>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
          className="flex w-full items-center px-4 py-2.5 text-left hover:bg-secondary transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
          <span className="flex-1 text-sm text-foreground truncate">{suggestion}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`flex items-center gap-2 bg-secondary rounded-xl border border-border focus-within:border-primary transition-colors min-w-0 ${
        compact ? "px-3 py-2" : "px-4 py-2.5 shrink-0 flex-1 min-w-[200px]"
      }`}
    >
      <Search className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-muted-foreground shrink-0`} />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true);
          setGooglePlacesRequested(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFocused(false);
          if (event.key === "Enter" && suggestions[0] && !value.trim()) selectSuggestion(suggestions[0]);
        }}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={compact ? "min-h-8 min-w-8 inline-flex items-center justify-center rounded-lg" : ""}
          aria-label="Clear location"
        >
          <X className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-muted-foreground`} />
        </button>
      )}
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
