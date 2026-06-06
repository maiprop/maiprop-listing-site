import { useState, useRef, useEffect } from "react";
import { Info, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import { FieldLabel, FieldError, FormInput as Input } from "@/components/listings/FormPrimitives";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
import { useNominatimAddressSuggestions } from "@/hooks/useNominatimAddressSuggestions";
import { getNominatimAddressLine, getNominatimCity, getNominatimMunicipality, getNominatimPostalCode } from "@/lib/locationSuggestions";
import type { ListingFormData } from "@/hooks/useListingForm";
import { tFallback } from "@/lib/i18nFallback";

interface ConnectionStatus {
  loading: boolean;
  supabaseOk: boolean;
  storageOk: boolean;
  locationOk: boolean;
  locationSource?: string;
}

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  setFieldRef: (key: string) => (el: HTMLElement | null) => void;
  connections: ConnectionStatus;
  stepActive: boolean;
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

export function StepLocation({ form, set, errors, setFieldRef, connections, stepActive }: Props) {
  const { t } = useTranslation();
  const [googlePlacesRequested, setGooglePlacesRequested] = useState(false);

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const googleAutocompleteRef = useRef<{ getPlace: () => GooglePlace } | null>(null);
  const nominatimQuery = [form.address, form.city].filter(Boolean).join(", ");
  const { rawSuggestions: suggestions, loading: addrLoading, clear: clearAddressSuggestions } =
    useNominatimAddressSuggestions(nominatimQuery);

  // Google Places autocomplete
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !stepActive || !googlePlacesRequested) return;
    let cancelled = false;

    type GPlacesAutoComplete = new (input: HTMLInputElement, opts: unknown) => {
      addListener: (event: string, cb: () => void) => void;
      getPlace: () => GooglePlace;
    };
    type GWindow = { google?: { maps?: { places?: { Autocomplete?: GPlacesAutoComplete } } } };

    const initGoogle = () => {
      const input = addressInputRef.current;
      const AutocompleteClass = (window as GWindow).google?.maps?.places?.Autocomplete;
      if (!input || googleAutocompleteRef.current) return;
      if (!AutocompleteClass) return;
      const autocomplete = new AutocompleteClass(input, {
        types: ["address"], componentRestrictions: { country: "gr" }, fields: ["address_components", "formatted_address", "geometry"],
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
        const latitude = place.geometry?.location?.lat?.();
        const longitude = place.geometry?.location?.lng?.();
        if (typeof latitude === "number" && Number.isFinite(latitude)) set("latitude", String(latitude));
        if (typeof longitude === "number" && Number.isFinite(longitude)) set("longitude", String(longitude));
      });
      googleAutocompleteRef.current = autocomplete;
    };

    loadGoogleMapsPlaces()
      .then(() => {
        if (!cancelled) initGoogle();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      googleAutocompleteRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepActive, googlePlacesRequested]);

  const allOk = connections.supabaseOk && connections.storageOk && connections.locationOk;
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const clearCoordinates = () => {
    set("latitude", "");
    set("longitude", "");
  };

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
            {connections.loading ? tr("createListing.location.checkingConnections", "Checking connections...") : allOk ? tr("createListing.location.allConnected", "All required services connected") : tr("createListing.location.needsAttention", "Some services need attention")}
          </span>
        </div>
        {!connections.loading && (
          <ul className="space-y-0.5 text-muted-foreground">
            <li>{tr("createListing.location.supabase", "Supabase")}: {connections.supabaseOk ? tr("createListing.location.connected", "Connected") : tr("createListing.location.unavailable", "Unavailable")}</li>
            <li>{tr("createListing.location.storage", "Storage (listing images)")}: {connections.storageOk ? tr("createListing.location.ready", "Ready") : tr("createListing.location.unavailable", "Unavailable")}</li>
            <li>{tr("createListing.location.autocomplete", "Location autocomplete")}: {connections.locationOk ? (connections.locationSource === "google" ? "Google Places" : "Nominatim (Greece)") : tr("createListing.location.notAvailable", "Not available")}</li>
          </ul>
        )}
      </div>

      <h2 className="font-display text-xl font-semibold">{tr("createListing.location.heading", "Location")}</h2>

      <div ref={setFieldRef("city") as React.Ref<HTMLDivElement>}>
        <FieldLabel required>{tr("createListing.location.city", "City")}</FieldLabel>
        <LocationAutocompleteInput
          mode="city"
          placeholder={tr("createListing.location.cityPlaceholder", "e.g. Athens")}
          value={form.city}
          onChange={(value) => {
            set("city", value);
            clearCoordinates();
          }}
          inputClassName={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${errors.city ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
        />
        <FieldError msg={errors.city} />
      </div>

      <div>
        <FieldLabel>{tr("createListing.location.streetAddress", "Street Address")} {GOOGLE_MAPS_API_KEY ? tr("createListing.location.googleHint", "(start typing for address suggestions)") : ""}</FieldLabel>
        <input
          ref={el => { addressInputRef.current = el; setFieldRef("address")(el); }}
          type="text"
          placeholder={GOOGLE_MAPS_API_KEY ? tr("createListing.location.addressGooglePlaceholder", "e.g. Voukourestiou 14, Athens") : tr("createListing.location.addressPlaceholder", "e.g. Voukourestiou 14")}
          value={form.address}
          onChange={e => {
            set("address", e.target.value);
            clearCoordinates();
          }}
          onFocus={() => setGooglePlacesRequested(true)}
          className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${errors.address ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
        />
        {addrLoading && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {tr("createListing.location.searchingAddress", "Searching address...")}
          </p>
        )}
        {!addrLoading && suggestions.length > 0 && (
          <div className="mt-1 bg-background border border-border rounded-xl shadow-md text-sm max-h-40 overflow-auto">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                onClick={() => {
                  set("address", getNominatimAddressLine(s));
                  const city = getNominatimCity(s);
                  const municipality = getNominatimMunicipality(s);
                  const postalCode = getNominatimPostalCode(s);
                  if (city) set("city", city);
                  if (municipality) set("region", municipality);
                  if (postalCode) set("postal_code", postalCode);
                  if (s.lat) set("latitude", s.lat);
                  if (s.lon) set("longitude", s.lon);
                  clearAddressSuggestions();
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted/80 border-b border-border last:border-0 first:rounded-t-xl last:rounded-b-xl">
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>{tr("createListing.location.regionMunicipality", "Region / Municipality")}</FieldLabel>
          <LocationAutocompleteInput
            mode="city"
            placeholder="Attica"
            value={form.region}
            onChange={(value) => set("region", value)}
            onSuggestionSelect={(selection) => set("region", selection.municipality || selection.city || selection.value)}
            inputClassName="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        <div><FieldLabel>{tr("createListing.location.postalCode", "Postal Code")}</FieldLabel><Input placeholder="10674" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>{tr("createListing.location.cadastreNumber", "Cadastre Number")}</FieldLabel><Input placeholder={tr("createListing.location.optional", "Optional")} value={form.cadastre_number} onChange={e => set("cadastre_number", e.target.value)} /></div>
        <div><FieldLabel>{tr("createListing.location.enfiaZone", "ENFIA Zone")}</FieldLabel><Input placeholder={tr("createListing.location.enfiaPlaceholder", "e.g. Zone 3")} value={form.enfia_zone} onChange={e => set("enfia_zone", e.target.value)} /></div>
      </div>
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>{tr("createListing.location.privacyHint", "Exact coordinates will be requested separately. Address is shown approximately on the map for privacy.")}</span>
      </div>
    </div>
  );
}
