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
  "Kalamata",
  "Ioannina",
  "Nafplio",
  "Voula",
  "Glyfada",
  "Kifisia",
  "Marousi",
  "Kolonaki",
];

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

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
