/**
 * Tests for public record-listing-view edge function guardrails.
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  RATE_LIMIT_FORCE_MEMORY: "true",
  VIEW_TRACKING_MAX_REQUESTS_PER_MINUTE: "1",
});
const {
  VIEW_RATE_LIMIT_TIMEOUT_MS,
  ViewTrackingDeadlineError,
  withViewTrackingDeadline,
} = await import("./index.ts");

Deno.test("best-effort view rate limiting has a sub-500ms database budget", () => {
  assertEquals(VIEW_RATE_LIMIT_TIMEOUT_MS <= 500, true);
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET returns 405", async () => {
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("invalid listing id is rejected before RPC work", async () => {
  const res = await handler(req("POST", { listingId: "not-a-uuid" }));
  assertEquals(res.status, 400);
});

Deno.test("invalid JSON is rejected before service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid JSON body");
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("malformed UUID-shaped listing id is rejected before service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "------------------------------------",
  }));
  assertEquals(res.status, 400);
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("missing service role configuration fails closed", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 503);
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("sampled-out view returns success without service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "0");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true, sampled: false });
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("sampled-out traffic does not consume the persisted-view rate budget", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "0");
  const makeRequest = () => new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": "198.51.100.42",
    },
    body: JSON.stringify({
      listingId: "11111111-1111-4111-8111-111111111111",
    }),
  });

  assertEquals((await handler(makeRequest())).status, 200);
  assertEquals((await handler(makeRequest())).status, 200);
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("does not persist an anonymous view when bearer auth cannot be verified", async () => {
  const originalFetch = globalThis.fetch;
  let viewRpcCalled = false;
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.set(
    "SUPABASE_SERVICE_ROLE_KEY",
    "placeholder-supabase-service-role",
  );

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ message: "auth unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/record_listing_view")) {
      viewRpcCalled = true;
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listingId: "11111111-1111-4111-8111-111111111111",
    }, {
      authorization: "Bearer unavailable-token",
      "x-forwarded-for": "198.51.100.87",
    }));

    assertEquals(res.status, 202);
    assertEquals(await res.json(), {
      success: true,
      recorded: false,
      reason: "auth_unavailable",
    });
    assertEquals(viewRpcCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
  }
});

Deno.test("treats the shared Supabase publishable key bearer as anonymous traffic", async () => {
  const originalFetch = globalThis.fetch;
  const publishableKey = "placeholder-publishable-key";
  let authLookupCalled = false;
  let recordedViewerId: string | null | undefined;
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "placeholder-supabase-service-role");

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url.includes("/auth/v1/user")) {
      authLookupCalled = true;
      return new Response(JSON.stringify({ message: "anonymous key is not a user JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (request.url.includes("/rest/v1/rpc/record_listing_view")) {
      const body = await request.json() as { p_viewer_id?: string | null };
      recordedViewerId = body.p_viewer_id;
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listingId: "11111111-1111-4111-8111-111111111111",
    }, {
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
      "x-forwarded-for": "198.51.100.88",
    }));

    assertEquals(res.status, 200);
    assertEquals(authLookupCalled, false);
    assertEquals(recordedViewerId, null);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
  }
});

Deno.test("database work is bounded by a hard deadline", async () => {
  let timeoutObserved = false;
  await assertRejects(
    () => withViewTrackingDeadline(
      new Promise<never>(() => undefined),
      5,
      () => { timeoutObserved = true; },
    ),
    ViewTrackingDeadlineError,
  );
  assertEquals(timeoutObserved, true);
});

restore();
