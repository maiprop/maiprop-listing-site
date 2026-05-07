/* global Deno:readonly */
/**
 * Unit coverage for fetch-os-auctions request shaping and public rate-limit keying.
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler } from "../_shared/testUtils.ts";

const { restore } = await captureHandler(import.meta.url, "./index.ts");
const { buildFilterRequest, getRateLimitKey, mapAuction } = await import("./index.ts");

Deno.test("buildFilterRequest forwards sort fields to OS", () => {
  const request = buildFilterRequest({
    auctionDateFrom: "2026-05-07",
    sortBy: "AUCTION_DATE",
    order: "ASC",
  });

  assertEquals(request.auctionDateFrom, "2026-05-07");
  assertEquals(request.sortBy, "AUCTION_DATE");
  assertEquals(request.order, "ASC");
});

Deno.test("rate-limit key ignores spoofable forwarded IP headers", async () => {
  const first = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { "x-forwarded-for": "1.1.1.1" },
  });
  const second = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { "x-forwarded-for": "2.2.2.2" },
  });

  assertEquals(await getRateLimitKey(first), "anonymous");
  assertEquals(await getRateLimitKey(second), "anonymous");
});

Deno.test("rate-limit key uses a stable token hash for authenticated callers", async () => {
  const first = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { authorization: "Bearer token-a" },
  });
  const second = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { authorization: "Bearer token-b" },
  });

  const firstKey = await getRateLimitKey(first);
  assertEquals(firstKey, await getRateLimitKey(first));
  assertNotEquals(firstKey, await getRateLimitKey(second));
});

Deno.test("mapAuction drops malformed numeric fields", () => {
  const mapped = mapAuction({
    auctionListingId: 42,
    propertyLatitude: "not-lat",
    propertyLongitude: "23.7",
    propertySquareMeters: "not-sqm",
    constructionYear: "not-year",
    firstPriceOffer: "not-price",
    ownershipPercentage: "not-ownership",
  });

  assertEquals(mapped.price, 0);
  assertEquals(mapped.cover_image_url, null);
  assertEquals(mapped.sqm, 1);
  assertEquals(mapped.latitude, null);
  assertEquals(mapped.longitude, 23.7);
  assertEquals(mapped.year_built, null);
  assertEquals(mapped.tags.includes("ownership_pct:NaN"), false);
});

restore();
