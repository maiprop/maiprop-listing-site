import { describe, expect, it } from "vitest";

import {
  applyCatalogueStreamCursor,
  buildNextCatalogueCursor,
  canAdvanceCatalogueCursor,
  catalogueStreamOffsetsForAvailableRows,
  decodeCatalogueCursor,
  interleaveCatalogueStreams,
  resolveCatalogueSort,
} from "./_listingRank";

const rows = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, count - index)).toISOString(),
  price: 100_000 + index,
}));

const cursorRows = (count: number, namespace = 0) =>
  rows("cursor", count).map((row, index) => ({
    ...row,
    id: `00000000-0000-4000-8000-${String(namespace * 1_000 + index + 1).padStart(12, "0")}`,
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

  it("resolves legacy output offsets from the rows actually available in each stream", () => {
    expect(catalogueStreamOffsetsForAvailableRows(12, 1, 20)).toEqual({
      slot: 0,
      priorityOffset: 1,
      organicOffset: 11,
    });
    expect(catalogueStreamOffsetsForAvailableRows(12, 20, 4)).toEqual({
      slot: 0,
      priorityOffset: 8,
      organicOffset: 4,
    });
  });

  it("stops legacy stream offsets at the actual catalogue end", () => {
    expect(catalogueStreamOffsetsForAvailableRows(12, 2, 5)).toEqual({
      slot: 7,
      priorityOffset: 2,
      organicOffset: 5,
    });
  });

  it("matches actual interleaving consumption across sparse stream combinations", () => {
    for (let outputOffset = 0; outputOffset <= 24; outputOffset += 1) {
      for (let priorityCount = 0; priorityCount <= 12; priorityCount += 1) {
        for (let organicCount = 0; organicCount <= 12; organicCount += 1) {
          const actual = interleaveCatalogueStreams(
            rows("priority", priorityCount),
            rows("organic", organicCount),
            outputOffset,
            0,
          );
          expect(catalogueStreamOffsetsForAvailableRows(
            outputOffset,
            priorityCount,
            organicCount,
          )).toEqual({
            slot: actual.nextSlot,
            priorityOffset: actual.consumedPriority,
            organicOffset: actual.consumedOrganic,
          });
        }
      }
    }
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
    const page = interleaveCatalogueStreams(cursorRows(4, 1), cursorRows(10, 2), 12, 0);
    const asOf = new Date().toISOString();
    const encoded = buildNextCatalogueCursor(null, sort, page, 42, asOf, "sort=featured");

    expect(decodeCatalogueCursor(encoded, sort)).toMatchObject({
      v: 3,
      publicationId: 42,
      sort: "featured",
      asOf,
      scope: "sort=featured",
      slot: 0,
      priorityOffset: 3,
      organicOffset: 9,
    });
    expect(decodeCatalogueCursor("not-a-cursor", sort)).toBeNull();
  });

  it("rejects legacy and snapshot-less cursors", () => {
    const sort = resolveCatalogueSort("featured");
    const payload = {
      v: 2,
      sort: "featured",
      scope: "sort=featured",
      slot: 0,
      priorityOffset: 0,
      organicOffset: 0,
    };
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(decodeCatalogueCursor(`v3.${encoded}`, sort)).toBeNull();
    expect(decodeCatalogueCursor(`v2.${encoded}`, sort)).toBeNull();
    expect(decodeCatalogueCursor(`v1.${encoded}`, sort)).toBeNull();
  });

  it("pins promotion eligibility to one catalogue snapshot across cursor pages", () => {
    const sort = resolveCatalogueSort("featured");
    const page = interleaveCatalogueStreams(cursorRows(4, 1), cursorRows(10, 2), 12, 0);
    const asOf = new Date().toISOString();
    const encoded = buildNextCatalogueCursor(null, sort, page, 42, asOf, "sort=featured");

    expect(decodeCatalogueCursor(encoded, sort)).toMatchObject({
      publicationId: 42,
      asOf,
    });
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
      "created_at.desc,id.desc",
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
    const id = "00000000-0000-4000-8000-000000000009";
    applyCatalogueStreamCursor(params, sort, { id, value, offset: 80 });

    expect(params.getAll("order")).toEqual([`${primaryOrder},id.desc`]);
    expect(params.get("or")).toContain(keysetClause);
    expect(params.get("or")).toContain(`id.lt.${id}`);
    expect(params.has("offset")).toBe(false);
  });

  it("uses keyset pagination for numeric AI scores and includes the null phase", () => {
    const sort = resolveCatalogueSort("ai-score");
    const params = new URLSearchParams();
    const id = "00000000-0000-4000-8000-000000000001";
    applyCatalogueStreamCursor(params, sort, { id, value: 88, offset: 40 });

    expect(params.getAll("order")).toEqual([
      "ai_score.desc.nullslast,id.desc",
    ]);
    expect(params.get("or")).toContain("ai_score.lt.88");
    expect(params.get("or")).toContain("ai_score.is.null");
    expect(params.get("or")).toContain(`id.lt.${id}`);
    expect(params.has("offset")).toBe(false);
  });

  it("continues keyset pagination within the null AI-score phase", () => {
    const sort = resolveCatalogueSort("ai-score");
    const params = new URLSearchParams();
    const id = "00000000-0000-4000-8000-000000000099";
    applyCatalogueStreamCursor(params, sort, { id, value: null, offset: 40 });

    expect(params.getAll("order")).toEqual([
      "ai_score.desc.nullslast,id.desc",
    ]);
    expect(params.get("ai_score")).toBe("is.null");
    expect(params.get("id")).toBe(`lt.${id}`);
    expect(params.has("offset")).toBe(false);
  });

  it("does not stop AI-score traversal at the legacy offset ceiling", () => {
    const sort = resolveCatalogueSort("ai-score");
    const page = interleaveCatalogueStreams(rows("priority", 4), rows("organic", 10), 12, 0);

    expect(canAdvanceCatalogueCursor({
      v: 3,
      publicationId: 42,
      sort: "ai-score",
      asOf: new Date().toISOString(),
      scope: "sort=ai-score",
      slot: 0,
      priorityOffset: 99_998,
      organicOffset: 0,
    }, sort, page)).toBe(true);
    expect(canAdvanceCatalogueCursor(null, resolveCatalogueSort("views"), page)).toBe(true);
  });
});
