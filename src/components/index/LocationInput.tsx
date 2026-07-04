import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { MapPin, Clock, Loader2, X } from "lucide-react";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { getRecentSearches, removeRecentSearch } from "@/lib/recentSearches";
import { formatAddressPrediction, type AddressPrediction } from "@/lib/location/addressFormat";

export function LocationInput({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (value?: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = value.trim();
  const { predictions, loading: suggestionsLoading, clear: clearSuggestions } = useAddressAutocomplete(query, {
    mode: "city",
    enabled: focused,
    includePopular: true,
  });

  const refresh = useCallback(() => setRecents(getRecentSearches()), []);

  const locationSuggestions = useMemo(
    () => predictions
      .filter((suggestion) => !recents.some((recent) => recent.toLowerCase() === suggestion.value.toLowerCase()))
      .slice(0, 8),
    [predictions, recents],
  );

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

  useEffect(() => {
    refresh();
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("location-dropdown-portal");
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (portal?.contains(e.target as Node)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refresh]);

  useEffect(() => {
    if (document.activeElement === inputRef.current) setFocused(true);
  }, [value]);

  const chooseLocation = (location: string) => {
    onChange(location);
    clearSuggestions();
    setFocused(false);
    onSearch(location);
  };

  const choosePrediction = (prediction: AddressPrediction) => {
    chooseLocation(prediction.value);
  };

  const showRecents = focused && recents.length > 0 && !query;
  const showLocationSuggestions = focused && (!showRecents || Boolean(query)) && (locationSuggestions.length > 0 || suggestionsLoading);
  const showDropdown = showRecents || showLocationSuggestions;
  const pos = showDropdown ? getPos() : null;
  const listboxId = "location-dropdown-portal";

  const dropdown =
    showDropdown && pos ? (
      <div
        id="location-dropdown-portal"
        role="listbox"
        aria-label={query ? "Location suggestions" : "Location options"}
        style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
      >
        {showRecents && (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Searches</span>
            </div>
            {recents.map((r) => (
              <div
                key={r}
                role="option"
                aria-selected="false"
                className="flex items-center group px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseLocation(r)}
              >
                <Clock className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
                <span className="flex-1 text-sm text-foreground truncate">{r}</span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeRecentSearch(r);
                    refresh();
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-border transition-all text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${r} from recent searches`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </>
        )}
        {showLocationSuggestions && (
          <>
            <div className={`${showRecents ? "border-t" : ""} flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40`}>
              {suggestionsLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {query ? "Location Suggestions" : "Popular Locations"}
              </span>
            </div>
            {locationSuggestions.map((suggestion) => {
              const formatted = formatAddressPrediction(suggestion);
              return (
              <button
                key={suggestion.id}
                type="button"
                role="option"
                aria-selected="false"
                aria-label={formatted.subtitle ? `${formatted.title}, ${formatted.subtitle}` : formatted.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choosePrediction(suggestion)}
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
          </>
        )}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 relative">
      <div className="flex items-center gap-2 px-4 py-2.5 h-full min-h-[44px]">
        <MapPin className="w-4 h-4 text-primary shrink-0" />
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <input
            ref={inputRef}
            type="search"
            name="maiprop-home-location-search"
            placeholder="City, area, or neighbourhood..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { refresh(); setFocused(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setFocused(false); onSearch(value); }
              if (e.key === "Escape") setFocused(false);
            }}
            aria-label="Location search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? listboxId : undefined}
            className="block w-full min-w-0 truncate bg-transparent text-sm font-medium leading-5 text-foreground placeholder:text-muted-foreground outline-none"
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
        </div>
        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Clear location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
