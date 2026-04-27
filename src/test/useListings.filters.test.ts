/**
 * Branch-coverage tests for `buildListingsQuery` in src/hooks/useListings.ts.
 *
 * The function fans out into ~30 conditional branches (sort variants,
 * numeric range filters, listing/property/owner scoping, feature column
 * allowlist, energy class, etc.). The previous test suite only exercised
 * the `useListing()` is_pro RPC path and left buildListingsQuery branches
 * at 37.3%, well below the 70% audit floor.
 *
 * Strategy: stub a chainable supabase builder that records every call, then
 * call buildListingsQuery with targeted filter combinations and assert the
 * expected method/args were issued.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { recorded, supabaseMock } = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] };
  const recorded: Call[] = [];

  // Each chainable method records the call and returns the same proxy so the
  // chain in the SUT (`.from().select().order().eq().range().eq()...`) works.
  const builder: Record<string, unknown> = {};
  const methods = ["select", "order", "range", "eq", "ilike", "in", "gte", "lte"] as const;
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      recorded.push({ method: m, args });
      return builder;
    });
  }

  const supabaseMock = {
    from: vi.fn((table: string) => {
      recorded.push({ method: "from", args: [table] });
      return builder;
    }),
  };

  return { recorded, supabaseMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

import { buildListingsQuery } from "@/hooks/useListings";

beforeEach(() => {
  recorded.length = 0;
  supabaseMock.from.mockClear();
});

function calls(method: string) {
  return recorded.filter((c) => c.method === method);
}

describe("buildListingsQuery — sort variants", () => {
  it("default ('featured') applies the 3-key composite ordering", () => {
    buildListingsQuery();
    const orderCalls = calls("order").map((c) => c.args[0]);
    expect(orderCalls).toEqual(["is_featured", "priority_placement", "created_at"]);
  });

  it("'price-asc' orders by price ascending", () => {
    buildListingsQuery({ sort: "price-asc" });
    const order = calls("order")[0];
    expect(order.args).toEqual(["price", { ascending: true }]);
  });

  it("'price-desc' orders by price descending", () => {
    buildListingsQuery({ sort: "price-desc" });
    expect(calls("order")[0].args).toEqual(["price", { ascending: false }]);
  });

  it("'newest' orders by created_at descending", () => {
    buildListingsQuery({ sort: "newest" });
    expect(calls("order")[0].args).toEqual(["created_at", { ascending: false }]);
  });

  it("'ai-score' orders by ai_score with nullsFirst:false", () => {
    buildListingsQuery({ sort: "ai-score" });
    expect(calls("order")[0].args).toEqual([
      "ai_score",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("'views' orders by views_count with nullsFirst:false", () => {
    buildListingsQuery({ sort: "views" });
    expect(calls("order")[0].args).toEqual([
      "views_count",
      { ascending: false, nullsFirst: false },
    ]);
  });
});

describe("buildListingsQuery — listing-type / status scoping", () => {
  it("with no listing_type and no includeAuctions, restricts to sale/rent/firesale via .in()", () => {
    buildListingsQuery();
    const inCall = calls("in").find((c) => c.args[0] === "listing_type");
    expect(inCall).toBeDefined();
    expect(inCall?.args[1]).toEqual(["sale", "rent", "firesale"]);
  });

  it("includeAuctions:true skips the listing_type allowlist", () => {
    buildListingsQuery({ includeAuctions: true });
    const inCall = calls("in").find((c) => c.args[0] === "listing_type");
    expect(inCall).toBeUndefined();
  });

  it("explicit listing_type uses .eq() instead of the allowlist", () => {
    buildListingsQuery({ listing_type: "auction" });
    expect(calls("eq").some((c) => c.args[0] === "listing_type" && c.args[1] === "auction")).toBe(true);
    expect(calls("in").find((c) => c.args[0] === "listing_type")).toBeUndefined();
  });

  it("defaults status to 'active' when no owner_id is supplied", () => {
    buildListingsQuery();
    expect(calls("eq").some((c) => c.args[0] === "status" && c.args[1] === "active")).toBe(true);
  });

  it("with owner_id and no status, omits the status filter so all states show", () => {
    buildListingsQuery({ owner_id: "owner-1" });
    expect(calls("eq").some((c) => c.args[0] === "status")).toBe(false);
    expect(calls("eq").some((c) => c.args[0] === "owner_id" && c.args[1] === "owner-1")).toBe(true);
  });

  it("with owner_id and explicit status, applies that status only", () => {
    buildListingsQuery({ owner_id: "owner-1", status: "draft" });
    expect(calls("eq").some((c) => c.args[0] === "status" && c.args[1] === "draft")).toBe(true);
  });
});

describe("buildListingsQuery — numeric range filters", () => {
  it("applies every min/max range when supplied", () => {
    buildListingsQuery({
      price_min: 100, price_max: 200,
      beds_min: 1, beds_max: 3,
      baths_min: 1, baths_max: 2,
      sqm_min: 50, sqm_max: 150,
      floor_min: 0, floor_max: 5,
      year_min: 2000, year_max: 2026,
    });
    const gtePairs = calls("gte").map((c) => [c.args[0], c.args[1]]);
    const ltePairs = calls("lte").map((c) => [c.args[0], c.args[1]]);
    expect(gtePairs).toEqual([
      ["price", 100], ["bedrooms", 1], ["bathrooms", 1],
      ["sqm", 50], ["floor", 0], ["year_built", 2000],
    ]);
    expect(ltePairs).toEqual([
      ["price", 200], ["bedrooms", 3], ["bathrooms", 2],
      ["sqm", 150], ["floor", 5], ["year_built", 2026],
    ]);
  });

  it("treats price_min:0 / beds_min:0 as supplied (non-null)", () => {
    buildListingsQuery({ price_min: 0, beds_min: 0 });
    expect(calls("gte").some((c) => c.args[0] === "price" && c.args[1] === 0)).toBe(true);
    expect(calls("gte").some((c) => c.args[0] === "bedrooms" && c.args[1] === 0)).toBe(true);
  });

  it("skips numeric ranges when undefined", () => {
    buildListingsQuery({});
    expect(calls("gte").length).toBe(0);
    expect(calls("lte").length).toBe(0);
  });
});

describe("buildListingsQuery — categorical / feature filters", () => {
  it("applies city via .ilike() with surrounding wildcards", () => {
    buildListingsQuery({ city: "Athens" });
    const ilike = calls("ilike")[0];
    expect(ilike.args).toEqual(["city", "%Athens%"]);
  });

  it("applies property_type / heating / construction_status via .eq()", () => {
    buildListingsQuery({
      property_type: "apartment",
      heating_system: "gas",
      construction_status: "ready",
      commercial_subtype: "office",
    });
    const eqByCol = Object.fromEntries(
      calls("eq").map((c) => [c.args[0] as string, c.args[1]]),
    );
    expect(eqByCol.property_type).toBe("apartment");
    expect(eqByCol.heating_system).toBe("gas");
    expect(eqByCol.construction_status).toBe("ready");
    expect(eqByCol.commercial_subtype).toBe("office");
  });

  it("applies is_pre_sale / is_off_market only when explicitly true", () => {
    buildListingsQuery({ is_pre_sale: true, is_off_market: true });
    const eqs = calls("eq").filter((c) => c.args[0] === "is_pre_sale" || c.args[0] === "is_off_market");
    expect(eqs).toHaveLength(2);
    eqs.forEach((c) => expect(c.args[1]).toBe(true));
  });

  it("ignores is_pre_sale:false / is_off_market:false (only true is meaningful)", () => {
    buildListingsQuery({ is_pre_sale: false, is_off_market: false });
    expect(calls("eq").some((c) => c.args[0] === "is_pre_sale")).toBe(false);
    expect(calls("eq").some((c) => c.args[0] === "is_off_market")).toBe(false);
  });

  it("applies energy_class via .in() when array is non-empty", () => {
    buildListingsQuery({ energy_class: ["A", "B"] });
    const inCall = calls("in").find((c) => c.args[0] === "energy_class");
    expect(inCall?.args[1]).toEqual(["A", "B"]);
  });

  it("skips energy_class when array is empty", () => {
    buildListingsQuery({ energy_class: [] });
    expect(calls("in").find((c) => c.args[0] === "energy_class")).toBeUndefined();
  });
});

describe("buildListingsQuery — feature column allowlist (column-injection guard)", () => {
  it("applies allowlisted feature columns via .eq(col, true)", () => {
    buildListingsQuery({ features: ["has_parking", "has_pool"] });
    const featureEqs = calls("eq").filter(
      (c) => c.args[0] === "has_parking" || c.args[0] === "has_pool",
    );
    expect(featureEqs).toHaveLength(2);
    featureEqs.forEach((c) => expect(c.args[1]).toBe(true));
  });

  it("rejects unknown feature columns silently (column-injection guard)", () => {
    buildListingsQuery({ features: ["has_parking", "not_a_column", "DROP TABLE listings"] });
    const cols = calls("eq").map((c) => c.args[0]);
    expect(cols).toContain("has_parking");
    expect(cols).not.toContain("not_a_column");
    expect(cols).not.toContain("DROP TABLE listings");
  });
});

describe("buildListingsQuery — pagination range", () => {
  it("uses range(from, from + pageSize - 1) for the first page of 24", () => {
    buildListingsQuery(undefined, 0, 24);
    expect(calls("range")[0].args).toEqual([0, 23]);
  });

  it("respects custom from offset and pageSize", () => {
    buildListingsQuery(undefined, 48, 12);
    expect(calls("range")[0].args).toEqual([48, 59]);
  });
});
