/**
 * Tests for poll-os-auctions edge function (cron/internal).
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, jsonBody, req } from "../_shared/testUtils.ts";
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
const {
  authorizeSyncRequest,
  fetchWithTimeout,
  isCronBearerRequest,
  OS_AUCTION_PAGE_RESPONSE_MAX_BYTES,
  OS_TOKEN_RESPONSE_MAX_BYTES,
} = await import("./index.ts");

Deno.test("OS polling provider responses use endpoint-specific byte ceilings", () => {
  assertEquals(OS_TOKEN_RESPONSE_MAX_BYTES, 64 * 1_024);
  assertEquals(OS_AUCTION_PAGE_RESPONSE_MAX_BYTES, 8 * 1_024 * 1_024);
});

function rawPost(body: string): Request {
  return new Request("https://functions.supabase.co/poll-os-auctions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": "10.0.1.1",
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

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("non-POST requests never run sync work", async () => {
  const res = await handler(req("GET", undefined, {
    authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
  }));
  assertEquals(res.status, 405);
});

Deno.test("POST without credentials is rejected before sync work starts", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
});

Deno.test("missing credentials are rejected without consuming malformed JSON", async () => {
  const request = rawPost('{"pageSize":');
  request.headers.delete("authorization");

  const res = await handler(request);

  assertEquals(res.status, 401);
  assertEquals(request.bodyUsed, false);
});

Deno.test("OS provider deadline includes a stalled response body", async () => {
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

Deno.test("OS polling streaming responses reject the configured byte ceiling", async () => {
  const fetchWithLimit = fetchWithTimeout as unknown as (
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

Deno.test("malformed JSON is rejected after cron auth but before sync work", async () => {
  await assertBoundaryRejection(rawPost('{"pageSize":'), "invalid_json");
});

Deno.test("oversized request bodies return structured 413 after auth without reading JSON", async () => {
  const request = rawPost("{}");
  request.headers.set("content-length", String(MAX_OS_FILTER_BODY_BYTES + 1));

  await assertBoundaryRejection(request, "payload_too_large", 413);
  assertEquals(request.bodyUsed, false);
});

Deno.test("unknown OS enum values are rejected after cron auth but before sync work", async () => {
  await assertBoundaryRejection(
    req("POST", { sortBy: "CREATED_AT" }, {
      authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
      "x-forwarded-for": "10.0.1.2",
    }),
    "validation_error",
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
    assertEquals(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a guarded zero-row canonical update fails polling before pool pruning", async () => {
  const originalFetch = globalThis.fetch;
  let updateRequests = 0;
  let pruneReads = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = String(request?.url ?? input);
    const method = request?.method ?? init?.method ?? "GET";

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
    if (url.includes("/rest/v1/listings") && method === "HEAD") {
      return Promise.resolve(new Response(null, {
        status: 200,
        headers: { "content-range": "*/0" },
      }));
    }
    if (url.includes("/rest/v1/listings") && method === "GET") {
      if (url.includes("order=updated_at")) {
        pruneReads += 1;
        return Promise.resolve(new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
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
      page: 0,
      pageSize: 1,
      sampleAcrossGreece: false,
    }, {
      authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
      "x-forwarded-for": "10.0.9.2",
    }));
    const payload = await jsonBody(response) as {
      ok?: boolean;
      error?: string;
    };

    assertEquals(updateRequests, 1);
    assertEquals(pruneReads, 0);
    assertEquals(response.status, 500);
    assertEquals(payload.ok, false);
    assertEquals(payload.error, "canonical_os_listing_changed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cron authorization requires the exact bearer secret, not spoofable headers", async () => {
  const spoofedHeader = req("POST", {}, {
    "x-forwarded-for": "127.0.0.1",
    "x-maiprop-cron": "true",
  });
  assertEquals(await isCronBearerRequest(spoofedHeader), false);

  const wrongBearer = req("POST", {}, {
    authorization: "Bearer wrong-secret",
    "x-forwarded-for": "127.0.0.1",
  });
  assertEquals(await isCronBearerRequest(wrongBearer), false);

  const validBearer = req("POST", {}, {
    authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
  });
  assertEquals(await isCronBearerRequest(validBearer), true);
});

Deno.test("cron authorization does not call Supabase Auth when bearer secret matches", async () => {
  let getUserCalls = 0;
  const sb = {
    auth: {
      getUser() {
        getUserCalls += 1;
        return Promise.resolve({
          data: { user: null },
          error: { message: "should not be called" },
        });
      },
    },
    from() {
      throw new Error("profile lookup should not be called for cron");
    },
  };

  const result = await authorizeSyncRequest(
    req("POST", {}, { authorization: `Bearer ${Deno.env.get("CRON_SECRET")}` }),
    sb as never,
    {},
  );

  assertEquals(result instanceof Response, false);
  assertEquals("kind" in result && result.kind, "cron");
  assertEquals(getUserCalls, 0);
});

