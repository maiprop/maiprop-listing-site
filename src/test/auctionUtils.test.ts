/**
 * Tests for utility functions in src/lib/auctionUtils.ts:
 * getPropertyTypeLabel, getOwnershipStatus, getOwnershipPct,
 * normalizeOwnership, ownershipMatches, getAuctionRound,
 * estimateYield, yieldRange, countdownBadge, daysUntil
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
type AuctionUtils = typeof import("@/lib/auctionUtils");

let getPropertyTypeLabel: AuctionUtils["getPropertyTypeLabel"];
let getOwnershipStatus: AuctionUtils["getOwnershipStatus"];
let getOwnershipPct: AuctionUtils["getOwnershipPct"];
let normalizeOwnership: AuctionUtils["normalizeOwnership"];
let ownershipMatches: AuctionUtils["ownershipMatches"];
let getAuctionRound: AuctionUtils["getAuctionRound"];
let estimateYield: AuctionUtils["estimateYield"];
let yieldRange: AuctionUtils["yieldRange"];
let countdownBadge: AuctionUtils["countdownBadge"];
let daysUntil: AuctionUtils["daysUntil"];

beforeEach(async () => {
  vi.resetModules();
  ({
    getPropertyTypeLabel,
    getOwnershipStatus,
    getOwnershipPct,
    normalizeOwnership,
    ownershipMatches,
    getAuctionRound,
    estimateYield,
    yieldRange,
    countdownBadge,
    daysUntil,
  } = await import("@/lib/auctionUtils"));
});

// ── getPropertyTypeLabel ───────────────────────────────────────────────────────

describe("getPropertyTypeLabel", () => {
  it("returns Greek label for apartment", () => {
    expect(getPropertyTypeLabel({ property_type: "apartment" })).toBe("Διαμέρισμα");
  });

  it("returns Greek label for house", () => {
    expect(getPropertyTypeLabel({ property_type: "house" })).toBe("Μονοκατοικία");
  });

  it("returns empty string when no type and no tags", () => {
    expect(getPropertyTypeLabel({})).toBe("");
  });

  it("resolves land subtype from land_type tag", () => {
    const label = getPropertyTypeLabel({ property_type: "land", tags: ["land_type:plot"] });
    expect(label).toBe("Αγροτεμάχιο");
  });

  it("resolves land:land_with_building", () => {
    const label = getPropertyTypeLabel({ property_type: "land", tags: ["land_type:land_with_building"] });
    expect(label).toBe("Αγροτεμάχιο με κτίσμα");
  });

  it("resolves commercial subtype from commercial_type tag", () => {
    const label = getPropertyTypeLabel({ property_type: "commercial", tags: ["commercial_type:warehouse"] });
    expect(label).toBe("Αποθήκη");
  });

  it("resolves commercial:store", () => {
    const label = getPropertyTypeLabel({ property_type: "commercial", tags: ["commercial_type:store"] });
    expect(label).toBe("Κατάστημα");
  });

  it("infers 'land' from land_type tag when property_type absent", () => {
    const label = getPropertyTypeLabel({ tags: ["land_type:land"] });
    expect(label).toBe("Γη χωρίς κτίσμα");
  });

  it("infers 'commercial' from commercial_type tag when property_type absent", () => {
    const label = getPropertyTypeLabel({ tags: ["commercial_type:hotel"] });
    expect(label).toBe("Ξενοδοχείο");
  });

  it("title-cases unknown property types", () => {
    const label = getPropertyTypeLabel({ property_type: "studio_flat" });
    expect(label).toBe("Studio Flat");
  });
});

// ── getOwnershipStatus ─────────────────────────────────────────────────────────

describe("getOwnershipStatus", () => {
  it("returns null for null tags", () => {
    expect(getOwnershipStatus(null)).toBeNull();
  });

  it("returns null for undefined tags", () => {
    expect(getOwnershipStatus(undefined)).toBeNull();
  });

  it("extracts ownership status from tag", () => {
    expect(getOwnershipStatus(["ownership:full"])).toBe("full");
  });

  it("does not pick up ownership_pct tag as status", () => {
    expect(getOwnershipStatus(["ownership_pct:50"])).toBeNull();
  });

  it("returns the first ownership tag found", () => {
    expect(getOwnershipStatus(["some_tag", "ownership:bare"])).toBe("bare");
  });
});

// ── getOwnershipPct ────────────────────────────────────────────────────────────

describe("getOwnershipPct", () => {
  it("returns null for null tags", () => {
    expect(getOwnershipPct(null)).toBeNull();
  });

  it("parses ownership_pct from tag", () => {
    expect(getOwnershipPct(["ownership_pct:75"])).toBe(75);
  });

  it("returns null when tag absent", () => {
    expect(getOwnershipPct(["ownership:full"])).toBeNull();
  });
});

// ── normalizeOwnership ─────────────────────────────────────────────────────────

describe("normalizeOwnership", () => {
  it("returns null for null input", () => {
    expect(normalizeOwnership(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeOwnership("")).toBeNull();
  });

  it("normalizes 'full_ownership' to 'full'", () => {
    expect(normalizeOwnership("full_ownership")).toBe("full");
  });

  it("normalizes '100' to 'full'", () => {
    expect(normalizeOwnership("100")).toBe("full");
  });

  it("normalizes 'psili' to 'bare'", () => {
    expect(normalizeOwnership("psili")).toBe("bare");
  });

  it("normalizes 'joint' to 'common'", () => {
    expect(normalizeOwnership("joint")).toBe("common");
  });

  it("normalizes 'epikarpia' to 'usufruct'", () => {
    expect(normalizeOwnership("epikarpia")).toBe("usufruct");
  });

  it("normalizes 'horizontal_ownership' to 'horizontal'", () => {
    expect(normalizeOwnership("horizontal_ownership")).toBe("horizontal");
  });

  it("returns the lowercased raw value for unknown inputs", () => {
    expect(normalizeOwnership("UNKNOWN_TYPE")).toBe("unknown_type");
  });
});

// ── ownershipMatches ───────────────────────────────────────────────────────────

describe("ownershipMatches", () => {
  it("returns true when filter is empty (no filter)", () => {
    expect(ownershipMatches("", ["ownership:bare"])).toBe(true);
  });

  it("matches full ownership by tag", () => {
    expect(ownershipMatches("full", ["ownership:full"])).toBe(true);
  });

  it("matches full ownership by 100% pct tag", () => {
    expect(ownershipMatches("full", ["ownership_pct:100"])).toBe(true);
  });

  it("does not match bare as full", () => {
    expect(ownershipMatches("full", ["ownership:bare"])).toBe(false);
  });

  it("matches bare ownership", () => {
    expect(ownershipMatches("bare", ["ownership:bare"])).toBe(true);
  });

  it("matches common ownership with pct between 0-100", () => {
    expect(ownershipMatches("common", ["ownership_pct:50"])).toBe(true);
  });

  it("matches usufruct ownership", () => {
    expect(ownershipMatches("usufruct", ["ownership:usufruct"])).toBe(true);
  });

  it("matches vertical ownership", () => {
    expect(ownershipMatches("vertical", ["ownership:vertical"])).toBe(true);
  });

  it("matches horizontal ownership", () => {
    expect(ownershipMatches("horizontal", ["ownership:horizontal"])).toBe(true);
  });

  it("returns true when filter value normalises to null", () => {
    expect(ownershipMatches("", null)).toBe(true);
  });
});

// ── getAuctionRound ────────────────────────────────────────────────────────────

describe("getAuctionRound", () => {
  it("returns null for null tags", () => {
    expect(getAuctionRound(null)).toBeNull();
  });

  it("returns null for empty tags", () => {
    expect(getAuctionRound([])).toBeNull();
  });

  it("parses round number from tag", () => {
    expect(getAuctionRound(["round:2"])).toBe(2);
  });

  it("returns null for invalid round number", () => {
    expect(getAuctionRound(["round:abc"])).toBeNull();
  });

  it("returns null for round:0 (below minimum)", () => {
    expect(getAuctionRound(["round:0"])).toBeNull();
  });

  it("returns null when no round tag", () => {
    expect(getAuctionRound(["ownership:full"])).toBeNull();
  });
});

// ── estimateYield ──────────────────────────────────────────────────────────────

describe("estimateYield", () => {
  it("returns null when price is 0", () => {
    expect(estimateYield({ price: 0, sqm: 80, city: "Athens" })).toBeNull();
  });

  it("returns null when sqm is 0", () => {
    expect(estimateYield({ price: 200000, sqm: 0, city: "Athens" })).toBeNull();
  });

  it("returns null when price and sqm are null", () => {
    expect(estimateYield({ price: null, sqm: null, city: null })).toBeNull();
  });

  it("returns a positive yield for a valid Athens property", () => {
    const y = estimateYield({ price: 200000, sqm: 80, city: "athens" });
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(20);
  });

  it("uses auction_starting_bid over price when both provided", () => {
    const withBid = estimateYield({ price: 500000, auction_starting_bid: 100000, sqm: 80, city: "athens" });
    const withPrice = estimateYield({ price: 100000, sqm: 80, city: "athens" });
    expect(withBid).toBeCloseTo(withPrice!, 1);
  });

  it("uses default rent/sqm for unknown city", () => {
    const y = estimateYield({ price: 100000, sqm: 60, city: "unknowncity" });
    expect(y).toBeGreaterThan(0);
  });

  it("Mykonos has higher yield rate per sqm than generic city", () => {
    const mykonos = estimateYield({ price: 300000, sqm: 60, city: "mykonos" });
    const generic = estimateYield({ price: 300000, sqm: 60, city: "somevillage" });
    expect(mykonos!).toBeGreaterThan(generic!);
  });
});

// ── yieldRange ─────────────────────────────────────────────────────────────────

describe("yieldRange", () => {
  it("returns [0,3] for low", () => {
    expect(yieldRange("low")).toEqual([0, 3]);
  });

  it("returns [3,6] for medium", () => {
    expect(yieldRange("medium")).toEqual([3, 6]);
  });

  it("returns [6,9] for high", () => {
    expect(yieldRange("high")).toEqual([6, 9]);
  });

  it("returns [9, Infinity] for very_high", () => {
    const range = yieldRange("very_high");
    expect(range![0]).toBe(9);
    expect(range![1]).toBe(Infinity);
  });

  it("returns null for unknown bucket", () => {
    expect(yieldRange("unknown")).toBeNull();
  });
});

// ── countdownBadge ─────────────────────────────────────────────────────────────

describe("countdownBadge", () => {
  it("returns 'Today!' badge for 0 days", () => {
    const badge = countdownBadge(0);
    expect(badge?.label).toBe("Today!");
  });

  it("returns 'Tomorrow' badge for 1 day", () => {
    const badge = countdownBadge(1);
    expect(badge?.label).toBe("Tomorrow");
  });

  it("returns X days left badge for 2-7 days", () => {
    expect(countdownBadge(5)?.label).toBe("5 days left");
    expect(countdownBadge(7)?.label).toBe("7 days left");
  });

  it("returns null for more than 7 days", () => {
    expect(countdownBadge(8)).toBeNull();
    expect(countdownBadge(100)).toBeNull();
  });

  it("each badge has a cls string", () => {
    expect(countdownBadge(0)?.cls).toBeTruthy();
    expect(countdownBadge(1)?.cls).toBeTruthy();
    expect(countdownBadge(3)?.cls).toBeTruthy();
  });
});

// ── daysUntil ──────────────────────────────────────────────────────────────────

describe("daysUntil", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns 999 for null/undefined", () => {
    expect(daysUntil(null)).toBe(999);
    expect(daysUntil(undefined)).toBe(999);
  });

  it("returns 0 for today", () => {
    const now = new Date("2026-04-26T12:00:00Z");
    vi.setSystemTime(now);
    expect(daysUntil("2026-04-26T00:00:00Z")).toBe(0);
  });

  it("returns positive days for a future date", () => {
    vi.setSystemTime(new Date("2026-04-26T00:00:00Z"));
    expect(daysUntil("2026-05-01T00:00:00Z")).toBe(5);
  });

  it("returns 0 for a past date (clamped to 0)", () => {
    vi.setSystemTime(new Date("2026-04-26T00:00:00Z"));
    expect(daysUntil("2026-04-20T00:00:00Z")).toBe(0);
  });
});
