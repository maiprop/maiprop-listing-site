export const POPULAR_GREEK_LOCATIONS = [
  "Athens",
  "Thessaloniki",
  "Piraeus",
  "Patras",
  "Heraklion",
  "Chania",
  "Larissa",
  "Volos",
  "Rhodes",
  "Corfu",
  "Mykonos",
  "Santorini",
  "Kallithea",
  "Kalamata",
  "Ioannina",
  "Nafplio",
  "Voula",
  "Glyfada",
  "Kifisia",
  "Marousi",
  "Kolonaki",
];

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

const latinizeGreek = (value: string) =>
  Array.from(value).map((char) => GREEK_TO_LATIN[char] ?? char).join("");

const normalize = (value: string) =>
  latinizeGreek(value.trim().toLocaleLowerCase("el-GR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

export function getPopularLocationSuggestions(query: string, limit = 8): string[] {
  const q = normalize(query);
  const matches = q
    ? POPULAR_GREEK_LOCATIONS.filter((location) => normalize(location).includes(q))
    : POPULAR_GREEK_LOCATIONS;
  return matches.slice(0, limit);
}

export function mergeLocationSuggestions(...groups: Array<Array<string | null | undefined>>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    for (const raw of group) {
      const value = raw?.trim();
      if (!value) continue;
      const key = normalize(value);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(value);
    }
  }

  return merged;
}

type NominatimLike = {
  display_name: string;
  lat?: string;
  lon?: string;
  address?: {
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
  };
};

const firstAddressPart = (...values: Array<string | null | undefined>) =>
  values.find((value) => Boolean(value?.trim()))?.trim() ?? "";

export function getNominatimAddressLine(suggestion: NominatimLike): string {
  const address = suggestion.address;
  if (!address) return suggestion.display_name;

  const street = firstAddressPart(
    address.road,
    address.pedestrian,
    address.footway,
    address.residential,
    address.path,
  );
  return [address.house_number, street].filter(Boolean).join(" ") || suggestion.display_name;
}

export function getNominatimCity(suggestion: NominatimLike): string {
  const address = suggestion.address;
  if (!address) return "";

  return firstAddressPart(
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.city_district,
    address.suburb,
    address.county,
    address.state,
  );
}

export function getNominatimMunicipality(suggestion: NominatimLike): string {
  const address = suggestion.address;
  if (!address) return "";

  return firstAddressPart(
    address.municipality,
    address.city_district,
    address.suburb,
    address.neighbourhood,
    address.county,
    address.state_district,
    address.state,
  );
}

export function getNominatimPostalCode(suggestion: NominatimLike): string {
  return suggestion.address?.postcode?.trim() ?? "";
}
