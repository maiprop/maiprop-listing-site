import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT } from "../fetch-os-auctions/auctionFilterRequest.openapi.snapshot.ts";
import { parseFullSyncRequest } from "./request.ts";

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/full-sync-from-os", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body?: string): Request {
  return new Request("https://functions.supabase.co/full-sync-from-os", {
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
    request: new Request("https://functions.supabase.co/full-sync-from-os", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    wasCancelled: () => cancelled,
  };
}

Deno.test("full-sync request treats absent and zero-length bodies as defaults", async () => {
  for (const req of [rawRequest(), rawRequest("")]) {
    assertEquals(await parseFullSyncRequest(req), {});
  }
});

Deno.test("full-sync request timeout is classified as HTTP 408", async () => {
  const stalled = stalledRequest();
  const parseWithTestDeadline = parseFullSyncRequest as unknown as (
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

Deno.test("full-sync request accepts bounded pagination and known OS filters", async () => {
  const body = await parseFullSyncRequest(request({
    pageSize: 100,
    maxPages: 200,
    startPage: 0,
    replaceAll: true,
    auctionDateFrom: "2026-08-05",
    auctionDateTo: "2026-09-05",
    propertyCategories: ["RESIDENCE", "STORE"],
    prefectureId: 10,
    propertyMunicipalityId: 101,
    auctionStatuses: ["OPEN"],
  }));

  assertEquals(body.pageSize, 100);
  assertEquals(body.maxPages, 200);
  assertEquals(body.propertyCategories, ["RESIDENCE", "STORE"]);
  assertEquals(body.prefectureId, 10);
  assertEquals(body.propertyMunicipalityId, 101);
});

Deno.test("full-sync request rejects non-integer OS location identifiers", async () => {
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
      () => parseFullSyncRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("full-sync request matches the provider OpenAPI filter enums", async () => {
  const { propertyCategories, auctionStatuses } =
    AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums;

  const body = await parseFullSyncRequest(request({
    propertyCategories,
    auctionStatuses,
  }));
  assertEquals(body.propertyCategories, [...propertyCategories]);
  assertEquals(body.auctionStatuses, [...auctionStatuses]);

  for (
    const invalidBody of [
      { propertyCategories: ["APARTMENT"] },
      { auctionStatuses: ["SCHEDULED"] },
    ]
  ) {
    await assertRejects(
      () => parseFullSyncRequest(request(invalidBody)),
      SchemaValidationError,
    );
  }
});

Deno.test("full-sync request rejects unsafe pagination", async () => {
  for (
    const body of [
      { pageSize: "NaN" },
      { pageSize: 1.5 },
      { pageSize: 0 },
      { maxPages: -1 },
      { maxPages: 1.25 },
      { startPage: -1 },
      { startPage: 0.5 },
    ]
  ) {
    await assertRejects(
      () => parseFullSyncRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("full-sync request rejects unknown filters and invalid dates", async () => {
  for (
    const body of [
      { arbitraryFilter: { forwarded: true } },
      { auctionDateFrom: "2026-02-30" },
      { auctionDateFrom: "2026-09-05", auctionDateTo: "2026-08-05" },
      { propertyCategories: ["RESIDENCE", "DROP TABLE"] },
    ]
  ) {
    await assertRejects(
      () => parseFullSyncRequest(request(body)),
      SchemaValidationError,
    );
  }
});
