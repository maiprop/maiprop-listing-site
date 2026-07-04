import { GOOGLE_PLACES_AUTOCOMPLETE_ENABLED } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import type { AddressPrediction } from "@/lib/location/addressFormat";

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
};

type GooglePlacePrediction = {
  placeId?: string;
  text?: GoogleText;
  mainText?: GoogleText;
  secondaryText?: GoogleText;
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

type GooglePlacesWindow = typeof window & {
  google?: {
    maps?: {
      importLibrary?: (library: "places") => Promise<GooglePlacesLibrary>;
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
  const city =
    componentText(components, "locality") ||
    componentText(components, "postal_town") ||
    componentText(components, "administrative_area_level_3") ||
    componentText(components, "administrative_area_level_2");
  const municipality =
    componentText(components, "administrative_area_level_2") ||
    componentText(components, "administrative_area_level_3") ||
    componentText(components, "administrative_area_level_1");
  const region = componentText(components, "administrative_area_level_1");
  const postalCode = componentText(components, "postal_code");
  const street = componentText(components, "route");
  const number = componentText(components, "street_number");
  const addressLine = compact(number, street).join(" ") || formattedAddress;
  const title = mode === "city" ? city || municipality || formattedAddress : addressLine;

  return {
    id: `google:${prediction.placeId ?? formattedAddress}`,
    provider: "google",
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
    fields: ["formattedAddress", "location", "addressComponents", "displayName"],
  });

  return buildDetailedPrediction(prediction, place, mode);
}

function buildBasicGooglePrediction(
  prediction: GooglePlacePrediction,
  mode: "city" | "address",
): AddressPrediction {
  const text = textToString(prediction.text);
  const title = textToString(prediction.mainText) || text;
  const subtitle = textToString(prediction.secondaryText);

  return {
    id: `google:${prediction.placeId ?? text}`,
    provider: "google",
    value: title,
    title,
    subtitle,
    addressLine: mode === "address" ? title : undefined,
    city: mode === "city" ? title : undefined,
    fullAddress: text,
    source: prediction,
    resolveDetails: () => resolveGoogleDetails(prediction, mode),
  };
}

export async function fetchGooglePlacePredictions(
  query: string,
  mode: "city" | "address",
  signal?: AbortSignal,
): Promise<AddressPrediction[]> {
  if (!GOOGLE_PLACES_AUTOCOMPLETE_ENABLED || typeof window === "undefined" || signal?.aborted) return [];

  await loadGoogleMapsPlaces();
  if (signal?.aborted) return [];

  const places = await (window as GooglePlacesWindow).google?.maps?.importLibrary?.("places");
  const AutocompleteSuggestion = places?.AutocompleteSuggestion;
  const AutocompleteSessionToken = places?.AutocompleteSessionToken;
  if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions || !AutocompleteSessionToken) return [];

  const sessionToken = new AutocompleteSessionToken();
  const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    includedRegionCodes: ["gr"],
    language: "el",
    region: "gr",
    sessionToken,
  });

  if (signal?.aborted) return [];

  return (response.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is GooglePlacePrediction => Boolean(prediction))
    .map((prediction) => buildBasicGooglePrediction(prediction, mode))
    .filter((prediction) => prediction.value)
    .slice(0, GOOGLE_AUTOCOMPLETE_LIMIT);
}
