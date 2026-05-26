import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { MapPin, Clock, Loader2, X } from "lucide-react";
import { useNominatimAddressSuggestions } from "@/hooks/useNominatimAddressSuggestions";
import { getRecentSearches, removeRecentSearch } from "@/lib/recentSearches";
import { getPopularLocationSuggestions, mergeLocationSuggestions } from "@/lib/locationSuggestions";

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
  const popularSuggestions = useMemo(() => getPopularLocationSuggestions(query), [query]);
  const shouldUseNominatim = Boolean(query) && popularSuggestions.length === 0;
  const { suggestions: nominatimSuggestions, loading: suggestionsLoading, clear: clearSuggestions } =
    useNominatimAddressSuggestions(shouldUseNominatim ? query : "");

  const refresh = useCallback(() => setRecents(getRecentSearches()), []);

  const locationSuggestions = useMemo(
    () => mergeLocationSuggestions(
      popularSuggestions,
      shouldUseNominatim ? [query] : [],
      shouldUseNominatim ? nominatimSuggestions : [],
    ).filter((suggestion) => !recents.some((recent) => recent.toLowerCase() === suggestion.toLowerCase())).slice(0, 8),
    [nominatimSuggestions, popularSuggestions, query, recents, shouldUseNominatim],
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

  const showRecents = focused && recents.length > 0 && !query;
  const showLocationSuggestions = focused && (!showRecents || Boolean(query)) && (locationSuggestions.length > 0 || suggestionsLoading);
  const showDropdown = showRecents || showLocationSuggestions;
  const pos = showDropdown ? getPos() : null;

  const dropdown =
    showDropdown && pos ? (
      <div
        id="location-dropdown-portal"
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
            {locationSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseLocation(suggestion)}
                className="flex w-full items-center px-4 py-2.5 text-left hover:bg-secondary transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
                <span className="flex-1 text-sm text-foreground truncate">{suggestion}</span>
              </button>
            ))}
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
            type="text"
            placeholder="City, area, or neighbourhood..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { refresh(); setFocused(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setFocused(false); onSearch(value); }
              if (e.key === "Escape") setFocused(false);
            }}
            aria-label="Location search"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            className="block w-full min-w-0 truncate bg-transparent text-sm font-medium leading-5 text-foreground placeholder:text-muted-foreground outline-none"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
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
