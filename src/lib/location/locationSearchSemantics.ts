import type { AddressPrediction } from "@/lib/location/addressFormat";

const BROAD_GOOGLE_TYPES = new Set(["administrative_area_level_1", "country"]);
const LISTING_LOCATION_STOP_WORDS = new Set([
  "περιφερεια",
  "αττικη",
  "αττικησ",
  "ελλαδα",
  "greece",
  "attica",
]);

export function normalizeGreekLocationText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/[’'`´]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeListingLocationSearchQuery(value: string): string {
  return normalizeGreekLocationText(value)
    .split(" ")
    .filter((token) => token && !LISTING_LOCATION_STOP_WORDS.has(token))
    .join(" ")
    .trim();
}

export function getListingLocationSearchTokens(value: string): string[] {
  return [...new Set(normalizeListingLocationSearchQuery(value).split(" ").filter(Boolean))].slice(0, 6);
}

function locationContextTokens(value: string): string[] {
  const normalized = normalizeGreekLocationText(value);
  const words = new Set(normalized.split(" ").filter(Boolean));
  const tokens: string[] = [];
  if (words.has("αττικη") || words.has("αττικησ") || words.has("attica")) tokens.push("αττικ", "attica");
  return tokens;
}

function isRegionText(value: string | null | undefined): boolean {
  const normalized = normalizeGreekLocationText(value ?? "");
  return (
    normalized === "περιφερεια" ||
    normalized.startsWith("περιφερεια ") ||
    normalized === "region" ||
    normalized.startsWith("region ") ||
    normalized === "regional unit" ||
    normalized.startsWith("regional unit ") ||
    ["attica", "αττικη", "αττικησ", "ελλαδα", "greece"].includes(normalized)
  );
}

const isSpecificLocationText = (value: string | null | undefined) =>
  Boolean(value?.trim()) && !isRegionText(value);

const hasSpecificLocation = (prediction: AddressPrediction) =>
  Boolean(
    isSpecificLocationText(prediction.addressLine) ||
    isSpecificLocationText(prediction.city) ||
    isSpecificLocationText(prediction.municipality),
  );

export function isBroadAdministrativePrediction(prediction: AddressPrediction): boolean {
  if (prediction.isBroadAdministrativeArea) return true;
  if (hasSpecificLocation(prediction)) return false;

  const googleTypes = prediction.googleTypes ?? [];
  const hasOnlyBroadGoogleTypes =
    googleTypes.length > 0 &&
    googleTypes.some((type) => BROAD_GOOGLE_TYPES.has(type)) &&
    !googleTypes.some((type) => [
      "street_address",
      "premise",
      "route",
      "locality",
      "postal_town",
      "administrative_area_level_2",
      "administrative_area_level_3",
    ].includes(type));

  const title = prediction.title || prediction.value;
  const titleEqualsRegion =
    Boolean(prediction.region) &&
    normalizeGreekLocationText(title) === normalizeGreekLocationText(prediction.region ?? "");

  return hasOnlyBroadGoogleTypes || titleEqualsRegion || isRegionText(title);
}

export function getListingLocationSearchValue(prediction: AddressPrediction): string {
  if (isBroadAdministrativePrediction(prediction)) return "";

  return (
    prediction.addressLine?.trim() ||
    prediction.city?.trim() ||
    prediction.municipality?.trim() ||
    prediction.title?.trim() ||
    prediction.value?.trim() ||
    ""
  );
}

export function getAddressInputDisplayValue(prediction: AddressPrediction): string {
  return (
    prediction.addressLine?.trim() ||
    prediction.fullAddress?.trim() ||
    prediction.value?.trim() ||
    prediction.title?.trim() ||
    ""
  );
}

export function filterAddressPredictionsForSelection(predictions: AddressPrediction[]): AddressPrediction[] {
  return predictions.filter((prediction) => !isBroadAdministrativePrediction(prediction));
}

export function filterAddressPredictionsForQuery(
  predictions: AddressPrediction[],
  query: string,
): AddressPrediction[] {
  const contextTokens = locationContextTokens(query);
  return filterAddressPredictionsForSelection(predictions).filter((prediction) => {
    if (contextTokens.length === 0) return true;
    const searchable = normalizeGreekLocationText([
      prediction.title,
      prediction.value,
      prediction.subtitle,
      prediction.fullAddress,
      prediction.city,
      prediction.municipality,
      prediction.region,
    ].filter(Boolean).join(" "));
    return contextTokens.some((token) => searchable.includes(token));
  });
}
