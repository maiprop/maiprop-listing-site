import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parsePastDealsRequest } from "./request.ts";

const listingId = "55555555-5555-4555-8555-555555555555";
const maxRequestBodyBytes = 16_384;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/fetch-past-deals-from-os", {
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
      "https://functions.supabase.co/fetch-past-deals-from-os",
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
    () => parsePastDealsRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
}

Deno.test("past-deals accepts only a platform listing UUID", async () => {
  assertEquals(
    await parsePastDealsRequest(request({ listing_id: listingId })),
    {
      listing_id: listingId,
    },
  );
});

Deno.test("past-deals rejects malformed IDs and unsupported pagination", async () => {
  for (
    const body of [
      { listing_id: "auction-123" },
      { listing_id: listingId, page: -1 },
      { listing_id: listingId, pageSize: 100 },
    ]
  ) {
    await assertRejects(
      () => parsePastDealsRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("past-deals rejects declared oversized bodies without reading them", async () => {
  const req = new Request(
    "https://functions.supabase.co/fetch-past-deals-from-os",
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

Deno.test("past-deals cancels chunked bodies above 16 KiB", async () => {
  const oversized = oversizedChunkedRequest();
  await assertPayloadTooLarge(oversized.request);
  assertEquals(oversized.wasCancelled(), true);
});
