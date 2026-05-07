/* global Deno:readonly */
/**
 * Unit coverage for fetch-os-auctions request shaping and public rate-limit keying.
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler } from "../_shared/testUtils.ts";

const { restore } = await captureHandler(import.meta.url, "./index.ts");
const { buildFilterRequest, getRateLimitKey } = await import("./index.ts");

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

restore();
