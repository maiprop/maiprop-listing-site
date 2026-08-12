import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseApplyDataInputCreditRequest } from "./request.ts";

const dataInputId = "33333333-3333-4333-8333-333333333333";
const maxRequestBodyBytes = 16_384;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/apply-data-input-credit", {
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
    data_input_id: dataInputId,
    padding: "x".repeat(maxRequestBodyBytes),
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
      "https://functions.supabase.co/apply-data-input-credit",
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
    () => parseApplyDataInputCreditRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
}

Deno.test("apply-data-input-credit accepts only a platform data-input UUID", async () => {
  assertEquals(
    await parseApplyDataInputCreditRequest(
      request({ data_input_id: dataInputId }),
    ),
    { data_input_id: dataInputId },
  );
});

Deno.test("apply-data-input-credit rejects invalid IDs and invented actions", async () => {
  for (
    const body of [
      { data_input_id: "input-1" },
      { data_input_id: dataInputId, action: "apply" },
      { data_input_id: dataInputId, applied_at: "2026-08-05" },
    ]
  ) {
    await assertRejects(
      () => parseApplyDataInputCreditRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("apply-data-input-credit rejects declared oversized bodies without reading them", async () => {
  const req = new Request(
    "https://functions.supabase.co/apply-data-input-credit",
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

Deno.test("apply-data-input-credit cancels chunked bodies above 16 KiB", async () => {
  const oversized = oversizedChunkedRequest();
  await assertPayloadTooLarge(oversized.request);
  assertEquals(oversized.wasCancelled(), true);
});
