import { useState, useRef, useEffect } from "react";
import { Info, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import { FieldLabel, FieldError, FormInput as Input } from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";

interface ConnectionStatus {
  loading: boolean;
  supabaseOk: boolean;
  storageOk: boolean;
  locationOk: boolean;
  locationSource?: string;
}

interface NominatimHit {
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
}

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  setFieldRef: (key: string) => (el: HTMLElement | null) => void;
  connections: ConnectionStatus;
  stepActive: boolean;
}

export function StepLocation({ form, set, errors, setFieldRef, connections, stepActive }: Props) {
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [googlePlacesRequested, setGooglePlacesRequested] = useState(false);

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const googleAutocompleteRef = useRef<{ getPlace: () => { address_components?: Array<{ long_name: string; short_name: string; types: string[] }>; formatted_address?: string } } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Nominatim autocomplete (no Google key)
  useEffect(() => {
    if (GOOGLE_MAPS_API_KEY) { setSuggestions([]); return; }
    const q = [form.address, form.city].filter(Boolean).join(", ").trim();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (q.length < 3) { setSuggestions([]); setAddrLoading(false); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setAddrLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=gr&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "el,en", "User-Agent": "maiprop-listing-site" }, signal: controller.signal }
        );
        const json = await res.json().catch(() => []) as Array<{ display_name: string; address: NominatimHit["address"] }>;
        if (!controller.signal.aborted && Array.isArray(json)) {
          setSuggestions(json.map(r => ({ display_name: r.display_name, address: r.address })));
        } else {
          setSuggestions([]);
        }
      } catch (_err: unknown) {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setAddrLoading(false);
      }
    }, 400);
    return () => { clearTimeout(t); controller.abort(); };
  }, [form.address, form.city]);

  // Google Places autocomplete
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !stepActive || !googlePlacesRequested) return;
    let cancelled = false;

    type GPlacesAutoComplete = new (input: HTMLInputElement, opts: unknown) => {
      addListener: (event: string, cb: () => void) => void;
      getPlace: () => { address_components?: Array<{ long_name: string; short_name: string; types: string[] }>; formatted_address?: string };
    };
    type GWindow = { google?: { maps?: { places?: { Autocomplete?: GPlacesAutoComplete } } } };

    const initGoogle = () => {
      const input = addressInputRef.current;
      const AutocompleteClass = (window as GWindow).google?.maps?.places?.Autocomplete;
      if (!input || !AutocompleteClass || googleAutocompleteRef.current) return;
      const autocomplete = new AutocompleteClass(input, {
        types: ["address"], componentRestrictions: { country: "gr" }, fields: ["address_components", "formatted_address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        const ac = place.address_components;
        const get = (type: string) => ac.find(c => c.types.includes(type))?.long_name ?? "";
        const street = get("route");
        const number = get("street_number");
        const city = get("locality") || get("administrative_area_level_2") || get("administrative_area_level_1");
        const state = get("administrative_area_level_1");
        const postcode = get("postal_code");
        set("address", [number, street].filter(Boolean).join(" ") || place.formatted_address || form.address);
        if (city) set("city", city);
        if (state) set("region", state);
        if (postcode) set("postal_code", postcode);
      });
      googleAutocompleteRef.current = autocomplete;
    };

    loadGoogleMapsPlaces()
      .then(() => {
        if (!cancelled) initGoogle();
      })
      .catch(() => {
        // Manual address entry remains available if Places cannot load.
      });

    return () => {
      cancelled = true;
      googleAutocompleteRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepActive, googlePlacesRequested]);

  const allOk = connections.supabaseOk && connections.storageOk && connections.locationOk;

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className={`rounded-xl border p-3 text-xs ${allOk ? "border-brand-emerald/30 bg-brand-emerald/5" : "border-destructive/30 bg-destructive/5"}`}>
        <div className="flex items-center gap-2 font-semibold mb-2">
          {connections.loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            : <span className={allOk ? "text-brand-emerald" : "text-destructive"}>{allOk ? "✓" : "!"}</span>
          }
          <span className={allOk ? "text-brand-emerald" : "text-destructive"}>
            {connections.loading ? "Checking connections…" : allOk ? "All required services connected" : "Some services need attention"}
          </span>
        </div>
        {!connections.loading && (
          <ul className="space-y-0.5 text-muted-foreground">
            <li>Supabase: {connections.supabaseOk ? "✓ Connected" : "✗ Unavailable"}</li>
            <li>Storage (listing images): {connections.storageOk ? "✓ Ready" : "✗ Unavailable"}</li>
            <li>Location autocomplete: {connections.locationOk ? (connections.locationSource === "google" ? "✓ Google Places" : "✓ Nominatim (Greece)") : "✗ Not available"}</li>
          </ul>
        )}
      </div>

      <h2 className="font-display text-xl font-semibold">Location</h2>

      <div ref={setFieldRef("city") as React.Ref<HTMLDivElement>}>
        <FieldLabel required>City</FieldLabel>
        <Input placeholder="e.g. Athens" value={form.city} onChange={e => set("city", e.target.value)} hasError={!!errors.city} />
        <FieldError msg={errors.city} />
      </div>

      <div>
        <FieldLabel>Street Address {GOOGLE_MAPS_API_KEY ? "(start typing for Google suggestions)" : ""}</FieldLabel>
        <input
          ref={el => { addressInputRef.current = el; setFieldRef("address")(el); }}
          type="text"
          placeholder={GOOGLE_MAPS_API_KEY ? "e.g. Voukourestiou 14, Athens" : "e.g. Voukourestiou 14"}
          value={form.address}
          onChange={e => set("address", e.target.value)}
          onFocus={() => setGooglePlacesRequested(true)}
          className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${errors.address ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
        />
        {addrLoading && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Searching address…
          </p>
        )}
        {!addrLoading && suggestions.length > 0 && (
          <div className="mt-1 bg-background border border-border rounded-xl shadow-md text-sm max-h-40 overflow-auto">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                onClick={() => {
                  set("address", s.address?.road ? [s.address.house_number, s.address.road].filter(Boolean).join(" ") : s.display_name);
                  if (s.address?.city) set("city", s.address.city);
                  else if (s.address?.town) set("city", s.address.town);
                  else if (s.address?.village) set("city", s.address.village);
                  if (s.address?.state) set("region", s.address.state);
                  if (s.address?.postcode) set("postal_code", s.address.postcode);
                  setSuggestions([]);
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted/80 border-b border-border last:border-0 first:rounded-t-xl last:rounded-b-xl">
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Region / Municipality</FieldLabel><Input placeholder="Attica" value={form.region} onChange={e => set("region", e.target.value)} /></div>
        <div><FieldLabel>Postal Code</FieldLabel><Input placeholder="10674" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Cadastre Number</FieldLabel><Input placeholder="Optional" value={form.cadastre_number} onChange={e => set("cadastre_number", e.target.value)} /></div>
        <div><FieldLabel>ENFIA Zone</FieldLabel><Input placeholder="e.g. Zone 3" value={form.enfia_zone} onChange={e => set("enfia_zone", e.target.value)} /></div>
      </div>
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>Exact coordinates will be requested separately. Address is shown approximately on the map for privacy.</span>
      </div>
    </div>
  );
}
