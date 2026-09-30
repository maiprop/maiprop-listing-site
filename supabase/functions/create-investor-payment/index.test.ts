import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("create-investor-payment creates an admin-only custom annual investor Checkout session", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("verifyBearerToken"), true);
  assertEquals(source.includes("Platform admin only"), true);
  assertEquals(source.includes("parseAmountCents"), true);
  assertEquals(source.includes("amount is required"), true);
  assertEquals(source.includes("amount_cents is invalid"), true);
  assertEquals(source.includes('INVESTOR_PAYMENT_CURRENCY = "eur"'), true);
  assertEquals(source.includes("INVESTOR_ACCESS_PERIOD_DAYS = 365"), true);
  assertEquals(source.includes('INVESTOR_BILLING_CYCLE = "annual"'), true);
  assertEquals(source.includes("createVerifiedStripeClient"), true);
  assertEquals(source.includes("stripe.checkout.sessions.create"), true);
  assertEquals(source.includes('mode: "payment"'), true);
  assertEquals(source.includes('.select("id, user_id, status, email")'), true);
  assertEquals(source.includes('.select("email")'), false);
  assertEquals(
    source.includes("Approved invitation request has no email"),
    true,
  );
  assertEquals(source.includes('checkout_type: "investor_payment"'), true);
  assertEquals(source.includes("request_id"), true);
  assertEquals(source.includes("plan_key"), true);
  assertEquals(source.includes("investor_private"), true);
  assertEquals(source.includes("investor_institutional"), true);
  assertEquals(source.includes("stripe_session_id"), true);
  assertEquals(source.includes("session_id: session.id"), true);
  assertEquals(source.includes("mode: getStripeRuntimeMode()"), true);
  assertEquals(
    source.includes("No pending investor payment subscription found"),
    true,
  );
  assertEquals(
    source.includes("stripe.checkout.sessions.expire(session.id)"),
    true,
  );
  assertEquals(
    source.includes('.select("id, status, stripe_session_id")'),
    true,
  );
  assertEquals(source.includes("payment_method_types:"), false);
  assertEquals(source.includes("payment_method_configuration:"), false);
  assertEquals(
    source.includes(
      "integration_identifier: STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER",
    ),
    true,
  );
  assertEquals(source.includes("CHECKOUT_TAX_COLLECTION_PARAMS"), true);
  assertEquals(
    source.includes("buildPaymentModeInvoiceCreationParams(metadata)"),
    true,
  );
  assertEquals(source.includes("billing_cycle: INVESTOR_BILLING_CYCLE"), true);
  assertEquals(
    source.includes("access_period_days: String(INVESTOR_ACCESS_PERIOD_DAYS)"),
    true,
  );
  assertEquals(source.includes("amount_cents: amountCents"), true);
  assertEquals(source.includes("amount_major: amountCents / 100"), true);
  assertEquals(source.includes("currency: INVESTOR_PAYMENT_CURRENCY"), true);
  assertEquals(source.includes("Annual Investor Access"), true);
  assertEquals(source.includes("STRIPE_SAAS_BUSINESS_TAX_CODE"), true);
  assertEquals(source.includes("STRIPE_DEFAULT_TAX_BEHAVIOR"), true);
  assertEquals(
    source.includes("tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR"),
    true,
  );
  assertEquals(
    source.includes("tax_code: STRIPE_SAAS_BUSINESS_TAX_CODE"),
    true,
  );
  assertEquals(source.includes('"stripe-tax-v2-company-vat"'), true);
  assertEquals(
    source.includes(
      "An investor payment link already exists for this pending subscription",
    ),
    true,
  );
  assertEquals(source.includes('.is("stripe_session_id", null)'), true);
  assertEquals(source.includes('"investor-payment-custom-annual-v1"'), true);
  assertEquals(source.includes("FIXED_INVESTOR_PAYMENT_AMOUNT"), false);
  assertEquals(source.includes("Investor payment currency must be EUR"), true);
});

type InvestorCall = {
  method: string;
  url: URL;
  body: string;
  form: URLSearchParams;
  key: string | null;
};
const investorActor = "00000000-0000-4000-8000-000000000181";
const investorRecipient = "00000000-0000-4000-8000-000000000182";
const investorRequest = "00000000-0000-4000-8000-000000000183";
const investorAccount = "acct_testinvestore2";
const investorInput = {
  request_id: investorRequest,
  user_id: investorRecipient,
  plan_key: "investor_private",
  amount: 1234.56,
};
let investorFixtureNumber = 0;
const investorJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

