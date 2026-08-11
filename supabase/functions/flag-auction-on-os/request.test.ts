import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseFlagAuctionRequest } from "./request.ts";

const listingId = "77777777-7777-4777-8777-777777777777";
const maxRequestBodyBytes = 16_384;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/flag-auction-on-os", {
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
    request: new Request("https://functions.supabase.co/flag-auction-on-os", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
    }),
    wasCancelled: () => cancelled,
  };
}

async function assertPayloadTooLarge(req: Request): Promise<void> {
  const error = await assertRejects(
    () => parseFlagAuctionRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
}

Deno.test("flag request accepts a UUID and a bounded string message", async () => {
  assertEquals(
    await parseFlagAuctionRequest(request({
      listing_id: listingId,
      message: "The auction address appears incorrect.",
    })),
    {
      listing_id: listingId,
      message: "The auction address appears incorrect.",
    },
  );
});

Deno.test("flag request rejects invalid IDs, messages, and invented actions", async () => {
  for (
    const body of [
      { listing_id: "auction-123" },
      { listing_id: listingId, message: { text: "bypass" } },
      { listing_id: listingId, message: "x".repeat(1001) },
      { listing_id: listingId, action: "delete" },
    ]
  ) {
    await assertRejects(
      () => parseFlagAuctionRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("flag request rejects declared oversized bodies without reading them", async () => {
  const req = new Request("https://functions.supabase.co/flag-auction-on-os", {
    method: "POST",
    headers: {
      "content-length": String(maxRequestBodyBytes + 1),
      "content-type": "application/json",
    },
    body: "{}",
  });

  await assertPayloadTooLarge(req);
  assertEquals(req.bodyUsed, false);
});

Deno.test("flag request cancels chunked bodies above 16 KiB", async () => {
  const oversized = oversizedChunkedRequest();
  await assertPayloadTooLarge(oversized.request);
  assertEquals(oversized.wasCancelled(), true);
});
