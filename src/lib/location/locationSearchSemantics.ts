import type { AddressPrediction } from "@/lib/location/addressFormat";

const BROAD_GOOGLE_TYPES = new Set(["administrative_area_level_1", "country"]);
const LISTING_LOCATION_STOP_WORDS = new Set([
  "περιφερεια",
  "αττικη",
  "αττικησ",
  "ελλαδα",
  "greece",
  "attica",
  "attikis",
  "perifereia",
  "ellada",
]);

const GREEK_CHAR_RE = /[\u0370-\u03ff]/;

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const LOCATION_TOKEN_ALIASES: Record<string, string[]> = {
  agioi: ["agion", "agios"],
  agion: ["agioi", "agios"],
  agios: ["agioi", "agion"],
  anargiroi: ["anargiron", "anargyroi", "anargyron"],
  anargiron: ["anargiroi", "anargyroi", "anargyron"],
  anargyroi: ["anargiroi", "anargiron", "anargyron"],
  anargyron: ["anargiroi", "anargiron", "anargyroi"],
  kalimnou: ["kalymnou"],
  kalymnou: ["kalimnou"],
};

function transliterateGreekToGreeklish(value: string, upsilon: "i" | "y" = "i"): string {
  const normalized = normalizeGreekLocationText(value).replace(/ου/g, "ou");
  const multi = normalized
    .replace(/θ/g, "th")
    .replace(/χ/g, "ch")
    .replace(/ψ/g, "ps");
  const source = "αβγδεζηικλμνξοπρστυφω";
  const target = upsilon === "i" ? "avgdeziiklmnxoprstifo" : "avgdeziiklmnxoprstyfo";
  return multi
    .split("")
    .map((char) => {
      const index = source.indexOf(char);
      return index >= 0 ? target[index] : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatinGreeklish(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/y/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

function expandLocationSearchToken(token: string): string[] {
  if (!token || LISTING_LOCATION_STOP_WORDS.has(token)) return [];
  const expanded = [token];
  if (GREEK_CHAR_RE.test(token)) {
    const greeklishI = transliterateGreekToGreeklish(token, "i");
    const greeklishY = transliterateGreekToGreeklish(token, "y");
    expanded.push(greeklishI);
    expanded.push(greeklishY);
    expanded.push(...(LOCATION_TOKEN_ALIASES[greeklishI] ?? []));
    expanded.push(...(LOCATION_TOKEN_ALIASES[greeklishY] ?? []));
  } else {
    const latin = normalizeLatinGreeklish(token);
    expanded.push(latin);
    expanded.push(...(LOCATION_TOKEN_ALIASES[latin] ?? []));
  }
  return unique(expanded).filter((item) => !LISTING_LOCATION_STOP_WORDS.has(item));
}

function normalizeLocationSearchableText(value: string): string {
  const normalized = normalizeGreekLocationText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  return unique([
    normalized,
    transliterateGreekToGreeklish(normalized, "i"),
    transliterateGreekToGreeklish(normalized, "y"),
    normalizeLatinGreeklish(normalized),
    ...tokens.flatMap(expandLocationSearchToken),
  ]).join(" ");
}

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
  return unique(getListingLocationSearchTokenGroups(value).flat()).slice(0, 12);
}

export function getListingLocationSearchTokenGroups(value: string): string[][] {
  return unique(
    normalizeListingLocationSearchQuery(value)
      .split(" ")
      .filter(Boolean)
  ).map((token) => expandLocationSearchToken(token).slice(0, 6)).filter((group) => group.length > 0).slice(0, 6);
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

  const hasCoordinates = Boolean(prediction.latitude?.trim() && prediction.longitude?.trim());
  const locality = prediction.city?.trim() || prediction.municipality?.trim();
  if (!hasCoordinates && prediction.addressLine?.trim() && locality) return locality;

  return (
    prediction.addressLine?.trim() ||
    locality ||
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
    const searchable = normalizeLocationSearchableText([
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
