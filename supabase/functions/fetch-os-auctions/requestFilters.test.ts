import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT } from "./auctionFilterRequest.openapi.snapshot.ts";
import { MAX_OS_FILTER_BODY_BYTES } from "./osFilterContract.ts";
import { parseAuctionRequest } from "./requestFilters.ts";

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/fetch-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body?: string): Request {
  return new Request("https://functions.supabase.co/fetch-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

async function assertPayloadTooLarge(req: Request): Promise<void> {
  const error = await assertRejects(
    () => parseAuctionRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
  assertEquals(error.issues, [{
    code: "payload_too_large",
    path: [],
    message: "Request body too large",
  }]);
}

Deno.test("fetch-os request treats absent and zero-length bodies as defaults", async () => {
  for (const req of [rawRequest(), rawRequest("")]) {
    assertEquals(await parseAuctionRequest(req), {});
  }
});

Deno.test("fetch-os request rejects oversized Content-Length without reading the body", async () => {
  const req = new Request("https://functions.supabase.co/fetch-os-auctions", {
    method: "POST",
    headers: {
      "content-length": String(MAX_OS_FILTER_BODY_BYTES + 1),
      "content-type": "application/json",
    },
    body: "{}",
  });

  await assertPayloadTooLarge(req);
  assertEquals(req.bodyUsed, false);
});

Deno.test("fetch-os request cancels chunked bodies above the raw byte cap", async () => {
  const rawBody = new TextEncoder().encode(JSON.stringify({
    prefectureId: "x".repeat(MAX_OS_FILTER_BODY_BYTES),
  }));
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= rawBody.length) {
        return new Promise(() => {});
      }
      const nextOffset = Math.min(offset + 1_024, rawBody.length);
      controller.enqueue(rawBody.slice(offset, nextOffset));
      offset = nextOffset;
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request("https://functions.supabase.co/fetch-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
  });

  await assertPayloadTooLarge(req);
  assertEquals(cancelled, true);
});

Deno.test("fetch-os request cancels a stalled body at the read deadline", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request("https://functions.supabase.co/fetch-os-auctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
  });

  const error = await assertRejects(
    () => parseAuctionRequest(req, { bodyReadTimeoutMs: 20 }),
    SchemaValidationError,
  );
  assertEquals(error.code, "request_body_timeout");
  assertEquals(cancelled, true);
});

Deno.test("fetch-os request accepts bounded public catalogue filters", async () => {
  const body = await parseAuctionRequest(request({
    page: 2,
    pageSize: 60,
    sampleAcrossGreece: false,
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
    order: "DESC",
  }));

  assertEquals(body.page, 2);
  assertEquals(body.pageSize, 60);
  assertEquals(body.prefectureId, 10);
  assertEquals(body.propertyMunicipalityId, 101);
  assertEquals(body.order, "DESC");
});

Deno.test("fetch-os request rejects non-integer OS location identifiers", async () => {
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
      () => parseAuctionRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("pinned OS enum snapshot has reproducible integrity metadata", async () => {
  const { metadata, enums } = AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(enums)),
  );
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  assertEquals(metadata.snapshotVersion, 2);
  assertEquals(
    metadata.sourceDocument,
    "https://app.os.maiprop.co/v3/api-docs",
  );
  assertEquals(metadata.sourceEndpointVersion, "v3");
  assertEquals(
    metadata.schemaPath,
    "#/components/schemas/AuctionFilterRequest",
  );
  assertEquals(actualHash, metadata.enumPayloadSha256);
});

Deno.test("fetch-os request matches the provider OpenAPI filter enums", async () => {
  const { propertyCategories, auctionStatuses, sortBy, order } =
    AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums;

  const body = await parseAuctionRequest(request({
    propertyCategories,
    auctionStatuses,
    sortBy: sortBy[3],
    order: order[1],
  }));
  assertEquals(body.propertyCategories, [...propertyCategories]);
  assertEquals(body.auctionStatuses, [...auctionStatuses]);
  assertEquals(body.sortBy, sortBy[3]);
  assertEquals(body.order, order[1]);

  for (const value of sortBy) {
    assertEquals(
      (await parseAuctionRequest(request({ sortBy: value }))).sortBy,
      value,
    );
  }

  for (const value of order) {
    assertEquals(
      (await parseAuctionRequest(request({ order: value }))).order,
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
      () => parseAuctionRequest(request(invalidBody)),
      SchemaValidationError,
    );
  }
});

Deno.test("fetch-os request rejects non-finite pagination and untyped filters", async () => {
  for (
    const body of [
      { page: -1 },
      { page: 1.5 },
      { pageSize: "NaN" },
      { pageSize: 0 },
      { auctionAmountFrom: -1 },
      { auctionAmountTo: "500000" },
      { boundingBox: { north: 1, south: 2, east: 3, west: 4 } },
      { arbitraryFilter: { passThrough: true } },
    ]
  ) {
    await assertRejects(
      () => parseAuctionRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("fetch-os request rejects invalid calendar dates and token values", async () => {
  for (
    const body of [
      { auctionDateFrom: "2026-02-30" },
      { auctionDateFrom: "2026-09-05", auctionDateTo: "2026-08-05" },
      { propertyCategories: ["RESIDENCE;DROP"] },
      { auctionStatuses: [""] },
      { order: "RANDOM" },
    ]
  ) {
    await assertRejects(
      () => parseAuctionRequest(request(body)),
      SchemaValidationError,
    );
  }
});
