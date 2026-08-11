import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseAuctionEnrichmentRequest } from "./request.ts";

const listingId = "44444444-4444-4444-8444-444444444444";
const maxRequestBodyBytes = 16_384;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/fetch-auction-enrichment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function oversizedChunkedRequest(): {
  request: Request;
  wasCancelled: () => boolean;
} {
  const body = new TextEncoder().encode(JSON.stringify({
    listing_id: listingId,
    padding: "x".repeat(maxRequestBodyBytes * 2),
  }));
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.length) {
        controller.close();
        return;
      }
      const nextOffset = Math.min(offset + 1_024, body.length);
      controller.enqueue(body.slice(offset, nextOffset));
      offset = nextOffset;
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    request: new Request(
      "https://functions.supabase.co/fetch-auction-enrichment",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
      },
    ),
    wasCancelled: () => cancelled,
  };
}

async function assertPayloadTooLarge(req: Request): Promise<void> {
  const error = await assertRejects(
    () => parseAuctionEnrichmentRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
}

Deno.test("auction enrichment accepts a platform listing UUID", async () => {
  assertEquals(
    await parseAuctionEnrichmentRequest(request({ listing_id: listingId })),
    { listing_id: listingId },
  );
});

Deno.test("auction enrichment rejects malformed IDs and unknown fields", async () => {
  for (
    const body of [
      { listing_id: "os_auction:123" },
      { listing_id: listingId, include: "everything" },
    ]
  ) {
    await assertRejects(
      () => parseAuctionEnrichmentRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("auction enrichment rejects declared oversized bodies without reading them", async () => {
  const req = new Request(
    "https://functions.supabase.co/fetch-auction-enrichment",
    {
      method: "POST",
      headers: {
        "content-length": String(maxRequestBodyBytes + 1),
        "content-type": "application/json",
      },
      body: "{}",
    },
  );

  await assertPayloadTooLarge(req);
  assertEquals(req.bodyUsed, false);
});

Deno.test("auction enrichment cancels chunked bodies above 16 KiB", async () => {
  const oversized = oversizedChunkedRequest();
  await assertPayloadTooLarge(oversized.request);
  assertEquals(oversized.wasCancelled(), true);
});
