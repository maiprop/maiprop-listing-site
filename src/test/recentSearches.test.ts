import { describe, it, expect, beforeEach } from "vitest";
import { getRecentSearches, addRecentSearch, removeRecentSearch } from "@/lib/recentSearches";

const KEY = "maiprop_recent_searches";

beforeEach(() => {
  localStorage.clear();
});

describe("getRecentSearches", () => {
  it("returns empty array when nothing is stored", () => {
    expect(getRecentSearches()).toEqual([]);
    expect(Array.isArray(getRecentSearches())).toBe(true);
  });

  it("returns stored searches", () => {
    localStorage.setItem(KEY, JSON.stringify(["Athens", "Thessaloniki"]));
    const result = getRecentSearches();
    expect(result).toEqual(["Athens", "Thessaloniki"]);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when localStorage contains invalid JSON", () => {
    localStorage.setItem(KEY, "not-json{{");
    expect(getRecentSearches()).toEqual([]);
    // Recovery: a subsequent valid set still works.
    localStorage.setItem(KEY, JSON.stringify(["Athens"]));
    expect(getRecentSearches()).toEqual(["Athens"]);
  });
});

describe("addRecentSearch", () => {
  it("adds a query to the list", () => {
    addRecentSearch("Mykonos");
    expect(getRecentSearches()).toContain("Mykonos");
    expect(getRecentSearches()).toHaveLength(1);
  });

  it("prepends new queries (most recent first)", () => {
    addRecentSearch("Athens");
    addRecentSearch("Rhodes");
    const searches = getRecentSearches();
    expect(searches[0]).toBe("Rhodes");
    expect(searches[1]).toBe("Athens");
    expect(searches).toHaveLength(2);
  });

  it("deduplicates: moves existing query to front", () => {
    addRecentSearch("Athens");
    addRecentSearch("Thessaloniki");
    addRecentSearch("Athens");
    const searches = getRecentSearches();
    expect(searches[0]).toBe("Athens");
    expect(searches.filter(s => s === "Athens")).toHaveLength(1);
    // Total length should be 2 (deduplicated, not 3).
    expect(searches).toHaveLength(2);
  });

  it("caps list at 6 entries", () => {
    for (let i = 0; i < 8; i++) addRecentSearch(`City ${i}`);
    const searches = getRecentSearches();
    expect(searches).toHaveLength(6);
    // Most recent 6 are kept (City 7 is most recent, City 2 is oldest).
    expect(searches[0]).toBe("City 7");
    expect(searches).not.toContain("City 0");
    expect(searches).not.toContain("City 1");
  });

  it("ignores empty or whitespace-only queries", () => {
    addRecentSearch("  ");
    addRecentSearch("");
    addRecentSearch("\t\n");
    expect(getRecentSearches()).toHaveLength(0);
    // A real query after the empty ones still works.
    addRecentSearch("Athens");
    expect(getRecentSearches()).toEqual(["Athens"]);
  });
});

describe("removeRecentSearch", () => {
  it("removes a specific query", () => {
    addRecentSearch("Athens");
    addRecentSearch("Rhodes");
    removeRecentSearch("Athens");
    const searches = getRecentSearches();
    expect(searches).not.toContain("Athens");
    expect(searches).toContain("Rhodes");
    expect(searches).toHaveLength(1);
  });

  it("does nothing if query is not in list", () => {
    addRecentSearch("Athens");
    removeRecentSearch("Nonexistent");
    const searches = getRecentSearches();
    expect(searches).toContain("Athens");
    expect(searches).toHaveLength(1);
  });

  it("removes all occurrences if somehow duplicated in storage", () => {
    localStorage.setItem(KEY, JSON.stringify(["Athens", "Rhodes", "Athens"]));
    removeRecentSearch("Athens");
    const searches = getRecentSearches();
    expect(searches).not.toContain("Athens");
    expect(searches).toEqual(["Rhodes"]);
  });
});
