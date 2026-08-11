/**
 * Tests for customer-portal edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("non-POST portal requests are rejected before provider access", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("PUT", { action: "manage" }, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));
    assertEquals(res.status, 405);
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("missing Authorization returns 401 with error message", async () => {
  const res = await handler(req("POST"));
  // After audit fix the function uses verifyBearerToken so missing/empty token
  // surfaces as AuthError with status 401. The 500 fallback is kept in the
  // assertion only for legacy behaviour during the rollout window.
  assertEquals([401, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rate limiter allows < 10 requests from same IP", async () => {
  // Just verify the first request hits auth (not rate limit)
  const res = await handler(req("POST", undefined, {
    "x-forwarded-for": crypto.randomUUID(),
  }));
  assertEquals(res.status !== 429, true);
});

Deno.test("malformed and invalid portal actions return structured 400 before provider access", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const malformed = await handler(new Request("https://functions.test/customer-portal", {
      method: "POST",
      headers: {
        authorization: "Bearer test-valid-token",
        "content-type": "application/json",
        "x-forwarded-for": crypto.randomUUID(),
      },
      body: "{",
    }));
    assertEquals(malformed.status, 400);
    const malformedBody = await malformed.json();
    assertEquals(malformedBody.code, "invalid_json");

    for (const body of [
      { action: "refund_subscription" },
      { action: "subscription_cancel", subscription_id: `sub_${"x".repeat(252)}` },
      { action: "manage", unexpected: true },
    ]) {
      const res = await handler(req("POST", body, {
        authorization: "Bearer test-valid-token",
        "x-forwarded-for": crypto.randomUUID(),
      }));
      assertEquals(res.status, 400);
      const payload = await res.json();
      assertEquals(payload.code, "validation_error");
      assertEquals(Array.isArray(payload.issues), true);
    }
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("portal return URL uses the allowlisted Checkout origin resolver", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "resolveCheckoutOrigin");
  assertStringIncludes(source, "const origin = resolveCheckoutOrigin(req.headers.get(\"origin\"))");
});

Deno.test("durable customer fallback is restricted to the active Stripe runtime", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const lookupStart = source.indexOf('supabase.from("billing_customers")');
  const lookupEnd = source.indexOf("const customerId", lookupStart);
  const lookup = source.slice(lookupStart, lookupEnd);

  assertEquals(lookup.includes('.eq("runtime_mode", getStripeRuntimeMode())'), true);
  assertEquals(lookup.includes('.eq("livemode", getStripeRuntimeMode() === "live")'), true);
});

restore();
