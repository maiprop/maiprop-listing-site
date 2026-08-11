import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseReportRequest } from "./request.ts";

const listingId = "66666666-6666-4666-8666-666666666666";
const maxRequestBodyBytes = 32_768;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/fetch-report-from-os", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function oversizedChunkedRequest(): {
  request: Request;
  wasCancelled: () => boolean;
} {
  const bytes = new TextEncoder().encode(JSON.stringify({
    listing_id: listingId,
    report_type: "valuation",
    padding: "x".repeat(maxRequestBodyBytes * 2),
  }));
  let offset = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const nextOffset = Math.min(offset + 1_024, bytes.length);
      controller.enqueue(bytes.slice(offset, nextOffset));
      offset = nextOffset;
      if (offset >= bytes.length) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request("https://functions.supabase.co/fetch-report-from-os", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    wasCancelled: () => cancelled,
  };
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
    request: new Request("https://functions.supabase.co/fetch-report-from-os", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    wasCancelled: () => cancelled,
  };
}

Deno.test("report request accepts allowed types, languages, and ISO dates", async () => {
  assertEquals(
    await parseReportRequest(request({
      listing_id: listingId,
      report_type: "valuation",
      lang: "el",
      since: "2026-01-01",
      to: "2026-08-05",
    })),
    {
      listing_id: listingId,
      report_type: "valuation",
      lang: "el",
      since: "2026-01-01",
      to: "2026-08-05",
    },
  );
});

Deno.test("report request preserves the bounded listing snapshot sent by the UI", async () => {
  const listing = {
    id: listingId,
    address: "10 Example Street",
    city: "Athens",
    latitude: 37.9838,
    longitude: 23.7275,
    sqm: 92,
    property_type: "apartment",
    floor: 3,
    year_built: 2004,
  };

  const parsed = await parseReportRequest(request({
    listing_id: listingId,
    report_type: "valuation",
    listing,
  }));

  assertEquals(parsed.listing, listing);
});

Deno.test("report request rejects invalid IDs, dates, types, and actions", async () => {
  const base = { listing_id: listingId, report_type: "valuation" };
  for (
    const body of [
      { ...base, listing_id: "external-listing" },
      { ...base, report_type: "admin" },
      { ...base, lang: "fr" },
      { ...base, since: "2026-02-30" },
      { ...base, since: "2026-08-05", to: "2026-01-01" },
      { ...base, listing: { id: listingId, arbitrary: true } },
      {
        ...base,
        listing: { id: "77777777-7777-4777-8777-777777777777" },
      },
      { ...base, action: "regenerate" },
    ]
  ) {
    await assertRejects(
      () => parseReportRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("report request caps chunked bodies and cancels the producer", async () => {
  const oversized = oversizedChunkedRequest();
  const error = await assertRejects(
    () => parseReportRequest(oversized.request),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
  assertEquals(oversized.wasCancelled(), true);
});

Deno.test("report request times out and cancels a stalled request body", async () => {
  const stalled = stalledRequest();
  const parseWithTestDeadline = parseReportRequest as unknown as (
    req: Request,
    options: { timeoutMs: number },
  ) => Promise<unknown>;
  let ceilingTimer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    parseWithTestDeadline(stalled.request, { timeoutMs: 10 }).then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    ),
    new Promise<{ kind: "ceiling" }>((resolve) => {
      ceilingTimer = setTimeout(() => resolve({ kind: "ceiling" }), 100);
    }),
  ]);
  if (ceilingTimer !== undefined) clearTimeout(ceilingTimer);

  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.error instanceof SchemaValidationError, true);
    assertEquals(
      (outcome.error as SchemaValidationError).code,
      "request_timeout",
    );
    assertEquals((outcome.error as SchemaValidationError).status, 408);
  }
  assertEquals(stalled.wasCancelled(), true);
});
