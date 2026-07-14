import { describe, expect, it } from "vitest";

import {
  applyCatalogueStreamCursor,
  buildNextCatalogueCursor,
  canAdvanceCatalogueCursor,
  decodeCatalogueCursor,
  interleaveCatalogueStreams,
  MAX_CATALOGUE_STREAM_OFFSET,
  resolveCatalogueSort,
} from "./_listingRank";

const rows = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, count - index)).toISOString(),
  price: 100_000 + index,
}));

describe("public catalogue paid-slot ranking", () => {
  it("places at most three Priority rows in each 12-card block while organic rows exist", () => {
    const result = interleaveCatalogueStreams(rows("priority", 8), rows("organic", 20), 12, 0);

    expect(result.data).toHaveLength(12);
    expect(result.data.slice(0, 3).map((row) => row.id)).toEqual([
      "priority-1",
      "priority-2",
      "priority-3",
    ]);
    expect(result.data.slice(3).every((row) => row.id.startsWith("organic-"))).toBe(true);
    expect(result.consumedPriority).toBe(3);
    expect(result.consumedOrganic).toBe(9);
  });

  it("fills the page from the available stream without duplicates when one stream is scarce", () => {
    const result = interleaveCatalogueStreams(rows("priority", 1), rows("organic", 20), 12, 0);
    expect(result.data).toHaveLength(12);
    expect(new Set(result.data.map((row) => row.id))).toHaveLength(12);
    expect(result.consumedPriority).toBe(1);
    expect(result.consumedOrganic).toBe(11);
  });

  it("uses Priority rows to fill otherwise empty organic slots", () => {
    const result = interleaveCatalogueStreams(rows("priority", 20), rows("organic", 1), 12, 0);

    expect(result.data).toHaveLength(12);
    expect(result.data.filter((row) => row.id.startsWith("priority-"))).toHaveLength(11);
    expect(result.consumedPriority).toBe(11);
    expect(result.consumedOrganic).toBe(1);
  });

  it("continues the 3-in-12 slot pattern from the cursor slot", () => {
    const result = interleaveCatalogueStreams(rows("priority", 8), rows("organic", 20), 8, 4);
    expect(result.data.every((row) => row.id.startsWith("organic-"))).toBe(true);
    expect(result.nextSlot).toBe(0);
  });

  it("round-trips a versioned cursor and rejects malformed cursors", () => {
    const sort = resolveCatalogueSort("featured");
    const page = interleaveCatalogueStreams(rows("priority", 4), rows("organic", 10), 12, 0);
    const encoded = buildNextCatalogueCursor(null, sort, page);

    expect(decodeCatalogueCursor(encoded, sort)).toMatchObject({
      v: 1,
      sort: "featured",
      slot: 0,
      priorityOffset: 3,
      organicOffset: 9,
    });
    expect(decodeCatalogueCursor("not-a-cursor", sort)).toBeNull();
  });

  it("applies keyset pagination with a stable id tie-breaker", () => {
    const sort = resolveCatalogueSort("featured");
    const params = new URLSearchParams();
    applyCatalogueStreamCursor(params, sort, {
      id: "9bcb2bd9-10c6-4ac7-9142-c5fc14256658",
      value: "2026-07-14T12:00:00.000Z",
      offset: 12,
    });

    expect(params.getAll("order")).toEqual([
      "created_at.desc",
      "id.desc",
    ]);
    expect(params.get("or")).toContain("created_at.lt.2026-07-14T12:00:00.000Z");
    expect(params.get("or")).toContain("id.lt.9bcb2bd9-10c6-4ac7-9142-c5fc14256658");
    expect(params.has("offset")).toBe(false);
  });

  it.each([
    ["featured", "created_at.desc", "2026-07-14T12:00:00.000Z", "created_at.lt.2026-07-14T12:00:00.000Z"],
    ["newest", "created_at.desc", "2026-07-14T12:00:00.000Z", "created_at.lt.2026-07-14T12:00:00.000Z"],
    ["price-asc", "price.asc", 250_000, "price.gt.250000"],
    ["price-desc", "price.desc", 250_000, "price.lt.250000"],
    ["views", "views_count.desc.nullslast", 75, "views_count.lt.75"],
  ])("uses deterministic keyset ordering for %s", (sortName, primaryOrder, value, keysetClause) => {
    const sort = resolveCatalogueSort(sortName);
    const params = new URLSearchParams();
    applyCatalogueStreamCursor(params, sort, { id: "row-9", value, offset: 80 });

    expect(params.getAll("order")).toEqual([primaryOrder, "id.desc"]);
    expect(params.get("or")).toContain(keysetClause);
    expect(params.get("or")).toContain("id.lt.row-9");
    expect(params.has("offset")).toBe(false);
  });

  it("uses bounded stream offsets only for nullable AI score ordering", () => {
    const sort = resolveCatalogueSort("ai-score");
    const params = new URLSearchParams();
    applyCatalogueStreamCursor(params, sort, { id: "row-1", value: null, offset: 40 });

    expect(params.getAll("order")).toEqual([
      "ai_score.desc.nullslast",
      "id.desc",
    ]);
    expect(params.get("offset")).toBe("40");
  });

  it("stops AI score traversal before a bounded stream offset would repeat", () => {
    const sort = resolveCatalogueSort("ai-score");
    const page = interleaveCatalogueStreams(rows("priority", 4), rows("organic", 10), 12, 0);

    expect(canAdvanceCatalogueCursor({
      v: 1,
      sort: "ai-score",
      slot: 0,
      priorityOffset: MAX_CATALOGUE_STREAM_OFFSET - 2,
      organicOffset: 0,
    }, sort, page)).toBe(false);
    expect(canAdvanceCatalogueCursor(null, resolveCatalogueSort("views"), page)).toBe(true);
  });
});
