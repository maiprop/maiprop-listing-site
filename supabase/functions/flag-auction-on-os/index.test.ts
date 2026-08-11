import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, jsonBody, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);
const {
  handler: productionBoundaryHandler,
  restore: restoreProductionBoundary,
} = await captureHandler(
  import.meta.url,
  "./index.ts?production-boundary",
  { RATE_LIMIT_FORCE_MEMORY: "false" },
);

const listingId = "77777777-7777-4777-8777-777777777777";

function rawPost(body: string, ip: string): Request {
  return new Request("https://functions.supabase.co/flag-auction-on-os", {
    method: "POST",
    headers: {
      authorization: "Bearer boundary-test-token",
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": ip,
    },
    body,
  });
}

async function assertBoundaryRejection(
  request: Request,
  expectedCode: string,
  expectedStatus = 400,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = (() => {
    externalRequests += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const response = await handler(request);
    const payload = await jsonBody(response) as {
      code?: string;
      issues?: unknown[];
    };

    assertEquals(response.status, expectedStatus);
    assertEquals(payload.code, expectedCode);
    assertEquals(Array.isArray(payload.issues), true);
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://maiprop.co",
    );
    assertEquals(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("non-POST requests are rejected before body parsing or external work", async () => {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = (() => {
    externalRequests += 1;
    return Promise.resolve(new Response("{}", { status: 500 }));
  }) as typeof fetch;

  try {
    const response = await handler(req("GET"));
    assertEquals(response.status, 405);
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://maiprop.co",
    );
    assertEquals(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("malformed JSON is rejected before DB, RPC, or OS requests", async () => {
  await assertBoundaryRejection(
    rawPost('{"listing_id":', "10.0.4.1"),
    "invalid_json",
  );
});

Deno.test("unknown body fields are rejected before DB, RPC, or OS requests", async () => {
  await assertBoundaryRejection(
    rawPost(
      JSON.stringify({ listing_id: listingId, action: "delete" }),
      "10.0.4.2",
    ),
    "validation_error",
  );
});

Deno.test("oversized bodies return 413 before auth, limiter, DB, or OS", async () => {
  await assertBoundaryRejection(
    rawPost("x".repeat(16_385), "10.0.4.5"),
    "payload_too_large",
    413,
  );
});

Deno.test("invalid bodies bypass the production DB-backed limiter transport", async () => {
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (() => {
    transportCalls += 1;
    return Promise.resolve(new Response("{}", { status: 500 }));
  }) as typeof fetch;

  try {
    for (
      const [request, expectedCode, expectedStatus] of [
        [rawPost('{"listing_id":', "10.0.4.3"), "invalid_json", 400],
        [
          rawPost(
            JSON.stringify({ listing_id: listingId, action: "delete" }),
            "10.0.4.4",
          ),
          "validation_error",
          400,
        ],
        [rawPost("x".repeat(16_385), "10.0.4.6"), "payload_too_large", 413],
      ] as const
    ) {
      const response = await productionBoundaryHandler(request);
      const payload = await jsonBody(response) as { code?: string };
      assertEquals(response.status, expectedStatus);
      assertEquals(payload.code, expectedCode);
    }
    assertEquals(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
restoreProductionBoundary();
