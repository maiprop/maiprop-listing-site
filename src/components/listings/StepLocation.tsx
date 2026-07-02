import type { Ref } from "react";
import { Info, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GOOGLE_MAPS_API_KEY, GOOGLE_PLACES_AUTOCOMPLETE_ENABLED } from "@/lib/config";
import { FieldLabel, FieldError, FormInput as Input } from "@/components/listings/FormPrimitives";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
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

export function StepLocation({ form, set, errors, setFieldRef, connections, stepActive: _stepActive }: Props) {
  const { t } = useTranslation();
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

      <div ref={setFieldRef("address") as Ref<HTMLDivElement>}>
        <FieldLabel>
          {tr("createListing.location.streetAddress", "Street Address")}{" "}
          {(GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || GOOGLE_MAPS_API_KEY)
            ? tr("createListing.location.googleHint", "(start typing for address suggestions)")
            : ""}
        </FieldLabel>
        <LocationAutocompleteInput
          mode="address"
          value={form.address}
          onChange={(value) => {
            set("address", value);
            clearCoordinates();
          }}
          onSuggestionSelect={(selection) => {
            if (selection.addressLine) set("address", selection.addressLine);
            if (selection.city) set("city", selection.city);
            if (selection.municipality) set("region", selection.municipality);
            if (selection.postalCode) set("postal_code", selection.postalCode);
            if (selection.latitude) set("latitude", selection.latitude);
            if (selection.longitude) set("longitude", selection.longitude);
          }}
          placeholder={
            (GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || GOOGLE_MAPS_API_KEY)
              ? tr("createListing.location.addressGooglePlaceholder", "e.g. Voukourestiou 14, Athens")
              : tr("createListing.location.addressPlaceholder", "e.g. Voukourestiou 14")
          }
          inputClassName={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
            errors.address ? "border-destructive ring-1 ring-destructive/30" : "border-border"
          }`}
        />
        <FieldError msg={errors.address} />
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
