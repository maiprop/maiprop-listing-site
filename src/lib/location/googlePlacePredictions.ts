import { GOOGLE_PLACES_AUTOCOMPLETE_ENABLED } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import type { AddressPrediction } from "@/lib/location/addressFormat";
import { isBroadAdministrativePrediction } from "@/lib/location/locationSearchSemantics";

type GoogleText = { toString?: () => string } | string;

type GooglePlaceComponent = {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleLatLng = {
  lat?: (() => number) | number;
  lng?: (() => number) | number;
};

type GooglePlace = {
  fetchFields?: (request: { fields: string[] }) => Promise<void>;
  formattedAddress?: string;
  formatted_address?: string;
  displayName?: string;
  location?: GoogleLatLng;
  geometry?: { location?: GoogleLatLng };
  addressComponents?: GooglePlaceComponent[];
  address_components?: GooglePlaceComponent[];
  types?: string[];
};

type GooglePlacePrediction = {
  placeId?: string;
  place_id?: string;
  description?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  text?: GoogleText;
  mainText?: GoogleText;
  secondaryText?: GoogleText;
  types?: string[];
  toPlace?: () => GooglePlace;
};

type GoogleAutocompleteSuggestion = {
  placePrediction?: GooglePlacePrediction;
};

type GooglePlacesLibrary = {
  AutocompleteSessionToken?: new () => unknown;
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions?: (request: Record<string, unknown>) => Promise<{
      suggestions?: GoogleAutocompleteSuggestion[];
    }>;
  };
};

type LegacyGoogleAutocompleteStatus = "OK" | "ZERO_RESULTS" | string;

type LegacyGoogleAutocompleteService = {
  getPlacePredictions: (
    request: Record<string, unknown>,
    callback: (predictions: GooglePlacePrediction[] | null, status: LegacyGoogleAutocompleteStatus) => void,
  ) => void;
};

type GooglePlacesWindow = typeof window & {
  google?: {
    maps?: {
      importLibrary?: (library: "places") => Promise<GooglePlacesLibrary>;
      places?: {
        AutocompleteService?: new () => LegacyGoogleAutocompleteService;
        PlacesServiceStatus?: {
          OK?: string;
          ZERO_RESULTS?: string;
        };
      };
    };
  };
};

const GOOGLE_AUTOCOMPLETE_LIMIT = 6;

const textToString = (value: GoogleText | undefined) =>
  typeof value === "string" ? value : value?.toString?.() ?? "";

const coordinateToString = (value: (() => number) | number | undefined) => {
  const numberValue = typeof value === "function" ? value() : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue) ? String(numberValue) : undefined;
};

const findComponent = (components: GooglePlaceComponent[] | undefined, type: string) =>
  components?.find((component) => component.types?.includes(type));

const componentText = (components: GooglePlaceComponent[] | undefined, type: string) => {
  const component = findComponent(components, type);
  return component?.longText ?? component?.long_name ?? component?.shortText ?? component?.short_name ?? "";
};

