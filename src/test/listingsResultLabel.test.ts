import { describe, expect, it } from "vitest";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";
import { getListingsResultLabel } from "@/pages/listings/listingsResultLabel";

type LabelInput = Parameters<typeof getListingsResultLabel>[0];

const listing = (id: string): ListingCardWithRaw => ({
  id, title: id, address: "Athens", city: "Athens", price: 100_000,
  sqm: 60, images: [], type: "apartment", listingType: "sale",
});
const a = listing("a");
const b = listing("b");
const selected = new Set(["a", "unknown"]);
const viewport = new Set(["b"]);

const cases: Array<[string, Partial<LabelInput>, string, string]> = [
  ["split polygon wins over viewport and counts duplicate filtered items", { viewMode: "split", polygonFilterIds: selected, viewportIds: viewport }, "2 in area", "2 στην περιοχή"],
  ["split polygon pagination", { viewMode: "split", polygonFilterIds: selected, viewportIds: viewport, hasNextPage: true }, "2+ in area", "2+ στην περιοχή"],
  ["empty split polygon wins over nonempty viewport", { viewMode: "split", polygonFilterIds: new Set(), viewportIds: viewport }, "0 in area", "0 στην περιοχή"],
  ["empty split polygon pagination", { viewMode: "split", polygonFilterIds: new Set(), viewportIds: viewport, hasNextPage: true }, "0+ in area", "0+ στην περιοχή"],
  ["unknown polygon IDs do not add results", { viewMode: "split", polygonFilterIds: new Set(["missing"]) }, "0 in area", "0 στην περιοχή"],
  ["map polygon counts filtered rather than map listings", { viewMode: "map", polygonFilterIds: selected, viewportIds: viewport }, "2 in area", "2 στην περιοχή"],
  ["map polygon pagination", { viewMode: "map", polygonFilterIds: selected, hasNextPage: true }, "2+ in area", "2+ στην περιοχή"],
  ["empty map polygon is active", { viewMode: "map", polygonFilterIds: new Set(), viewportIds: viewport }, "0 in area", "0 στην περιοχή"],
  ["empty map polygon pagination", { viewMode: "map", polygonFilterIds: new Set(), hasNextPage: true }, "0+ in area", "0+ στην περιοχή"],
  ["map-only IDs do not count in polygon", { viewMode: "map", polygonFilterIds: new Set(["map-only"]) }, "0 in area", "0 στην περιοχή"],
  ["split viewport with null polygon", { viewMode: "split", viewportIds: viewport }, "1 in view", "1 στον χάρτη"],
  ["split viewport pagination", { viewMode: "split", viewportIds: viewport, hasNextPage: true }, "1+ in view", "1+ στον χάρτη"],
  ["viewport counts duplicate filtered items and ignores unknown IDs", { viewMode: "split", viewportIds: selected }, "2 in view", "2 στον χάρτη"],
  ["empty viewport is active", { viewMode: "split", viewportIds: new Set() }, "0 in view", "0 στον χάρτη"],
  ["empty viewport pagination", { viewMode: "split", viewportIds: new Set(), hasNextPage: true }, "0+ in view", "0+ στον χάρτη"],
  ["unknown viewport IDs", { viewMode: "split", viewportIds: new Set(["missing"]) }, "0 in view", "0 στον χάρτη"],
  ["unrestricted split uses filtered count", { viewMode: "split" }, "3 properties", "3 ακίνητα"],
  ["unrestricted split pagination", { viewMode: "split", hasNextPage: true }, "3 loaded properties", "3 φορτωμένα ακίνητα"],
  ["unrestricted map ignores viewport and uses map count", { viewMode: "map", viewportIds: selected }, "1 map result", "1 αποτελέσματα χάρτη"],
  ["singular map count with pagination", { viewMode: "map", hasNextPage: true }, "1+ map result", "1+ αποτελέσματα χάρτη"],
  ["empty map", { viewMode: "map", mapListings: [] }, "0 map results", "0 αποτελέσματα χάρτη"],
  ["empty map with pagination", { viewMode: "map", mapListings: [], hasNextPage: true }, "0+ map results", "0+ αποτελέσματα χάρτη"],
  ["plural map counts entries rather than distinct IDs", { viewMode: "map", mapListings: [{ id: "x" }, { id: "x" }] }, "2 map results", "2 αποτελέσματα χάρτη"],
  ["plural map with pagination", { viewMode: "map", mapListings: [{ id: "x" }, { id: "y" }], hasNextPage: true }, "2+ map results", "2+ αποτελέσματα χάρτη"],
  ["grid ignores polygon and viewport", { polygonFilterIds: selected, viewportIds: viewport }, "3 properties", "3 ακίνητα"],
  ["grid ignores empty selections with pagination", { polygonFilterIds: new Set(), viewportIds: new Set(), hasNextPage: true }, "3 loaded properties", "3 φορτωμένα ακίνητα"],
  ["empty exhausted grid", { filtered: [] }, "0 properties", "0 ακίνητα"],
  ["empty paginated grid", { filtered: [], hasNextPage: true }, "0 loaded properties", "0 φορτωμένα ακίνητα"],
  ["exhausted singular wording is preserved", { filtered: [a] }, "1 properties", "1 ακίνητα"],
  ["singular loaded property", { filtered: [a], hasNextPage: true }, "1 loaded property", "1 φορτωμένα ακίνητα"],
  ["plural exhausted grid", { filtered: [a, b] }, "2 properties", "2 ακίνητα"],
  ["plural loaded grid", { filtered: [a, b], hasNextPage: true }, "2 loaded properties", "2 φορτωμένα ακίνητα"],
];

describe.each([false, true])("getListingsResultLabel isGreek=%s", (isGreek) => {
  it.each(cases)("%s", (_name, overrides, english, greek) => {
    const input: LabelInput = {
      viewMode: "grid", polygonFilterIds: null, viewportIds: null,
      filtered: [a, a, b], mapListings: [{ id: "map-only" }],
      hasNextPage: false, isGreek, ...overrides,
    };
    const before = structuredClone(input);
    const filteredReference = input.filtered;
    const mapReference = input.mapListings;
    const polygonOrder = input.polygonFilterIds && [...input.polygonFilterIds];
    const viewportOrder = input.viewportIds && [...input.viewportIds];

    expect(getListingsResultLabel(input)).toBe(isGreek ? greek : english);

    expect(input).toEqual(before);
    expect(input.filtered).toBe(filteredReference);
    expect(input.mapListings).toBe(mapReference);
    expect(input.polygonFilterIds && [...input.polygonFilterIds]).toEqual(polygonOrder);
    expect(input.viewportIds && [...input.viewportIds]).toEqual(viewportOrder);
  });
});
