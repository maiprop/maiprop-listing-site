import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin } from "lucide-react";
import { GOOGLE_PLACES_AUTOCOMPLETE_ENABLED } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import { useNominatimAddressSuggestions, type NominatimAddressSuggestion } from "@/hooks/useNominatimAddressSuggestions";
import {
  getNominatimAddressLine,
  getNominatimCity,
  getNominatimMunicipality,
  getNominatimPostalCode,
  getPopularLocationSuggestions,
  mergeLocationSuggestions,
} from "@/lib/locationSuggestions";
import { cn } from "@/lib/utils";

export interface LocationAutocompleteSelection {
  value: string;
  suggestion?: NominatimAddressSuggestion;
  addressLine?: string;
  city?: string;
  municipality?: string;
  postalCode?: string;
  latitude?: string;
  longitude?: string;
}

type GooglePlace = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: () => number;
      lng?: () => number;
    };
  };
};

type GoogleAutocompleteInstance = {
  addListener: (eventName: string, handler: () => void) => void;
  getPlace: () => GooglePlace;
};

type GoogleAutocompleteConstructor = new (
  input: HTMLInputElement,
  options: Record<string, unknown>,
) => GoogleAutocompleteInstance;

type GoogleWindow = typeof window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete?: GoogleAutocompleteConstructor;
      };
    };
  };
};

interface LocationAutocompleteInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> {
  value: string;
  onChange: (value: string) => void;
  mode?: "city" | "address";
  wrapperClassName?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  onSuggestionSelect?: (selection: LocationAutocompleteSelection) => void;
}

type SuggestionItem = {
  key: string;
  label: string;
  selection: LocationAutocompleteSelection;
};

const getGoogleAddressComponent = (place: GooglePlace, type: string) =>
  place.address_components?.find((component) => component.types.includes(type))?.long_name ?? "";

const getGoogleCoordinates = (place: GooglePlace) => {
  const latitude = place.geometry?.location?.lat?.();
  const longitude = place.geometry?.location?.lng?.();

  return {
    latitude: typeof latitude === "number" && Number.isFinite(latitude) ? String(latitude) : undefined,
    longitude: typeof longitude === "number" && Number.isFinite(longitude) ? String(longitude) : undefined,
  };
};

const buildGoogleSelection = (
  place: GooglePlace,
  mode: "city" | "address",
): LocationAutocompleteSelection => {
  const city =
    getGoogleAddressComponent(place, "locality") ||
    getGoogleAddressComponent(place, "postal_town") ||
    getGoogleAddressComponent(place, "administrative_area_level_3") ||
    getGoogleAddressComponent(place, "administrative_area_level_2") ||
    getGoogleAddressComponent(place, "administrative_area_level_1");
  const municipality =
    getGoogleAddressComponent(place, "administrative_area_level_2") ||
    getGoogleAddressComponent(place, "administrative_area_level_3") ||
    getGoogleAddressComponent(place, "administrative_area_level_1") ||
    city;
  const postalCode = getGoogleAddressComponent(place, "postal_code");
  const { latitude, longitude } = getGoogleCoordinates(place);

  if (mode === "city") {
    const value = city || municipality || place.formatted_address || "";
    return {
      value,
      city: city || value,
      municipality,
      postalCode,
      latitude,
      longitude,
    };
  }

  const street = getGoogleAddressComponent(place, "route");
  const number = getGoogleAddressComponent(place, "street_number");
  const addressLine = [number, street].filter(Boolean).join(" ") || place.formatted_address || "";

  return {
    value: addressLine,
    addressLine,
    city,
    municipality,
    postalCode,
    latitude,
    longitude,
  };
};

