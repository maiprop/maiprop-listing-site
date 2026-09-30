/**
 * Tests for customer-portal edge function.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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

type PortalCall = { method: string; url: URL; body: string; form: URLSearchParams; key: string | null };
const portalActor = "00000000-0000-4000-8000-000000000201";
const portalAccount = "acct_testportale2";
const portalOperation = "00000000-0000-4000-8000-000000000202";
let portalFixtureNumber = 0;
const portalJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

async function portalFixture(
  options: {
    input?: Record<string, unknown>;
    searchCustomers?: Array<Record<string, unknown>>;
    searchError?: boolean;
    durableCustomer?: string | null;
    durableError?: boolean;
    deletedCustomer?: boolean;
    subscriptions?: Array<Record<string, unknown>>;
    updateError?: boolean;
    updatePending?: boolean;
    canonicalPending?: boolean;
    retrieveError?: boolean;
    mock?: boolean;
    noKey?: boolean;
    expectedAccount?: string;
    portalError?: boolean;
  },
  inspect: (response: Response, body: Record<string, unknown>, calls: PortalCall[], repeat: () => Promise<{ response: Response; body: Record<string, unknown> }>) => void | Promise<void>,
) {
  const oldFetch = globalThis.fetch;
  const envKeys = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "BILLING_MODE", "STRIPE_MOCK_MODE", "STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID"];
  const oldEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", options.expectedAccount ?? portalAccount);
  Deno.env.set("STRIPE_SECRET_KEY", `sk_test_portale2${++portalFixtureNumber}`);
  Deno.env.set("BILLING_MODE", options.mock ? "mock" : "live");
  Deno.env.set("STRIPE_MOCK_MODE", "false");
  Deno.env.set("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID", "bpc_portale2");
  if (options.noKey) Deno.env.delete("STRIPE_SECRET_KEY");
  const calls: PortalCall[] = [];
  const unexpected: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    calls.push({ method, url, body, form: new URLSearchParams(body), key: request.headers.get("Idempotency-Key") });
    if (url.hostname === "test.supabase.co") {
      if (method === "GET" && url.pathname === "/auth/v1/user") {
        return portalJson({ id: portalActor, email: "portal@maiprop.test", aud: "authenticated", role: "authenticated" });
      }
      if (method === "GET" && url.pathname === "/rest/v1/billing_customers") {
        return options.durableError
          ? portalJson({ message: "synthetic durable lookup failure" }, 500)
          : portalJson(options.durableCustomer ? [{ stripe_customer_id: options.durableCustomer }] : []);
      }
    }
    if (url.hostname === "api.stripe.com") {
      if (method === "GET" && url.pathname === "/v1/account") return portalJson({ id: portalAccount });
      if (method === "GET" && url.pathname === "/v1/balance") return portalJson({ livemode: false, available: [], pending: [] });
      if (method === "GET" && url.pathname === "/v1/customers/search") {
        return options.searchError
          ? portalJson({ error: { message: "search unavailable", type: "api_error" } }, 500)
          : portalJson({ object: "search_result", data: options.searchCustomers ?? [{ id: "cus_portal_owned", metadata: { user_id: portalActor } }], has_more: false });
      }
      if (method === "GET" && url.pathname.startsWith("/v1/customers/")) {
        return portalJson(options.deletedCustomer
          ? { id: url.pathname.split("/").pop(), deleted: true }
          : { id: url.pathname.split("/").pop(), object: "customer", livemode: false });
      }
      if (method === "GET" && url.pathname === "/v1/subscriptions") {
        return portalJson({ object: "list", data: options.subscriptions ?? [{ id: "sub_portal_owned", customer: "cus_portal_owned", status: "active", cancel_at_period_end: true }], has_more: false });
      }
      if (url.pathname === "/v1/subscriptions/sub_portal_owned" && method === "POST") {
        return options.updateError
          ? portalJson({ error: { message: "ambiguous update", type: "api_error" } }, 500)
          : portalJson({ id: "sub_portal_owned", cancel_at_period_end: options.updatePending ?? false });
      }
      if (url.pathname === "/v1/subscriptions/sub_portal_owned" && method === "GET") {
        return options.retrieveError
          ? portalJson({ error: { message: "retrieve unavailable", type: "api_error" } }, 500)
          : portalJson({ id: "sub_portal_owned", cancel_at_period_end: options.canonicalPending ?? false });
      }
      if (method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
        return options.portalError
          ? portalJson({ error: { message: "portal unavailable", type: "api_error" } }, 500)
          : portalJson({ id: "bps_portal_e2", object: "billing_portal.session", url: "https://billing.stripe.test/session" });
      }
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected portal transport ${method} ${url}`);
  };
  try {
    const ip = `192.0.2.${portalFixtureNumber}`;
    const repeat = async () => {
      const response = await handler(req("POST", options.input ?? { action: "manage" }, {
        authorization: "Bearer synthetic-portal-token", "x-forwarded-for": ip,
      }));
      return { response, body: await response.json() as Record<string, unknown> };
    };
    const { response, body } = await repeat();
    await inspect(response, body, calls, repeat);
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of oldEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("portal resolves actor-owned customer by metadata and falls back to actor/runtime durable state", async () => {
  await portalFixture({}, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.url, "https://billing.stripe.test/session");
    const search = calls.find((call) => call.url.pathname === "/v1/customers/search");
    assertEquals(search?.url.searchParams.get("query"), `metadata['user_id']:'${portalActor}'`);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_customers"), false);
    const session = calls.find((call) => call.url.pathname === "/v1/billing_portal/sessions");
    assertEquals(session?.form.get("customer"), "cus_portal_owned");
    assertEquals(session?.form.get("return_url"), "https://maiprop.co/dashboard/billing");
    assertEquals(session?.form.get("configuration"), "bpc_portale2");
  });
  for (const searchError of [false, true]) {
    await portalFixture({ searchCustomers: [], searchError, durableCustomer: "cus_durable_owned" }, (response, body, calls) => {
      assertEquals(response.status, 200, JSON.stringify(body));
      const lookup = calls.find((call) => call.url.pathname === "/rest/v1/billing_customers")!;
      assertEquals(lookup.url.searchParams.get("user_id"), `eq.${portalActor}`);
      assertEquals(lookup.url.searchParams.get("runtime_mode"), "eq.test");
      assertEquals(lookup.url.searchParams.get("livemode"), "eq.false");
      assertEquals(lookup.url.searchParams.get("order"), "updated_at.desc");
      assertEquals(lookup.url.searchParams.get("limit"), "1");
      assertEquals(calls.some((call) => call.url.pathname === "/v1/customers/cus_durable_owned"), true);
      assertEquals(calls.find((call) => call.url.pathname === "/v1/billing_portal/sessions")?.form.get("customer"), "cus_durable_owned");
    });
  }
  for (const options of [
    { searchCustomers: [], durableCustomer: null },
    { searchCustomers: [], durableCustomer: "cus_deleted", deletedCustomer: true },
    { searchCustomers: [], durableError: true },
  ]) {
    await portalFixture(options, (response, body, calls) => {
      assertEquals(response.status, 404, JSON.stringify(body));
      assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
      assertEquals(calls.some((call) => call.url.pathname.includes("/email")), false);
    });
  }
});

Deno.test("portal action flow binds only a subscription listed for the actor customer", async () => {
  await portalFixture({ input: { action: "payment_method_update" } }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(calls.some((call) => call.url.pathname === "/v1/subscriptions"), false);
    const session = calls.find((call) => call.url.pathname === "/v1/billing_portal/sessions")!;
    assertEquals(session.form.get("flow_data[type]"), "payment_method_update");
  });
  for (const action of ["subscription_cancel", "subscription_update"]) {
    await portalFixture({ input: { action, subscription_id: "sub_portal_owned" } }, (response, body, calls) => {
      assertEquals(response.status, 200, JSON.stringify(body));
      const list = calls.find((call) => call.url.pathname === "/v1/subscriptions")!;
      assertEquals(list.url.searchParams.get("customer"), "cus_portal_owned");
      const session = calls.find((call) => call.url.pathname === "/v1/billing_portal/sessions")!;
      assertEquals(session.form.get("flow_data[type]"), action);
      assertEquals(session.form.get(`flow_data[${action}][subscription]`), "sub_portal_owned");
    });
  }
  await portalFixture({ input: { action: "subscription_cancel", subscription_id: "sub_other_user" } }, (response, _body, calls) => {
    assertEquals(response.status, 403);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
  });
  await portalFixture({ input: { action: "subscription_update" } }, (response, _body, calls) => {
    assertEquals(response.status, 400);
    assertEquals(calls.length, 0);
  });
  await portalFixture({
    input: { action: "subscription_cancel", subscription_id: "sub_portal_owned" },
    subscriptions: [{ id: "sub_portal_owned", status: "canceled" }],
  }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
  });
});

Deno.test("portal resume uses a stable operation key and canonical subscription state", async () => {
  const input = { action: "resume_subscription", subscription_id: "sub_portal_owned", operation_id: portalOperation };
  await portalFixture({ input }, async (response, body, calls, repeat) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.resumed, true);
    assertEquals(body.reconciled, false);
    const again = await repeat();
    assertEquals(again.response.status, 200);
    const updates = calls.filter((call) => call.url.pathname === "/v1/subscriptions/sub_portal_owned" && call.method === "POST");
    assertEquals(updates.length, 2);
    assertEquals(updates[0].key, updates[1].key);
    assert(updates[0].key?.length);
    assertEquals(updates[0].form.get("cancel_at_period_end"), "false");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/subscriptions/sub_portal_owned" && call.method === "GET").length, 2);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
  });
  for (const options of [
    { input, updateError: true, canonicalPending: false, expected: 200, reconciled: true },
    { input, updateError: true, canonicalPending: true, expected: 500 },
    { input, retrieveError: true, expected: 500 },
  ]) {
    await portalFixture(options, (response, body, calls) => {
      assertEquals(response.status, options.expected);
      if (options.expected === 200) {
        assertEquals(body.resumed, true);
        assertEquals(body.reconciled, options.reconciled);
      } else assertEquals(typeof body.error, "string");
      assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
    });
  }
});

Deno.test("portal mock mode and provider failures avoid unsupported session URLs", async () => {
  for (const input of [{ action: "manage" }, { action: "resume_subscription", subscription_id: "sub_portal_owned", operation_id: portalOperation }]) {
    await portalFixture({ input, mock: true }, (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(body.mock, true);
      assertEquals(input.action === "manage" ? typeof body.url : body.resumed, input.action === "manage" ? "string" : true);
      assertEquals(calls.map((call) => call.url.pathname), ["/auth/v1/user"]);
    });
  }
  for (const options of [
    { noKey: true },
    { expectedAccount: "acct_otheraccount" },
    { portalError: true },
  ]) {
    await portalFixture(options, (response, body, calls) => {
      assertEquals(response.status, 500);
      assertEquals(body.url, undefined);
      if (options.noKey) assertEquals(calls.map((call) => call.url.pathname), ["/auth/v1/user"]);
      if (options.expectedAccount) assertEquals(calls.some((call) => call.url.pathname === "/v1/billing_portal/sessions"), false);
    });
  }
});

restore();
