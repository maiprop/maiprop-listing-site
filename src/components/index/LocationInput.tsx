import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { MapPin, Clock, X } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";
import { getRecentSearches, removeRecentSearch } from "@/lib/recentSearches";

interface GMAutocompleteInstance {
  addListener(eventName: string, handler: () => void): void;
  getPlace(): { address_components?: Array<{ types: string[]; long_name: string }>; formatted_address?: string };
}

type GoogleMapsWindow = typeof window & {
  google?: { maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts: object) => GMAutocompleteInstance } } };
};

export function LocationInput({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const googleLoadedRef = useRef(false);
  const autocompleteRef = useRef<GMAutocompleteInstance | null>(null);

  const refresh = useCallback(() => setRecents(getRecentSearches()), []);

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
    if (!GOOGLE_MAPS_API_KEY || !inputRef.current || googleLoadedRef.current) return;
    const input = inputRef.current;
    const initGoogle = () => {
       
      const g = (window as GoogleMapsWindow).google;
      if (!g?.maps?.places?.Autocomplete) return;
      if (autocompleteRef.current) return;
      const autocomplete = new g.maps.places.Autocomplete(input, {
        types: ["(regions)"],
        componentRestrictions: { country: "gr" },
        fields: ["address_components", "formatted_address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const ac = place.address_components;
         
        const get = (t: string) => ac.find((c) => c.types.includes(t))?.long_name ?? "";
        const city =
          get("locality") ||
          get("administrative_area_level_2") ||
          get("administrative_area_level_1") ||
          place.formatted_address ||
          "";
        onChange(city);
      });
      autocompleteRef.current = autocomplete;
    };
     
    if ((window as GoogleMapsWindow).google?.maps?.places) {
      initGoogle();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => {
      googleLoadedRef.current = true;
      initGoogle();
    };
    document.head.appendChild(script);
    return () => { autocompleteRef.current = null; };
  }, [onChange]);

  const showDropdown = focused && recents.length > 0 && !value;
  const pos = showDropdown ? getPos() : null;

  const dropdown =
    showDropdown && pos ? (
      <div
        id="location-dropdown-portal"
        style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Searches</span>
        </div>
        {recents.map((r) => (
          <div
            key={r}
            className="flex items-center group px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(r); setFocused(false); onSearch(); }}
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
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 relative">
      <div className="flex items-center gap-2 px-4 py-2.5 h-full min-h-[44px]">
        <MapPin className="w-4 h-4 text-primary shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="City, area, or neighbourhood..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { refresh(); setFocused(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setFocused(false); onSearch(); }
            if (e.key === "Escape") setFocused(false);
          }}
          aria-label="Location search"
          className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none min-w-0"
          autoComplete="off"
        />
        {value && (
          <button onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