restore();
restoreProductionBoundary();

let pollClock = Date.now();
async function pollOutcomeScenario(
  mode: "import" | "empty" | "full" | "config" | "primary" | "partial",
  logFailure?: "resolved" | "rejected",
) {
  const oldFetch = globalThis.fetch;
  const oldNow = Date.now;
  pollClock += 60_001;
  Date.now = () => pollClock;
  let logCalls = 0, providerCalls = 0, inserted = 0;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");
      if (url.pathname === "/rest/v1/sync_log") {
        logCalls++;
        if (logFailure === "rejected") throw new Error("log-private");
        return logFailure === "resolved"
          ? json({ message: "log-private" }, 500)
          : new Response(null, { status: 201 });
      }
      if (url.pathname === "/rest/v1/listings") {
        if (method === "HEAD") {
          return new Response(null, {
            headers: {
              "content-range": `*/${mode === "full" ? 600 : inserted}`,
            },
          });
        }
        if (method === "GET") return json([]);
        if (method === "POST") {
          if (mode === "partial") {
            return json(
              { code: "23514", message: "fixture insert rejection" },
              400,
            );
          }
          inserted++;
          return json([{ id: "44444444-4444-4444-8444-444444444444" }], 201);
        }
        if (method === "PATCH") return json([]);
      }
      if (url.pathname === "/auth/login") {
        providerCalls++;
        return mode === "primary"
          ? json({ message: "fixture authentication failure" }, 401)
          : json({ token: "fixture-token" });
      }
      if (url.pathname === "/api/v1/auctions/filter/details") {
        providerCalls++;
        return json({
          data: mode === "empty" ? [] : [{
            auctionListingId: "fixture-auction",
            firstPriceOffer: 100000,
            propertyMunicipalityName: "Athens",
          }],
          responseMetadata: {
            pagination: { totalElements: mode === "empty" ? 0 : 1 },
          },
        });
      }
      throw new Error(`Unexpected fake transport ${method} ${url.pathname}`);
    }) as typeof fetch;
  if (mode === "config") Deno.env.delete("MAIPROP_OS_PASSWORD");
  try {
    const response = await handler(
      req("POST", { page: 0, pageSize: 1, sampleAcrossGreece: false }, {
        authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
      }),
    );
    return {
      response,
      body: await response.json(),
      logCalls,
      providerCalls,
      inserted,
    };
  } finally {
    globalThis.fetch = oldFetch;
    Date.now = oldNow;
    if (mode === "config") Deno.env.set("MAIPROP_OS_PASSWORD", "testpass");
  }
}
for (const failure of ["resolved", "rejected"] as const) {
  Deno.test(`poll preserves imported work when log ${failure}`, async () => {
    const result = await pollOutcomeScenario("import", failure);
    assertEquals(result.response.status, 503);
    assertEquals(result.body.ok, false);
    assertEquals(result.body.imported, 1);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.body.import_complete, true);
    assertEquals(result.logCalls, 1);
  });
}
for (const failure of ["resolved", "rejected"] as const) {
  Deno.test(`poll preserves primary error when log ${failure}`, async () => {
    const result = await pollOutcomeScenario("primary", failure);
    assertEquals(result.response.status, 500);
    assertEquals(result.body.error.includes("OS auth failed"), true);
    assertEquals(result.body.error.includes("log-private"), false);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.logCalls, 1);
  });
}
for (const mode of ["full", "empty", "config"] as const) {
  Deno.test(`poll records ${mode} outcome and reports persistence failure`, async () => {
    for (const failure of [undefined, "resolved"] as const) {
      const result = await pollOutcomeScenario(mode, failure);
      assertEquals(result.response.status, failure ? 503 : 200);
      assertEquals(result.logCalls, 1);
      assertEquals(result.body.persistence_complete, !failure);
      if (mode !== "empty") assertEquals(result.providerCalls, 0);
    }
  });
}
Deno.test("poll does not label rejected catalogue items complete", async () => {
  const result = await pollOutcomeScenario("partial");
  assertEquals(result.response.status, 503);
  assertEquals(result.body.ok, false);
  assertEquals(result.body.errors, 1);
  assertEquals(result.body.imported, 0);
  assertEquals(result.logCalls, 1);
});

Deno.test('poll ordinary import reports both catalogue and outcome persistence', async () => {
  const result = await pollOutcomeScenario('import');
  assertEquals(result.response.status, 200);
  assertEquals(result.body.ok, true);
  assertEquals(result.body.import_complete, true);
  assertEquals(result.body.persistence_complete, true);
  assertEquals([result.body.imported, result.body.updated, result.body.errors], [1, 0, 0]);
  assertEquals(result.logCalls, 1);
});
