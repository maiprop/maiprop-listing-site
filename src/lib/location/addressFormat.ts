import {
  getPopularLocationSuggestions,
  mergeLocationSuggestions,
} from "@/lib/locationSuggestions";

type AddressParts = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  residential?: string;
  path?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  municipality?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export type AddressProvider = "popular" | "google" | "mapbox" | "nominatim" | "manual";

export interface AddressPrediction {
  id: string;
  provider: AddressProvider;
  value: string;
  title: string;
  placeId?: string;
  googleTypes?: string[];
  isBroadAdministrativeArea?: boolean;
  subtitle?: string;
  fullAddress?: string;
  addressLine?: string;
  city?: string;
  municipality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  source?: unknown;
  resolveDetails?: () => Promise<AddressPrediction>;
}

export type NominatimLike = {
  display_name: string;
  lat?: string;
  lon?: string;
  address?: AddressParts;
};

export type MapboxLike = {
  id?: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  properties?: {
    address?: string;
    maki?: string;
  };
  context?: Array<{
    id?: string;
    text?: string;
  }>;
};

const first = (...values: Array<string | null | undefined>) =>
  values.find((value) => Boolean(value?.trim()))?.trim() ?? "";

const compactParts = (...values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    if (/^greece$/i.test(value) || value === "Ελλάδα") continue;
    const key = value.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts;
};

const splitDisplayName = (displayName: string) =>
  displayName.split(",").map((part) => part.trim()).filter(Boolean);

const getStreetName = (address?: AddressParts) =>
  first(address?.road, address?.pedestrian, address?.footway, address?.residential, address?.path);

const getLocality = (address?: AddressParts) =>
  first(address?.city, address?.town, address?.village, address?.suburb, address?.city_district);

const getTitleArea = (address?: AddressParts) =>
  first(address?.neighbourhood, address?.suburb, address?.city_district, address?.city, address?.town, address?.village);

export function formatAddressPrediction(prediction: AddressPrediction): { title: string; subtitle: string } {
  const title = prediction.title || prediction.value;
  const subtitle = prediction.subtitle?.trim() || compactParts(
    prediction.city && prediction.city !== title ? prediction.city : "",
    prediction.municipality,
    prediction.region,
    prediction.postalCode,
  ).join(" - ");

  return {
    title,
    subtitle,
  };
}

export function mapTextLocationToAddressPrediction(value: string, provider: AddressProvider = "popular"): AddressPrediction {
  const text = value.trim();
  return {
    id: `${provider}:${text.toLocaleLowerCase("en-US")}`,
    provider,
    value: text,
    title: text,
    city: text,
  };
}

export function mapNominatimSuggestionToAddressPrediction(suggestion: NominatimLike): AddressPrediction {
  const address = suggestion.address;
  const displayParts = splitDisplayName(suggestion.display_name);
  const street = getStreetName(address);
  const addressLine = [address?.house_number, street].filter(Boolean).join(" ");
  const title = addressLine || getTitleArea(address) || displayParts[0] || suggestion.display_name;
  const city = getLocality(address);
  const municipality = first(address?.municipality, address?.county, address?.state_district);
  const region = first(address?.state);
  const postalCode = address?.postcode?.trim() ?? "";
  const structuredSubtitleParts = compactParts(
    city && city !== title ? city : "",
    municipality,
    region,
    postalCode,
  );
  const subtitleParts = structuredSubtitleParts.length > 0
    ? structuredSubtitleParts
    : compactParts(...displayParts.slice(1, 4));
  const subtitle = subtitleParts.join(" - ");

  return {
    id: `nominatim:${suggestion.lat ?? ""}:${suggestion.lon ?? ""}:${suggestion.display_name}`,
    provider: "nominatim",
    value: title,
    title,
    subtitle,
    fullAddress: suggestion.display_name,
    addressLine: addressLine || title,
    city,
    municipality,
    region,
    postalCode,
    country: address?.country,
    latitude: suggestion.lat,
    longitude: suggestion.lon,
    source: suggestion,
  };
}

const getMapboxContextText = (feature: MapboxLike, kind: string) =>
  feature.context?.find((item) => item.id?.startsWith(`${kind}.`))?.text ?? "";

export function mapMapboxFeatureToAddressPrediction(feature: MapboxLike): AddressPrediction {
  const placeName = feature.place_name ?? "";
  const displayParts = splitDisplayName(placeName);
  const title = first(
    feature.properties?.address && feature.text ? `${feature.properties.address} ${feature.text}` : "",
    feature.text,
    displayParts[0],
    placeName,
  );
  const city = first(
    getMapboxContextText(feature, "place"),
    getMapboxContextText(feature, "locality"),
    getMapboxContextText(feature, "neighborhood"),
  );
  const region = first(getMapboxContextText(feature, "region"));
  const postalCode = first(getMapboxContextText(feature, "postcode"));
  const [longitude, latitude] = feature.center ?? [];
  const subtitle = compactParts(city, region, postalCode, ...displayParts.slice(1, 4)).join(" - ");

  return {
    id: feature.id ? `mapbox:${feature.id}` : `mapbox:${placeName}`,
    provider: "mapbox",
    value: title,
    title,
    subtitle,
    fullAddress: placeName,
    addressLine: title,
    city,
    region,
    postalCode,
    latitude: typeof latitude === "number" && Number.isFinite(latitude) ? String(latitude) : undefined,
    longitude: typeof longitude === "number" && Number.isFinite(longitude) ? String(longitude) : undefined,
    source: feature,
  };
}

export function getPopularAddressPredictions(query: string, limit = 8): AddressPrediction[] {
  return getPopularLocationSuggestions(query, limit).map((location) => mapTextLocationToAddressPrediction(location));
}

export function mergeAddressPredictions(...groups: AddressPrediction[][]): AddressPrediction[] {
  const values = mergeLocationSuggestions(
    ...groups.map((group) => group.map((prediction) => `${prediction.provider}:${prediction.value}:${prediction.subtitle ?? ""}`)),
  );
  const lookup = new Map<string, AddressPrediction>();
  for (const group of groups) {
    for (const prediction of group) {
      lookup.set(`${prediction.provider}:${prediction.value}:${prediction.subtitle ?? ""}`, prediction);
    }
  }
  return values.map((key) => lookup.get(key)).filter((item): item is AddressPrediction => Boolean(item));
}
