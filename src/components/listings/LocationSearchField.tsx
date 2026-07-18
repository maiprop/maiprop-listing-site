import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { GooglePlacesAttribution } from "@/components/location/GooglePlacesAttribution";
import { formatAddressPrediction, type AddressPrediction } from "@/lib/location/addressFormat";
import {
  filterAddressPredictionsForQuery,
  getListingLocationRadiusM,
  getListingLocationSearchValue,
  rankAddressPredictionsForQuery,
} from "@/lib/location/locationSearchSemantics";

const PENDING_ENTER_PROVIDER_GRACE_MS = 700;

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
  const pendingEnterTimerRef = useRef<number | undefined>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = draftValue.trim();
  const shouldUsePredictions = focused;
  const { predictions, loading, clear } = useAddressAutocomplete(query, {
    mode: "city",
    enabled: shouldUsePredictions,
    includePopular: true,
  });
  const rankedPredictions = useMemo(
    () => rankAddressPredictionsForQuery(filterAddressPredictionsForQuery(predictions, query), query),
    [predictions, query],
  );

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

  useEffect(() => {
    if (focused) return;
    if (selectedDraftRef.current && value !== selectedDraftRef.current) return;
    selectedDraftRef.current = null;
    setDraftValue(value);
  }, [focused, value]);

  const cancelPendingEnter = useCallback(() => {
    pendingEnterRef.current = false;
    if (pendingEnterTimerRef.current !== undefined) {
      window.clearTimeout(pendingEnterTimerRef.current);
      pendingEnterTimerRef.current = undefined;
    }
  }, []);

  const selectSuggestion = useCallback(async (prediction: AddressPrediction) => {
    cancelPendingEnter();
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
      radiusM: getListingLocationRadiusM(selection),
      provider: selection.provider,
      placeId: selection.placeId,
    });
    clear();
    setFocused(false);
    inputRef.current?.blur();
  }, [cancelPendingEnter, clear, onChange]);

  const commitManualSearch = useCallback(() => {
    const committedValue = draftValue.trim();
    if (!committedValue) return;
    cancelPendingEnter();
    selectedDraftRef.current = committedValue;
    setDraftValue(committedValue);
    onChange(committedValue);
    clear();
    setFocused(false);
    inputRef.current?.blur();
  }, [cancelPendingEnter, clear, draftValue, onChange]);

  const closeWithoutCommit = useCallback(() => {
    cancelPendingEnter();
    selectedDraftRef.current = null;
    setDraftValue(value);
    clear();
    setFocused(false);
  }, [cancelPendingEnter, clear, value]);

  useEffect(() => {
    if (!focused) return undefined;
    const handler = (event: MouseEvent) => {
      const portal = document.getElementById("listing-location-dropdown-portal");
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (portal?.contains(event.target as Node)) return;
      closeWithoutCommit();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeWithoutCommit, focused]);

  useEffect(() => {
    return cancelPendingEnter;
  }, [cancelPendingEnter]);

  useEffect(() => {
    if (!pendingEnterRef.current || loading) return;
    cancelPendingEnter();
    if (rankedPredictions[0]) {
      void selectSuggestion(rankedPredictions[0]);
      return;
    }
    commitManualSearch();
  }, [cancelPendingEnter, commitManualSearch, loading, rankedPredictions, selectSuggestion]);

  const showDropdown = focused && shouldUsePredictions && (rankedPredictions.length > 0 || loading);
  const hasGoogleSuggestions = rankedPredictions.some((suggestion) => suggestion.provider === "google");
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
      {rankedPredictions.map((suggestion) => {
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
          const nextValue = event.target.value;
          selectedDraftRef.current = null;
          setDraftValue(nextValue);
          if (!nextValue.trim()) {
            onChange("");
            clear();
          }
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onClick={() => {
          setFocused(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeWithoutCommit();
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (loading) {
            pendingEnterRef.current = true;
            if (pendingEnterTimerRef.current !== undefined) {
              window.clearTimeout(pendingEnterTimerRef.current);
            }
            pendingEnterTimerRef.current = window.setTimeout(() => {
              if (!pendingEnterRef.current) return;
              pendingEnterRef.current = false;
              pendingEnterTimerRef.current = undefined;
              commitManualSearch();
            }, PENDING_ENTER_PROVIDER_GRACE_MS);
            return;
          }
          if (rankedPredictions[0]) {
            void selectSuggestion(rankedPredictions[0]);
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
            cancelPendingEnter();
            selectedDraftRef.current = null;
            setDraftValue("");
            onChange("");
            clear();
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
