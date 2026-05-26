import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin } from "lucide-react";
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
  ...inputProps
}: LocationAutocompleteInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textValue = value ?? "";
  const query = textValue.trim();
  const activeQuery = !disabled && focused ? query : "";
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
  const showDropdown = focused && !disabled && (items.length > 0 || loading);

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
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape") setFocused(false);
        }}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        autoComplete="off"
        className={inputClassName}
      />
      {dropdown && typeof document !== "undefined" ? ReactDOM.createPortal(dropdown, document.body) : null}
    </div>
  );
}
