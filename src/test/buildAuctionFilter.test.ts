/**
 * Unit tests for buildAuctionFilter — the pure filter predicate extracted from
 * useAuctionsPipeline.ts. All tests exercise the predicate in isolation with
 * minimal mock auction objects; no React, no Supabase, no hooks.
 */
import { describe, it, expect } from "vitest";
import { buildAuctionFilter, type Auction_ } from "@/hooks/useAuctionsPipeline";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal auction stub. All optional fields default to undefined/null. */
const makeAuction = (overrides: Partial<Record<string, unknown>> = {}): Auction_ => {
  return {
    id: "a1",
    title: "Test Auction",
    city: "Athens",
    property_type: "apartment",
    tags: [] as string[],
    auction_starting_bid: 50_000,
    price: null,
    year_built: 2000,
    auction_date: null,
    latitude: null,
    longitude: null,
    sqm: 80,
    cover_image_url: null,
    listing_images: [],
    ...overrides,
  } as unknown as Auction_;
};

const defaultOpts = {
  selectedCity: "All Cities",
  filterType: "",
  filterBidRange: "",
  filterYearRange: "",
  filterOwnership: "",
  filterRound: "",
  filterYield: "",
};

// ── city filter ───────────────────────────────────────────────────────────────

describe("buildAuctionFilter — city filter", () => {
  it("passes when selectedCity is 'All Cities'", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, selectedCity: "All Cities" }, false, false);
    expect(predicate(makeAuction({ city: "Thessaloniki" }))).toBe(true);
  });

  it("passes when city matches case-insensitively", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, selectedCity: "athens" }, false, false);
    expect(predicate(makeAuction({ city: "Athens" }))).toBe(true);
  });

  it("fails when city does not match", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, selectedCity: "Thessaloniki" }, false, false);
    expect(predicate(makeAuction({ city: "Athens" }))).toBe(false);
  });

  it("fails when auction city is null", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, selectedCity: "Athens" }, false, false);
    expect(predicate(makeAuction({ city: null }))).toBe(false);
  });
});

// ── property type filter ──────────────────────────────────────────────────────

describe("buildAuctionFilter — property type filter", () => {
  it("passes when filterType is empty (no filter)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "" }, false, false);
    expect(predicate(makeAuction({ property_type: "house" }))).toBe(true);
  });

  it("passes when base type matches", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "apartment" }, false, false);
    expect(predicate(makeAuction({ property_type: "apartment" }))).toBe(true);
  });

  it("fails when base type does not match", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "house" }, false, false);
    expect(predicate(makeAuction({ property_type: "apartment" }))).toBe(false);
  });

  it("passes land with matching subtype tag", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "land:plot" }, false, false);
    expect(predicate(makeAuction({ property_type: "land", tags: ["land_type:plot"] }))).toBe(true);
  });

  it("fails land with mismatched subtype tag", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "land:plot" }, false, false);
    expect(predicate(makeAuction({ property_type: "land", tags: ["land_type:agricultural"] }))).toBe(false);
  });

  it("passes commercial with matching subtype tag", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "commercial:retail" }, false, false);
    expect(predicate(makeAuction({ property_type: "commercial", tags: ["commercial_type:retail"] }))).toBe(true);
  });

  it("fails commercial with mismatched subtype tag", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterType: "commercial:office" }, false, false);
    expect(predicate(makeAuction({ property_type: "commercial", tags: ["commercial_type:retail"] }))).toBe(false);
  });
});

// ── bid range filter ──────────────────────────────────────────────────────────

describe("buildAuctionFilter — bid range filter", () => {
  it("passes when bid is within range", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterBidRange: "50000-200000" }, false, false);
    expect(predicate(makeAuction({ auction_starting_bid: 100_000 }))).toBe(true);
  });

  it("passes when bid equals lower bound", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterBidRange: "50000-200000" }, false, false);
    expect(predicate(makeAuction({ auction_starting_bid: 50_000 }))).toBe(true);
  });

  it("fails when bid is below range", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterBidRange: "100000-300000" }, false, false);
    expect(predicate(makeAuction({ auction_starting_bid: 50_000 }))).toBe(false);
  });

  it("fails when bid is above range", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterBidRange: "0-50000" }, false, false);
    expect(predicate(makeAuction({ auction_starting_bid: 100_000 }))).toBe(false);
  });

  it("falls back to price when auction_starting_bid is null", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterBidRange: "50000-200000" }, false, false);
    expect(predicate(makeAuction({ auction_starting_bid: null, price: 80_000 }))).toBe(true);
  });
});

