import { describe, it, expect, beforeEach } from "vitest";
import { getRecentSearches, addRecentSearch, removeRecentSearch } from "@/lib/recentSearches";

const KEY = "maiprop_recent_searches";

beforeEach(() => {
  localStorage.clear();
});

describe("getRecentSearches", () => {
  it("returns empty array when nothing is stored", () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it("returns stored searches", () => {
    localStorage.setItem(KEY, JSON.stringify(["Athens", "Thessaloniki"]));
    expect(getRecentSearches()).toEqual(["Athens", "Thessaloniki"]);
  });

  it("returns empty array when localStorage contains invalid JSON", () => {
    localStorage.setItem(KEY, "not-json{{");
    expect(getRecentSearches()).toEqual([]);
  });
});

describe("addRecentSearch", () => {
  it("adds a query to the list", () => {
    addRecentSearch("Mykonos");
    expect(getRecentSearches()).toContain("Mykonos");
  });

  it("prepends new queries (most recent first)", () => {
    addRecentSearch("Athens");
    addRecentSearch("Rhodes");
    expect(getRecentSearches()[0]).toBe("Rhodes");
  });

  it("deduplicates: moves existing query to front", () => {
    addRecentSearch("Athens");
    addRecentSearch("Thessaloniki");
    addRecentSearch("Athens");
    const searches = getRecentSearches();
    expect(searches[0]).toBe("Athens");
    expect(searches.filter(s => s === "Athens")).toHaveLength(1);
  });

  it("caps list at 6 entries", () => {
    for (let i = 0; i < 8; i++) addRecentSearch(`City ${i}`);
    expect(getRecentSearches()).toHaveLength(6);
  });

  it("ignores empty or whitespace-only queries", () => {
    addRecentSearch("  ");
    addRecentSearch("");
    expect(getRecentSearches()).toHaveLength(0);
  });
});

describe("removeRecentSearch", () => {
  it("removes a specific query", () => {
    addRecentSearch("Athens");
    addRecentSearch("Rhodes");
    removeRecentSearch("Athens");
    expect(getRecentSearches()).not.toContain("Athens");
    expect(getRecentSearches()).toContain("Rhodes");
  });

  it("does nothing if query is not in list", () => {
    addRecentSearch("Athens");
    removeRecentSearch("Nonexistent");
    expect(getRecentSearches()).toContain("Athens");
  });

  it("removes all occurrences if somehow duplicated in storage", () => {
    localStorage.setItem(KEY, JSON.stringify(["Athens", "Rhodes", "Athens"]));
    removeRecentSearch("Athens");
    expect(getRecentSearches()).not.toContain("Athens");
  });
});
