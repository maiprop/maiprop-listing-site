/**
 * Recent location search history stored in localStorage.
 * Extracted from Index.tsx.
 */

const RECENT_SEARCHES_KEY = "maiprop_recent_searches";
const MAX_RECENT = 6;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (_err: unknown) {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  if (!query.trim()) return;
  const existing = getRecentSearches().filter((s) => s !== query);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify([query, ...existing].slice(0, MAX_RECENT)),
  );
}

export function removeRecentSearch(query: string): void {
  const existing = getRecentSearches().filter((s) => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(existing));
}