// ── year range filter ─────────────────────────────────────────────────────────

describe("buildAuctionFilter — year range filter", () => {
  it("passes when year_built is within range", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterYearRange: "1990-2010" }, false, false);
    expect(predicate(makeAuction({ year_built: 2000 }))).toBe(true);
  });

  it("fails when year_built is outside range", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterYearRange: "1990-2000" }, false, false);
    expect(predicate(makeAuction({ year_built: 2010 }))).toBe(false);
  });

  it("skips year filter when year_built is null (passes through)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterYearRange: "1990-2000" }, false, false);
    expect(predicate(makeAuction({ year_built: null }))).toBe(true);
  });
});

// ── premium filters (ownership, round, yield) — free user bypass ──────────────

describe("buildAuctionFilter — premium filters ignored for free users", () => {
  it("does not apply ownership filter for free user", () => {
    // auction has no ownership tag; filter should be ignored for free users
    const predicate = buildAuctionFilter({ ...defaultOpts, filterOwnership: "private" }, false, false);
    expect(predicate(makeAuction({ tags: [] }))).toBe(true);
  });

  it("does not apply round filter for free user", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterRound: "1" }, false, false);
    expect(predicate(makeAuction({ tags: [] }))).toBe(true);
  });

  it("does not apply yield filter for free user", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterYield: "very_high" }, false, false);
    // auction would never meet 9%+ — but filter is ignored for free users
    expect(predicate(makeAuction({ auction_starting_bid: 999_999_999, sqm: 1 }))).toBe(true);
  });
});

// ── premium filters applied for Pro users ─────────────────────────────────────

describe("buildAuctionFilter — premium filters applied for Pro users", () => {
  it("passes ownership filter when tag matches (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterOwnership: "full" }, true, false);
    // ownershipMatches("full", ["ownership:full"]) → true
    expect(predicate(makeAuction({ tags: ["ownership:full"] }))).toBe(true);
  });

  it("fails ownership filter when tag does not match (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterOwnership: "full" }, true, false);
    expect(predicate(makeAuction({ tags: ["ownership:bare"] }))).toBe(false);
  });

  it("passes round filter '1' for 1st-round auction (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterRound: "1" }, true, false);
    expect(predicate(makeAuction({ tags: ["round:1"] }))).toBe(true);
  });

  it("fails round filter '2' for 1st-round auction (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterRound: "2" }, true, false);
    expect(predicate(makeAuction({ tags: ["round:1"] }))).toBe(false);
  });

  it("passes round filter '3plus' for 4th-round auction (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterRound: "3plus" }, true, false);
    expect(predicate(makeAuction({ tags: ["round:4"] }))).toBe(true);
  });

  it("fails round filter '3plus' for 2nd-round auction (Pro)", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterRound: "3plus" }, true, false);
    expect(predicate(makeAuction({ tags: ["round:2"] }))).toBe(false);
  });
});

// ── premium filters applied for OS users ─────────────────────────────────────

describe("buildAuctionFilter — premium filters applied for OS/admin users", () => {
  it("applies ownership filter for isMaiPropOsUser=true even when isPro=false", () => {
    const predicate = buildAuctionFilter({ ...defaultOpts, filterOwnership: "full" }, false, true);
    // "ownership:bare" does not match "full" — filter should reject it
    expect(predicate(makeAuction({ tags: ["ownership:bare"] }))).toBe(false);
  });
});

// ── combined filters ──────────────────────────────────────────────────────────

describe("buildAuctionFilter — combined standard filters", () => {
  it("applies all standard filters together (all pass)", () => {
    const predicate = buildAuctionFilter(
      { selectedCity: "Athens", filterType: "apartment", filterBidRange: "50000-200000", filterYearRange: "1990-2010", filterOwnership: "", filterRound: "", filterYield: "" },
      false,
      false,
    );
    expect(predicate(makeAuction({ city: "Athens", property_type: "apartment", auction_starting_bid: 100_000, year_built: 2000 }))).toBe(true);
  });

  it("fails when city mismatches even if other filters pass", () => {
    const predicate = buildAuctionFilter(
      { selectedCity: "Thessaloniki", filterType: "apartment", filterBidRange: "50000-200000", filterYearRange: "", filterOwnership: "", filterRound: "", filterYield: "" },
      false,
      false,
    );
    expect(predicate(makeAuction({ city: "Athens", property_type: "apartment", auction_starting_bid: 100_000 }))).toBe(false);
  });
});
