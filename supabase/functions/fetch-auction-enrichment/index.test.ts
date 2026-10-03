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

const listingId = "44444444-4444-4444-8444-444444444444";

function rawPost(body: string, ip: string): Request {
  return new Request("https://functions.supabase.co/fetch-auction-enrichment", {
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
    rawPost('{"listing_id":', "10.0.3.1"),
    "invalid_json",
  );
});

Deno.test("unknown body fields are rejected before DB, RPC, or OS requests", async () => {
  await assertBoundaryRejection(
    rawPost(
      JSON.stringify({ listing_id: listingId, include: "everything" }),
      "10.0.3.2",
    ),
    "validation_error",
  );
});

Deno.test("oversized bodies return 413 before auth, limiter, DB, or OS", async () => {
  await assertBoundaryRejection(
    rawPost("x".repeat(16_385), "10.0.3.5"),
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
        [rawPost('{"listing_id":', "10.0.3.3"), "invalid_json", 400],
        [
          rawPost(
            JSON.stringify({ listing_id: listingId, include: "everything" }),
            "10.0.3.4",
          ),
          "validation_error",
          400,
        ],
        [rawPost("x".repeat(16_385), "10.0.3.6"), "payload_too_large", 413],
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

Deno.test("a non-auction listing is rejected before OS enrichment or writes", async () => {
  const originalFetch = globalThis.fetch;
  const userId = "55555555-5555-4555-8555-555555555555";
  const calls: Array<{ method: string; url: URL }> = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push({ method: request.method, url });

    if (url.origin !== "https://test.supabase.co" || request.method !== "GET") {
      throw new Error(`Unexpected transport: ${request.method} ${url}`);
    }
    if (url.pathname === "/auth/v1/user" && url.search === "") {
      assertEquals(request.headers.get("authorization"), "Bearer boundary-test-token");
      return Promise.resolve(json({ id: userId, aud: "authenticated", role: "authenticated" }));
    }
    if (url.pathname === "/rest/v1/profiles") {
      assertEquals(url.searchParams.get("user_id"), `eq.${userId}`);
      assertEquals(
        url.searchParams.get("select"),
        "role,participant_type,role_switch_in_progress_at,force_pro_access",
      );
      assertEquals([...url.searchParams.keys()].sort(), ["select", "user_id"]);
      return Promise.resolve(json({
        role: "investor",
        participant_type: null,
        role_switch_in_progress_at: null,
        force_pro_access: true,
      }));
    }
    if (url.pathname === "/rest/v1/listings") {
      assertEquals(url.searchParams.get("id"), `eq.${listingId}`);
      assertEquals(url.searchParams.get("select"), "id,tags,listing_type");
      assertEquals([...url.searchParams.keys()].sort(), ["id", "select"]);
      return Promise.resolve(json({
        id: listingId,
        listing_type: "sale",
        tags: ["os_auction:should-not-be-fetched"],
      }));
    }
    throw new Error(`Unexpected transport: ${request.method} ${url}`);
  }) as typeof fetch;

  try {
    const response = await handler(rawPost(JSON.stringify({ listing_id: listingId }), "10.0.3.7"));
    assertEquals(response.status, 400);
    assertEquals(await jsonBody(response), { ok: false, error: "Listing is not an auction" });
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
    assertEquals(
      calls.map(({ method, url }) => `${method} ${url.pathname}`),
      ["GET /auth/v1/user", "GET /rest/v1/profiles", "GET /rest/v1/listings"],
    );
    assertEquals(calls.filter(({ url }) => url.pathname === "/rest/v1/listings").length, 1);
    assertEquals(calls.filter(({ url }) => url.pathname.startsWith("/rest/v1/rpc/")).length, 0);
    assertEquals(calls.filter(({ url }) => url.pathname === "/auth/login" || url.pathname.includes("/enrichment")).length, 0);
    assertEquals(calls.filter(({ method }) => method !== "GET").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
restoreProductionBoundary();