export function LocationAutocompleteInput({
  value,
  onChange,
  mode = "city",
  wrapperClassName,
  inputClassName,
  dropdownClassName,
  onSuggestionSelect,
  id,
  disabled,
  onFocus,
  onKeyDown,
  onBlur,
  ...inputProps
}: LocationAutocompleteInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const [googlePlacesRequested, setGooglePlacesRequested] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const googleInitializedRef = useRef(false);
  const googleSelectionAppliedRef = useRef(false);
  const textValue = value ?? "";
  const query = textValue.trim();
  const useGooglePlaces = GOOGLE_PLACES_AUTOCOMPLETE_ENABLED && googlePlacesRequested && !googleUnavailable;
  const useFallbackSuggestions = mode === "address" || !GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || googleUnavailable;
  const activeQuery = !disabled && focused && useFallbackSuggestions ? query : "";
  const { rawSuggestions, loading, clear } = useNominatimAddressSuggestions(activeQuery);
  const popularSuggestions = useMemo(() => getPopularLocationSuggestions(query), [query]);

  useEffect(() => {
    if (!focused) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  useEffect(() => {
    if (disabled) setFocused(false);
  }, [disabled]);

  useEffect(() => {
    if (disabled || !GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || !googlePlacesRequested || googleUnavailable) return;
    let cancelled = false;

    const initGoogle = () => {
      const input = inputRef.current;
      const Autocomplete = (window as GoogleWindow).google?.maps?.places?.Autocomplete;
      if (!input || googleInitializedRef.current) return;
      if (!Autocomplete) {
        setGoogleUnavailable(true);
        return;
      }

      const autocomplete = new Autocomplete(input, {
        types: mode === "city" ? ["(cities)"] : ["address"],
        ...(mode === "address" ? { componentRestrictions: { country: "gr" } } : {}),
        fields: ["address_components", "formatted_address", "geometry"],
      });

      autocomplete.addListener("place_changed", () => {
        const selection = buildGoogleSelection(autocomplete.getPlace(), mode);
        if (!selection.value) return;
        googleSelectionAppliedRef.current = true;
        onChange(selection.value);
        onSuggestionSelect?.(selection);
        clear();
        setFocused(false);
      });

      googleInitializedRef.current = true;
    };

    loadGoogleMapsPlaces()
      .then(() => {
        if (cancelled) return;
        initGoogle();
      })
      .catch(() => {
        if (!cancelled) setGoogleUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clear, disabled, googlePlacesRequested, googleUnavailable, mode, onChange, onSuggestionSelect]);

  const cityItems = useMemo<SuggestionItem[]>(() => {
    const nominatimCities = rawSuggestions.map(getNominatimCity).filter(Boolean);
    const labels = mergeLocationSuggestions(
      popularSuggestions,
      nominatimCities,
      query && popularSuggestions.length === 0 && nominatimCities.length === 0 ? [query] : [],
    ).slice(0, 8);

    return labels.map((label) => {
      const suggestion = rawSuggestions.find((item) => getNominatimCity(item).toLowerCase() === label.toLowerCase());
      return {
        key: `city-${label}`,
        label,
        selection: {
          value: label,
          suggestion,
          city: label,
          municipality: suggestion ? getNominatimMunicipality(suggestion) : "",
          postalCode: suggestion ? getNominatimPostalCode(suggestion) : "",
          latitude: suggestion?.lat,
          longitude: suggestion?.lon,
        },
      };
    });
  }, [popularSuggestions, query, rawSuggestions]);

  const addressItems = useMemo<SuggestionItem[]>(() => (
    rawSuggestions.map((suggestion, index) => {
      const addressLine = getNominatimAddressLine(suggestion);
      return {
        key: `address-${suggestion.display_name}-${index}`,
        label: suggestion.display_name,
        selection: {
          value: addressLine,
          suggestion,
          addressLine,
          city: getNominatimCity(suggestion),
          municipality: getNominatimMunicipality(suggestion),
          postalCode: getNominatimPostalCode(suggestion),
          latitude: suggestion.lat,
          longitude: suggestion.lon,
        },
      };
    }).slice(0, 8)
  ), [rawSuggestions]);

  const items = mode === "address" ? addressItems : cityItems;
  const showDropdown = focused && !disabled && useFallbackSuggestions && (items.length > 0 || loading);
  const listboxId = `${inputId}-listbox`;

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const rect = wrapRef.current.getBoundingClientRect();
    return { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width };
  };

  const selectItem = (item: SuggestionItem) => {
    onChange(item.selection.value);
    onSuggestionSelect?.(item.selection);
    clear();
    setFocused(false);
  };

  const pos = showDropdown ? getPos() : null;
  const dropdown = showDropdown && pos ? (
    <div
      id={listboxId}
      ref={dropdownRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className={cn("bg-card border border-border rounded-xl shadow-elevated overflow-hidden", dropdownClassName)}
      role="listbox"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/40">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {mode === "address" ? "Address Suggestions" : query ? "Location Suggestions" : "Popular Locations"}
        </span>
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectItem(item)}
          className="flex w-full items-center px-3 py-2.5 text-left hover:bg-secondary transition-colors border-b border-border last:border-0"
          role="option"
        >
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-2.5 shrink-0" />
          <span className="flex-1 text-sm text-foreground truncate">{item.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={cn("relative w-full", wrapperClassName)}>
      <input
        {...inputProps}
        id={inputId}
        ref={inputRef}
        type="text"
        value={textValue}
        disabled={disabled}
        onFocus={(event) => {
          setFocused(true);
          setGooglePlacesRequested(true);
          onFocus?.(event);
        }}
        onChange={(event) => {
          googleSelectionAppliedRef.current = false;
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape") setFocused(false);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (event.defaultPrevented) return;
          const nextTarget = event.relatedTarget as Node | null;
          if (nextTarget && dropdownRef.current?.contains(nextTarget)) return;
          if (googleSelectionAppliedRef.current) {
            googleSelectionAppliedRef.current = false;
            setFocused(false);
            return;
          }
          if (!useGooglePlaces && mode === "address" && items.length > 0) {
            selectItem(items[0]);
            return;
          }
          setFocused(false);
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={showDropdown ? listboxId : undefined}
        aria-expanded={showDropdown}
        autoComplete={inputProps.autoComplete ?? "new-password"}
        autoCorrect={inputProps.autoCorrect ?? "off"}
        autoCapitalize={inputProps.autoCapitalize ?? "none"}
        spellCheck={inputProps.spellCheck ?? false}
        enterKeyHint={inputProps.enterKeyHint ?? (mode === "city" ? "search" : "next")}
        className={inputClassName}
      />
      {dropdown && typeof document !== "undefined" ? ReactDOM.createPortal(dropdown, document.body) : null}
    </div>
  );
}
