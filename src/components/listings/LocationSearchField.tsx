import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { GooglePlacesAttribution } from "@/components/location/GooglePlacesAttribution";
import { formatAddressPrediction, type AddressPrediction } from "@/lib/location/addressFormat";
import { getListingLocationSearchValue } from "@/lib/location/locationSearchSemantics";

export type ListingLocationSelection = {
  value: string;
  latitude?: string;
  longitude?: string;
  radiusM?: number;
  provider?: AddressPrediction["provider"];
  placeId?: string;
};

interface LocationSearchFieldProps {
  value: string;
  onChange: (value: string, selection?: ListingLocationSelection) => void;
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
  const [draftValue, setDraftValue] = useState(value);
  const selectedDraftRef = useRef<string | null>(null);
  const pendingEnterRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = draftValue.trim();
  const shouldUsePredictions = focused;
  const { predictions, loading, clear } = useAddressAutocomplete(query, {
    mode: "city",
    enabled: shouldUsePredictions,
    includePopular: true,
  });

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

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
  }, [draftValue]);

  useEffect(() => {
    if (focused) return;
    if (selectedDraftRef.current && value !== selectedDraftRef.current) return;
    selectedDraftRef.current = null;
    setDraftValue(value);
  }, [focused, value]);

  const commitManualSearch = useCallback(() => {
    const committedValue = draftValue.trim();
    if (!committedValue) return;
    selectedDraftRef.current = committedValue;
    setDraftValue(committedValue);
    onChange(committedValue);
    clear();
    setFocused(false);
  }, [clear, draftValue, onChange]);

  const selectSuggestion = useCallback(async (prediction: AddressPrediction) => {
    const selection = prediction.resolveDetails
      ? await prediction.resolveDetails().catch(() => prediction)
      : prediction;
    const filterValue = getListingLocationSearchValue(selection);
    if (!filterValue) return;
    selectedDraftRef.current = filterValue;
    setDraftValue(filterValue);
    onChange(filterValue, {
      value: filterValue,
      latitude: selection.latitude,
      longitude: selection.longitude,
      radiusM: selection.latitude && selection.longitude ? 750 : undefined,
      provider: selection.provider,
      placeId: selection.placeId,
    });
    clear();
    setFocused(false);
  }, [clear, onChange]);

  useEffect(() => {
    if (!pendingEnterRef.current || loading) return;
    pendingEnterRef.current = false;
    if (predictions[0]) {
      void selectSuggestion(predictions[0]);
      return;
    }
    commitManualSearch();
  }, [commitManualSearch, loading, predictions, selectSuggestion]);

  const showDropdown = focused && shouldUsePredictions && (predictions.length > 0 || loading);
  const hasGoogleSuggestions = predictions.some((suggestion) => suggestion.provider === "google");
  const pos = showDropdown ? getPos() : null;
  const listboxId = "listing-location-dropdown-portal";
  const dropdown = showDropdown && pos ? (
    <div
      id={listboxId}
      role="listbox"
      aria-label={query ? "Location suggestions" : "Location options"}
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
      {predictions.map((suggestion) => {
        const formatted = formatAddressPrediction(suggestion);
        return (
        <button
          key={suggestion.id}
          type="button"
          role="option"
          aria-selected="false"
          aria-label={formatted.subtitle ? `${formatted.title}, ${formatted.subtitle}` : formatted.title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            void selectSuggestion(suggestion);
          }}
          className="flex w-full items-center px-4 py-2.5 text-left hover:bg-secondary transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{formatted.title}</span>
            {formatted.subtitle && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatted.subtitle}</span>
            )}
          </span>
        </button>
        );
      })}
      {hasGoogleSuggestions && <GooglePlacesAttribution />}
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
        type="search"
        name="maiprop-listing-location-search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          onChange(event.target.value);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFocused(false);
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (loading) {
            pendingEnterRef.current = true;
            return;
          }
          if (predictions[0]) {
            void selectSuggestion(predictions[0]);
            return;
          }
          commitManualSearch();
        }}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
      />
      {draftValue && (
        <button
          type="button"
          onClick={() => {
            setDraftValue("");
            onChange("");
          }}
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
