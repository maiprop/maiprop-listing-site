/**
 * Tests for full-sync-from-os edge function (admin only).
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authedReq,
  captureHandler,
  jsonBody,
  req,
} from "../_shared/testUtils.ts";
import { MAX_OS_FILTER_BODY_BYTES } from "../fetch-os-auctions/osFilterContract.ts";

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
const fullSyncModule = await import("./index.ts");

Deno.test("OS full-sync provider responses use endpoint-specific byte ceilings", () => {
  assertEquals(fullSyncModule.OS_TOKEN_RESPONSE_MAX_BYTES, 64 * 1_024);
  assertEquals(
    fullSyncModule.OS_AUCTION_PAGE_RESPONSE_MAX_BYTES,
    8 * 1_024 * 1_024,
  );
});

function rawPost(body: string): Request {
  return new Request("https://functions.supabase.co/full-sync-from-os", {
    method: "POST",
    headers: {
      authorization: "Bearer boundary-test-token",
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": "10.0.0.1",
    },
    body,
  });
}

Deno.test("replaceAll is rejected before listings or provider state can change", async () => {
  const originalFetch = globalThis.fetch;
  let listingRequests = 0;
  let providerRequests = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "admin-1", email: "admin@test.local" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(
        new Response(JSON.stringify({ role: "admin" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/listings")) listingRequests += 1;
    else providerRequests += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    for (const body of [{ replaceAll: true }, { replace_all: true }]) {
      const response = await handler(rawPost(JSON.stringify(body)));
      const payload = await jsonBody(response) as { code?: string };
      assertEquals(response.status, 409);
      assertEquals(payload.code, "replace_all_disabled");
    }
    assertEquals(listingRequests, 0);
    assertEquals(providerRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function assertBoundaryRejection(
  request: Request,
  expectedCode: string,
  expectedStatus = 400,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  let authRequests = 0;
  let businessRequests = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      authRequests += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "admin-1", email: "admin@test.local" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      authRequests += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ role: "admin" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    businessRequests += 1;
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
    assertEquals(authRequests >= 1, true);
    assertEquals(businessRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("non-POST requests cannot trigger the empty-body sync defaults", async () => {
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
});

Deno.test("missing Authorization is rejected without consuming malformed JSON", async () => {
  const request = rawPost('{"pageSize":');
  request.headers.delete("authorization");

  const res = await handler(request);

  assertEquals(res.status, 401);
  assertEquals(request.bodyUsed, false);
});

Deno.test("OS provider deadline includes a stalled response body", async () => {
  const fetchWithTimeout = (
    fullSyncModule as unknown as {
      fetchWithTimeout?: (
        url: string,
        init: RequestInit,
        timeoutMs: number,
      ) => Promise<Response>;
    }
  ).fetchWithTimeout;
  assertEquals(typeof fetchWithTimeout, "function");
  if (!fetchWithTimeout) return;

  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull: () => new Promise<void>(() => undefined),
          cancel: () => {
            cancelled = true;
          },
        }),
      ),
    )) as typeof fetch;

  try {
    const startedAt = Date.now();
    const error = await assertRejects(
      () => fetchWithTimeout("https://os.test/stalled", {}, 20),
      Error,
    );
    assertEquals(error.name, "AbortError");
    assertEquals(Date.now() - startedAt < 250, true);
    assertEquals(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OS full-sync streaming responses reject the configured byte ceiling", async () => {
  const fetchWithLimit = fullSyncModule.fetchWithTimeout as unknown as (
    url: string,
    init: RequestInit,
    timeoutMs: number,
    maxResponseBytes: number,
  ) => Promise<Response>;
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(5));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    )) as typeof fetch;

  try {
    const error = await assertRejects(
      () => fetchWithLimit("https://os.test/oversized", {}, 1_000, 4),
      Error,
    ) as Error & { code?: string };
    assertEquals(error.name, "ProviderResponseTooLargeError");
    assertEquals(error.code, "provider_response_too_large");
    assertEquals(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("fake Bearer returns 401 (admin check fails)", async () => {
  const res = await handler(authedReq("POST", { pageSize: 10 }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("malformed JSON is rejected after auth but before sync work", async () => {
  await assertBoundaryRejection(rawPost('{"pageSize":'), "invalid_json");
});

Deno.test("oversized request bodies return structured 413 after auth without reading JSON", async () => {
  const request = rawPost("{}");
  request.headers.set("content-length", String(MAX_OS_FILTER_BODY_BYTES + 1));

  await assertBoundaryRejection(request, "payload_too_large", 413);
  assertEquals(request.bodyUsed, false);
});

Deno.test("unknown OS enum values are rejected after auth but before sync work", async () => {
  await assertBoundaryRejection(
    req("POST", { propertyCategories: ["APARTMENT"] }, {
      authorization: "Bearer boundary-test-token",
      "x-forwarded-for": "10.0.0.2",
    }),
    "validation_error",
  );
});

Deno.test("invalid bodies bypass the production DB-backed limiter transport", async () => {
  const originalFetch = globalThis.fetch;
  let businessTransportCalls = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "admin-1", email: "admin@test.local" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(
        new Response(JSON.stringify({ role: "admin" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    businessTransportCalls += 1;
    return Promise.resolve(new Response("{}", { status: 500 }));
  }) as typeof fetch;

  try {
    for (
      const [request, expectedCode, expectedStatus] of [
        [rawPost('{"pageSize":'), "invalid_json", 400],
        [rawPost(JSON.stringify({ order: "RANDOM" })), "validation_error", 400],
        [
          rawPost("x".repeat(MAX_OS_FILTER_BODY_BYTES + 1)),
          "payload_too_large",
          413,
        ],
      ] as const
    ) {
      const response = await productionBoundaryHandler(request);
      const payload = await jsonBody(response) as { code?: string };
      assertEquals(response.status, expectedStatus);
      assertEquals(payload.code, expectedCode);
    }
    assertEquals(businessTransportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a guarded zero-row canonical update fails the full sync request closed", async () => {
  const originalFetch = globalThis.fetch;
  let updateRequests = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = String(request?.url ?? input);
    const method = request?.method ?? init?.method ?? "GET";

    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({
        user: { id: "admin-1", email: "admin@test.local" },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(new Response(JSON.stringify({ role: "admin" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    if (url.endsWith("/auth/login")) {
      return Promise.resolve(new Response(JSON.stringify({ token: "os-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    if (url.includes("/api/v1/auctions/filter/details")) {
      return Promise.resolve(new Response(JSON.stringify({
        data: [{
          auctionListingId: "guarded-auction",
          firstPriceOffer: 120_000,
          propertyMunicipalityName: "Athens",
          propertyPrefectureName: "Attica",
        }],
        responseMetadata: { pagination: { totalElements: 1 } },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (url.includes("/rest/v1/listings") && method === "GET") {
      return Promise.resolve(new Response(JSON.stringify([{
        id: "listing-1",
        os_auction_id: "guarded-auction",
        tags: ["os_auction:guarded-auction", "source:maiprop-os"],
      }]), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (url.includes("/rest/v1/listings") && method === "PATCH") {
      updateRequests += 1;
      return Promise.resolve(new Response(null, {
        status: 204,
        headers: { "content-range": "*/0" },
      }));
    }
    if (url.includes("/rest/v1/sync_log")) {
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    return Promise.reject(new Error(`unexpected fetch ${method} ${url}`));
  }) as typeof fetch;

  try {
    const response = await handler(req("POST", {
      pageSize: 1,
      maxPages: 1,
    }, {
      authorization: "Bearer boundary-test-token",
      "x-forwarded-for": "10.0.9.1",
    }));
    const payload = await jsonBody(response) as {
      ok?: boolean;
      error?: string;
    };

    assertEquals(updateRequests, 1);
    assertEquals(response.status, 500);
    assertEquals(payload.ok, false);
    assertEquals(payload.error, "canonical_os_listing_changed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
restoreProductionBoundary();