const compact = (...values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

const inferLocalityFromSubtitle = (subtitle: string) => {
  const ignored = new Set([
    "greece",
    "ellada",
    "attica",
    "attikis",
    "perifereia attikis",
    "περιφερεια αττικης",
    "αττικη",
    "αττικης",
    "ελλαδα",
  ]);
  return subtitle
    .split(",")
    .map((part) => part.trim())
    .find((part) => {
      const normalized = part
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("el-GR");
      return part && !ignored.has(normalized);
    }) ?? "";
};

const buildDetailedPrediction = (
  prediction: GooglePlacePrediction,
  place: GooglePlace,
  mode: "city" | "address",
): AddressPrediction => {
  const components = place.addressComponents ?? place.address_components;
  const formattedAddress = place.formattedAddress ?? place.formatted_address ?? textToString(prediction.text);
  const location = place.location ?? place.geometry?.location;
  const latitude = coordinateToString(location?.lat);
  const longitude = coordinateToString(location?.lng);
  const googleTypes = place.types ?? prediction.types ?? [];
  const city =
    componentText(components, "locality") ||
    componentText(components, "postal_town") ||
    componentText(components, "administrative_area_level_3");
  const municipality =
    componentText(components, "administrative_area_level_2") ||
    componentText(components, "administrative_area_level_3");
  const region = componentText(components, "administrative_area_level_1");
  const postalCode = componentText(components, "postal_code");
  const street = componentText(components, "route");
  const number = componentText(components, "street_number");
  const addressLine = compact(number, street).join(" ") || formattedAddress;
  const title = mode === "city" ? city || municipality || formattedAddress : addressLine;

  const mapped: AddressPrediction = {
    id: `google:${prediction.placeId ?? formattedAddress}`,
    provider: "google",
    placeId: prediction.placeId,
    googleTypes,
    value: title,
    title,
    subtitle: compact(city && city !== title ? city : "", municipality, region, postalCode).join(" - "),
    fullAddress: formattedAddress,
    addressLine,
    city,
    municipality,
    region,
    postalCode,
    country: componentText(components, "country"),
    latitude,
    longitude,
    source: prediction,
  };
  return {
    ...mapped,
    isBroadAdministrativeArea: isBroadAdministrativePrediction(mapped),
  };
};

async function resolveGoogleDetails(
  prediction: GooglePlacePrediction,
  mode: "city" | "address",
): Promise<AddressPrediction> {
  const place = prediction.toPlace?.();
  if (!place) {
    return buildBasicGooglePrediction(prediction, mode);
  }

  await place.fetchFields?.({
    fields: ["formattedAddress", "location", "addressComponents", "displayName", "types"],
  });

  return buildDetailedPrediction(prediction, place, mode);
}

function buildBasicGooglePrediction(
  prediction: GooglePlacePrediction,
  mode: "city" | "address",
): AddressPrediction {
  const text = textToString(prediction.text) || prediction.description || "";
  const title = textToString(prediction.mainText) || prediction.structured_formatting?.main_text || text;
  const subtitle = textToString(prediction.secondaryText) || prediction.structured_formatting?.secondary_text || "";
  const googleTypes = prediction.types ?? [];
  const inferredLocality = mode === "address" ? inferLocalityFromSubtitle(subtitle) : "";
  const broadTypeHint =
    googleTypes.includes("administrative_area_level_1") ||
    googleTypes.includes("country");

  const mapped: AddressPrediction = {
    id: `google:${prediction.placeId ?? prediction.place_id ?? text}`,
    provider: "google",
    placeId: prediction.placeId ?? prediction.place_id,
    googleTypes,
    value: title,
    title,
    subtitle,
    addressLine: mode === "address" ? title : undefined,
    city: mode === "city" && !broadTypeHint ? title : inferredLocality || undefined,
    fullAddress: text,
    source: prediction,
    resolveDetails: () => resolveGoogleDetails(prediction, mode),
  };
  return {
    ...mapped,
    isBroadAdministrativeArea: isBroadAdministrativePrediction(mapped),
  };
}

async function fetchLegacyGooglePlacePredictions(
  query: string,
  mode: "city" | "address",
  signal?: AbortSignal,
): Promise<AddressPrediction[]> {
  const places = (window as GooglePlacesWindow).google?.maps?.places;
  const AutocompleteService = places?.AutocompleteService;
  if (!AutocompleteService || signal?.aborted) return [];

  const service = new AutocompleteService();
  const predictions = await new Promise<GooglePlacePrediction[]>((resolve) => {
    service.getPlacePredictions({
      input: query,
      componentRestrictions: { country: "gr" },
      language: "el",
      region: "gr",
      types: mode === "city" ? ["(regions)"] : ["address"],
    }, (items, status) => {
      if (signal?.aborted) {
        resolve([]);
        return;
      }
      const okStatus = places?.PlacesServiceStatus?.OK ?? "OK";
      const zeroStatus = places?.PlacesServiceStatus?.ZERO_RESULTS ?? "ZERO_RESULTS";
      if (status === zeroStatus) {
        resolve([]);
        return;
      }
      resolve(status === okStatus && Array.isArray(items) ? items : []);
    });
  });

  return predictions
    .map((prediction) => buildBasicGooglePrediction(prediction, mode))
    .filter((prediction) => prediction.value)
    .slice(0, GOOGLE_AUTOCOMPLETE_LIMIT);
}

export async function fetchGooglePlacePredictions(
  query: string,
  mode: "city" | "address",
  signal?: AbortSignal,
): Promise<AddressPrediction[]> {
  if (!GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || typeof window === "undefined" || signal?.aborted) return [];

  await loadGoogleMapsPlaces();
  if (signal?.aborted) return [];

  const legacyPredictions = await fetchLegacyGooglePlacePredictions(query, mode, signal);
  if (legacyPredictions.length > 0) return legacyPredictions;
  if (signal?.aborted) return [];

  const places = await (window as GooglePlacesWindow).google?.maps?.importLibrary?.("places");
  const AutocompleteSuggestion = places?.AutocompleteSuggestion;
  const AutocompleteSessionToken = places?.AutocompleteSessionToken;
  if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions || !AutocompleteSessionToken) {
    return fetchLegacyGooglePlacePredictions(query, mode, signal);
  }

  const sessionToken = new AutocompleteSessionToken();
  let response: { suggestions?: GoogleAutocompleteSuggestion[] };
  try {
    response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ["gr"],
      language: "el",
      region: "gr",
      sessionToken,
    });
  } catch (_error) {
    return fetchLegacyGooglePlacePredictions(query, mode, signal);
  }

  if (signal?.aborted) return [];

  return (response.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is GooglePlacePrediction => Boolean(prediction))
    .map((prediction) => buildBasicGooglePrediction(prediction, mode))
    .filter((prediction) => prediction.value)
    .slice(0, GOOGLE_AUTOCOMPLETE_LIMIT);
}