async function investorFixture(
  options: {
    profile?: { role: string; is_platform_admin: boolean } | null;
    invitation?: { id: string; user_id: string; status: string; email: string | null } | null;
    pending?: { id: string; user_id: string; tier: string; status: string; stripe_session_id: string | null } | null;
    updateError?: boolean;
    updateErrorOnce?: boolean;
    zeroUpdate?: boolean;
    expireError?: boolean;
    customerSearchEmpty?: boolean;
    providerError?: string;
    input?: Record<string, unknown>;
    rawBody?: string;
    noAuth?: boolean;
  },
  inspect: (
    response: Response,
    body: Record<string, unknown>,
    calls: InvestorCall[],
    state: { pending: NonNullable<typeof options.pending>; repeat: (input?: Record<string, unknown>) => Promise<{ response: Response; body: Record<string, unknown> }> },
  ) => void | Promise<void>,
) {
  const previousFetch = globalThis.fetch;
  const envKeys = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "BILLING_MODE"];
  const previousEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", investorAccount);
  Deno.env.set("STRIPE_SECRET_KEY", `sk_test_investor_e2_${++investorFixtureNumber}`);
  Deno.env.set("BILLING_MODE", "live");
  const calls: InvestorCall[] = [];
  const unexpected: string[] = [];
  const invitation = options.invitation === undefined
    ? { id: investorRequest, user_id: investorRecipient, status: "approved", email: "recipient@maiprop.test" }
    : options.invitation;
  const pending = options.pending === undefined
    ? { id: "00000000-0000-4000-8000-000000000184", user_id: investorRecipient, tier: "private", status: "pending_payment", stripe_session_id: null as string | null }
    : options.pending;
  const stripeSessions = new Map<string, string>();
  let updateAttempts = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    calls.push({ method, url, body, form: new URLSearchParams(body), key: request.headers.get("Idempotency-Key") });
    if (url.hostname === "test.supabase.co") {
      if (method === "GET" && url.pathname === "/auth/v1/user") {
        return investorJson({ id: investorActor, email: "admin@maiprop.test", aud: "authenticated", role: "authenticated" });
      }
      if (method === "GET" && url.pathname === "/rest/v1/profiles") {
        return investorJson(options.profile === null ? [] : [options.profile ?? { role: "admin", is_platform_admin: false }]);
      }
      if (method === "GET" && url.pathname === "/rest/v1/invitation_requests") {
        return investorJson(invitation && url.searchParams.get("id") === `eq.${invitation.id}` && url.searchParams.get("user_id") === `eq.${invitation.user_id}` ? [invitation] : []);
      }
      if (method === "GET" && url.pathname === "/rest/v1/investor_subscriptions") {
        return investorJson(pending && url.searchParams.get("user_id") === `eq.${pending.user_id}` &&
            url.searchParams.get("tier") === `eq.${pending.tier}` &&
            url.searchParams.get("status") === `eq.${pending.status}` ? [pending] : []);
      }
      if (method === "PATCH" && url.pathname === "/rest/v1/investor_subscriptions") {
        updateAttempts += 1;
        if (options.updateError || (options.updateErrorOnce && updateAttempts === 1)) {
          return investorJson({ message: "synthetic durable write failure" }, 500);
        }
        if (options.zeroUpdate || !pending || url.searchParams.get("id") !== `eq.${pending.id}` ||
          url.searchParams.get("status") !== "eq.pending_payment" || url.searchParams.get("stripe_session_id") !== "is.null" ||
          pending.stripe_session_id !== null) return investorJson({ code: "PGRST116", details: "The result contains 0 rows", message: "Cannot coerce the result to a single JSON object" }, 406);
        Object.assign(pending, JSON.parse(body));
        return investorJson([{ id: pending.id }]);
      }
    }
    if (url.hostname === "api.stripe.com") {
      if (method === "GET" && url.pathname === "/v1/account") return investorJson({ id: investorAccount });
      if (method === "GET" && url.pathname === "/v1/balance") return investorJson({ livemode: false, available: [], pending: [] });
      if (options.providerError === url.pathname) return investorJson({ error: { message: "synthetic provider failure", type: "api_error" } }, 500);
      if (method === "GET" && url.pathname === "/v1/customers/search") {
        return investorJson({ object: "search_result", data: options.customerSearchEmpty ? [] : [{
          id: "cus_investor_e2",
          metadata: { user_id: investorRecipient },
          invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] },
        }], has_more: false });
      }
      if (method === "POST" && url.pathname === "/v1/customers") {
        return investorJson({ id: "cus_investor_e2", object: "customer", livemode: false });
      }
      if (method === "POST" && url.pathname === "/v1/checkout/sessions") {
        const key = request.headers.get("Idempotency-Key") ?? "";
        if (!stripeSessions.has(key)) stripeSessions.set(key, `cs_investor_e2_${stripeSessions.size + 1}`);
        return investorJson({ id: stripeSessions.get(key), object: "checkout.session", url: "https://checkout.stripe.test/investor", mode: "payment", livemode: false });
      }
      if (method === "POST" && url.pathname === "/v1/checkout/sessions/cs_investor_e2_1/expire") {
        return options.expireError
          ? investorJson({ error: { message: "synthetic expiration failure", type: "api_error" } }, 500)
          : investorJson({ id: "cs_investor_e2_1", object: "checkout.session", status: "expired" });
      }
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected investor transport ${method} ${url}`);
  };
  try {
    const ip = `198.51.100.${investorFixtureNumber}`;
    const repeat = async (input = options.input ?? investorInput) => {
      const request = options.rawBody !== undefined
        ? new Request("https://functions.supabase.co/fn", {
          method: "POST",
          headers: { authorization: "Bearer fake-token", "content-type": "application/json", origin: "https://maiprop.co", "x-forwarded-for": ip },
          body: options.rawBody,
        })
        : options.noAuth
        ? authedReq("POST", input, { authorization: "", "x-forwarded-for": ip })
        : authedReq("POST", input, { "x-forwarded-for": ip });
      const response = await handler(request);
      return { response, body: await response.json() as Record<string, unknown> };
    };
    const { response, body } = await repeat();
    await inspect(response, body, calls, { pending: pending!, repeat });
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("investor payment binds admin authority and rejects invalid input before billing reads", async () => {
  await investorFixture({ noAuth: true }, (response, _body, calls) => {
    assertEquals(response.status, 401);
    assertEquals(calls.length, 0);
  });
  await investorFixture({ profile: { role: "buyer", is_platform_admin: false } }, (response, _body, calls) => {
    assertEquals(response.status, 403);
    assertEquals(calls.map((call) => call.url.pathname), ["/auth/v1/user", "/rest/v1/profiles"]);
    assertEquals(calls[1].url.searchParams.get("user_id"), `eq.${investorActor}`);
  });
  await investorFixture({ rawBody: "{" }, (response, _body, calls) => {
    assertEquals(response.status, 400);
    assertEquals(calls.map((call) => call.url.pathname), ["/auth/v1/user", "/rest/v1/profiles"]);
  });
  for (const input of [
    { ...investorInput, extra: true },
    { ...investorInput, request_id: "bad" },
    { ...investorInput, user_id: "bad" },
    { ...investorInput, plan_key: "pro" },
    { ...investorInput, amount: 0 },
    { ...investorInput, currency: "usd" },
  ]) {
    await investorFixture({ input }, (response, _body, calls) => {
      assertEquals(response.status, 400);
      assertEquals(calls.some((call) => call.url.pathname.includes("invitation_requests") || call.url.hostname === "api.stripe.com"), false);
    });
  }
});

Deno.test("investor payment binds recipient invitation and pending tier before Stripe", async () => {
  for (const options of [
    { invitation: { id: investorRequest, user_id: investorActor, status: "approved", email: "recipient@maiprop.test" } },
    { invitation: { id: investorRequest, user_id: investorRecipient, status: "pending", email: "recipient@maiprop.test" } },
    { invitation: { id: investorRequest, user_id: investorRecipient, status: "approved", email: null } },
    { pending: null },
    { pending: { id: "pending_other", user_id: investorActor, tier: "private", status: "pending_payment", stripe_session_id: null } },
    { pending: { id: "pending_linked", user_id: investorRecipient, tier: "private", status: "pending_payment", stripe_session_id: "cs_existing" } },
  ]) {
    await investorFixture(options, (response, _body, calls) => {
      assertEquals(response.status, 409);
      assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
      const invitationRead = calls.find((call) => call.url.pathname === "/rest/v1/invitation_requests");
      assertEquals(invitationRead?.url.searchParams.get("id"), `eq.${investorRequest}`);
      assertEquals(invitationRead?.url.searchParams.get("user_id"), `eq.${investorRecipient}`);
      const pendingRead = calls.find((call) => call.url.pathname === "/rest/v1/investor_subscriptions");
      if (pendingRead) {
        assertEquals(pendingRead.url.searchParams.get("user_id"), `eq.${investorRecipient}`);
        assertEquals(pendingRead.url.searchParams.get("tier"), "eq.private");
        assertEquals(pendingRead.url.searchParams.get("status"), "eq.pending_payment");
      }
    });
  }
});

Deno.test("investor payment creates an annual EUR session and stores its exact pending link", async () => {
  for (const [plan, tier, label] of [
    ["investor_private", "private", "Private"],
    ["investor_institutional", "institutional", "Institutional"],
  ]) {
    await investorFixture({
      input: { ...investorInput, plan_key: plan, success_url: "/investor-dashboard?paid=1", cancel_url: "https://evil.test/" },
      pending: { id: "pending_e2", user_id: investorRecipient, tier, status: "pending_payment", stripe_session_id: null },
      customerSearchEmpty: true,
      profile: plan === "investor_institutional" ? { role: "buyer", is_platform_admin: true } : { role: "admin", is_platform_admin: false },
    }, (response, body, calls, state) => {
      assertEquals(response.status, 200, JSON.stringify(body));
      assertEquals(body.session_id, "cs_investor_e2_1");
      assertEquals(body.url, "https://checkout.stripe.test/investor");
      assertEquals(body.mode, "test");
      assertEquals(body.customer_id, "cus_investor_e2");
      const search = calls.find((call) => call.url.pathname === "/v1/customers/search");
      assertEquals(search?.url.searchParams.get("query"), `metadata['user_id']:'${investorRecipient}'`);
      const customer = calls.find((call) => call.url.pathname === "/v1/customers");
      assertEquals(customer?.form.get("email"), "recipient@maiprop.test");
      assertEquals(customer?.form.get("metadata[user_id]"), investorRecipient);
      assertEquals(customer?.key, `maiprop-customer-${investorRecipient}`);
      const session = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
      const update = calls.find((call) => call.url.pathname === "/rest/v1/investor_subscriptions" && call.method === "PATCH");
      assert(session && update);
      assert(calls.indexOf(session) < calls.indexOf(update));
      assertEquals(session.form.get("mode"), "payment");
      assertEquals(session.form.get("line_items[0][price_data][unit_amount]"), "123456");
      assertEquals(session.form.get("line_items[0][price_data][currency]"), "eur");
      assertEquals(session.form.get("line_items[0][price_data][product_data][name]")?.includes(label), true);
      assertEquals(session.form.get("metadata[user_id]"), investorRecipient);
      assertEquals(session.form.get("metadata[request_id]"), investorRequest);
      assertEquals(session.form.get("metadata[tier]"), tier);
      assertEquals(session.form.get("metadata[billing_cycle]"), "annual");
      assertEquals(session.form.get("metadata[access_period_days]"), "365");
      assertEquals(session.form.get("automatic_tax[enabled]"), "true");
      assertEquals(session.form.get("invoice_creation[enabled]"), "true");
      assertEquals(session.form.get("success_url"), "https://maiprop.co/investor-dashboard?paid=1");
      assertEquals(session.form.get("cancel_url"), "https://maiprop.co/admin?tab=investors&checkout=cancelled");
      assert(session.key && session.key.length > 10);
      assertEquals(update.url.searchParams.get("id"), "eq.pending_e2");
      assertEquals(update.url.searchParams.get("status"), "eq.pending_payment");
      assertEquals(update.url.searchParams.get("stripe_session_id"), "is.null");
      const saved = JSON.parse(update.body);
      assertEquals(saved.stripe_customer_id, "cus_investor_e2");
      assertEquals(saved.stripe_session_id, "cs_investor_e2_1");
      assertEquals(saved.runtime_mode, "test");
      assertEquals(saved.livemode, false);
      assertEquals(state.pending.stripe_session_id, "cs_investor_e2_1");
    });
  }
});

Deno.test("investor payment reports failed durable writes and attempts race cleanup", async () => {
  await investorFixture({ updateError: true }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), true);
    assertEquals(calls.some((call) => call.url.pathname.endsWith("/expire")), false);
  });
  for (const expireError of [false, true]) {
    await investorFixture({ zeroUpdate: true, expireError }, (response, _body, calls) => {
      assertEquals(response.status, 409);
      const paths = calls.map((call) => call.url.pathname);
      assert(paths.indexOf("/v1/checkout/sessions") < paths.indexOf("/rest/v1/investor_subscriptions", paths.indexOf("/v1/checkout/sessions")));
      assertEquals(paths.at(-1), "/v1/checkout/sessions/cs_investor_e2_1/expire");
    });
  }
});

Deno.test("investor payment retries an ambiguous local write with the same Stripe key", async () => {
  await investorFixture({ updateErrorOnce: true }, async (response, _body, calls, state) => {
    assertEquals(response.status, 500);
    const first = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
    assert(first?.key);
    const second = await state.repeat();
    assertEquals(second.response.status, 200);
    const sessions = calls.filter((call) => call.url.pathname === "/v1/checkout/sessions");
    assertEquals(sessions.length, 2);
    assertEquals(sessions[0].key, sessions[1].key);
    assertEquals(state.pending.stripe_session_id, "cs_investor_e2_1");
    const third = await state.repeat();
    assertEquals(third.response.status, 409);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/checkout/sessions").length, 2);
  });
  await investorFixture({
    pending: { id: "pending_linked", user_id: investorRecipient, tier: "private", status: "pending_payment", stripe_session_id: "cs_existing" },
  }, (response, _body, calls) => {
    assertEquals(response.status, 409);
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
  });
});

restore();
