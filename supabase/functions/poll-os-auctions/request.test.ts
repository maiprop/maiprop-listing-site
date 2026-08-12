import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT } from "../fetch-os-auctions/auctionFilterRequest.openapi.snapshot.ts";
import { parsePollOsAuctionsRequest } from "./request.ts";

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/poll-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body?: string): Request {
  return new Request("https://functions.supabase.co/poll-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

function stalledRequest(): { request: Request; wasCancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
    cancel: () => {
      cancelled = true;
    },
  });
  return {
    request: new Request("https://functions.supabase.co/poll-os-auctions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    wasCancelled: () => cancelled,
  };
}

Deno.test("poll request treats absent and zero-length bodies as defaults", async () => {
  for (const req of [rawRequest(), rawRequest("")]) {
    assertEquals(await parsePollOsAuctionsRequest(req), {});
  }
});

Deno.test("poll request timeout is classified as HTTP 408", async () => {
  const stalled = stalledRequest();
  const parseWithTestDeadline = parsePollOsAuctionsRequest as unknown as (
    req: Request,
    options: { bodyReadTimeoutMs: number },
  ) => Promise<unknown>;
  const error = await assertRejects(
    () => parseWithTestDeadline(stalled.request, { bodyReadTimeoutMs: 10 }),
    SchemaValidationError,
  );

  assertEquals(error.code, "request_body_timeout");
  assertEquals(error.status, 408);
  assertEquals(stalled.wasCancelled(), true);
});

Deno.test("poll request accepts the documented bounded filter contract", async () => {
  const body = await parsePollOsAuctionsRequest(request({
    page: 0,
    pageSize: 60,
    sampleAcrossGreece: false,
    source: "daily-canonical-pool",
    auctionDateFrom: "2026-08-05",
    auctionDateTo: "2026-09-05",
    propertyCategories: ["RESIDENCE"],
    prefectureId: 10,
    propertyMunicipalityId: 101,
    auctionStatuses: ["OPEN"],
    auctionAmountFrom: 10_000,
    auctionAmountTo: 500_000,
    boundingBox: { north: 41.8, south: 34.8, east: 29.7, west: 19.3 },
    sortBy: "AUCTION_DATE",
    order: "ASC",
  }));

  assertEquals(body.page, 0);
  assertEquals(body.pageSize, 60);
  assertEquals(body.source, "daily-canonical-pool");
  assertEquals(body.prefectureId, 10);
  assertEquals(body.propertyMunicipalityId, 101);
  assertEquals(body.boundingBox?.north, 41.8);
});

Deno.test("poll request rejects non-integer OS location identifiers", async () => {
  for (
    const body of [
      { prefectureId: "10" },
      { prefectureId: "attica-1" },
      { prefectureId: 10.5 },
      { propertyMunicipalityId: "101" },
      { propertyMunicipalityId: "athens-1" },
      { propertyMunicipalityId: 101.5 },
    ]
  ) {
    await assertRejects(
      () => parsePollOsAuctionsRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("poll request matches the provider OpenAPI filter enums", async () => {
  const { propertyCategories, auctionStatuses, sortBy, order } =
    AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums;

  const body = await parsePollOsAuctionsRequest(request({
    propertyCategories,
    auctionStatuses,
    sortBy: sortBy[4],
    order: order[1],
  }));
  assertEquals(body.propertyCategories, [...propertyCategories]);
  assertEquals(body.auctionStatuses, [...auctionStatuses]);
  assertEquals(body.sortBy, sortBy[4]);
  assertEquals(body.order, order[1]);

  for (const value of sortBy) {
    assertEquals(
      (await parsePollOsAuctionsRequest(request({ sortBy: value }))).sortBy,
      value,
    );
  }

  for (const value of order) {
    assertEquals(
      (await parsePollOsAuctionsRequest(request({ order: value }))).order,
      value,
    );
  }

  for (
    const invalidBody of [
      { propertyCategories: ["APARTMENT"] },
      { auctionStatuses: ["SCHEDULED"] },
      { sortBy: "CREATED_AT" },
    ]
  ) {
    await assertRejects(
      () => parsePollOsAuctionsRequest(request(invalidBody)),
      SchemaValidationError,
    );
  }
});

Deno.test("poll request rejects malformed pagination, amounts, and arbitrary filters", async () => {
  for (
    const body of [
      { page: -1 },
      { page: 1.5 },
      { size: "NaN" },
      { pageSize: 0 },
      { auctionAmountFrom: -1 },
      { auctionAmountFrom: "10000" },
      { boundingBox: { arbitrary: true } },
      { arbitraryFilter: "forward-me" },
    ]
  ) {
    await assertRejects(
      () => parsePollOsAuctionsRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("poll request rejects invalid dates and filter tokens", async () => {
  for (
    const body of [
      { auctionDateFrom: "2026-02-30" },
      { auctionDateFrom: "2026-09-05", auctionDateTo: "2026-08-05" },
      { auctionStatuses: ["SCHEDULED;DELETE"] },
      { propertyCategories: [""] },
      { order: "RANDOM" },
    ]
  ) {
    await assertRejects(
      () => parsePollOsAuctionsRequest(request(body)),
      SchemaValidationError,
    );
  }
});
