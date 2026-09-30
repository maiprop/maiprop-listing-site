/**
 * Tests for get-invoices edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing Authorization returns error response", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("fake Bearer returns auth error (not 500 internal crash)", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.hostname === "test.supabase.co" && request.method === "GET" && url.pathname === "/auth/v1/user") {
      return Promise.resolve(new Response(JSON.stringify({ code: 401, msg: "invalid token" }), { status: 401, headers: { "content-type": "application/json" } }));
    }
    throw new Error(`Unexpected invoice auth transport ${request.method} ${url}`);
  };
  try {
    const res = await handler(authedReq("POST"));
    assertEquals(res.status, 401);
    assertEquals(calls, ["GET /auth/v1/user"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test("invoice response can fall back to durable billing state", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "billing_subscriptions");
  assertStringIncludes(source, "billing_customers");
  assertStringIncludes(source, "normalizeDurableBillingSubscription");
  assertStringIncludes(source, "isValidDurableBillingSubscription");
  assertStringIncludes(source, "trial_end");
  assertStringIncludes(source, 'row.status === "trialing"');
  assertStringIncludes(source, '"billing_state"');
  assertStringIncludes(source, 'log.warn("customer lookup failed"');
  assertStringIncludes(source, "customer_lookup_unavailable");
  assertStringIncludes(source, "return durableBillingResponse(corsHeaders, durableBilling, true)");
});

Deno.test("invoice response includes VAT and Stripe Tax details", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "extractInvoiceTaxAmount");
  assertStringIncludes(source, "normalizeInvoiceTaxIds");
  assertStringIncludes(source, "tax_amount");
  assertStringIncludes(source, "customer_tax_ids");
  assertStringIncludes(source, "automatic_tax");
  assertStringIncludes(source, "customer_tax_exempt");
  assertStringIncludes(source, "taxes");
});

Deno.test("live Stripe trial subscriptions expose trial_end as the displayed period end", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "const trialEnd");
  assertStringIncludes(source, "const subscriptionDisplayEnd");
  assertStringIncludes(source, 'subscription?.status === "trialing"');
  assertStringIncludes(source, "trialEnd ?? currentPeriodEnd");
});

Deno.test("live Stripe subscription display falls back to item period fields", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "type SubscriptionItemWithPeriodEnd");
  assertStringIncludes(source, "subscriptionItem?.current_period_end");
  assertStringIncludes(source, "current_period_end ??");
});

Deno.test("invoice response exposes Stripe receipt and payment evidence when available", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "listCustomerInvoices");
  assertStringIncludes(source, "extractInvoiceReceipt");
  assertStringIncludes(source, "resolveInvoiceReceipt");
  assertStringIncludes(source, "stripe.invoices.retrieve");
  assertStringIncludes(source, "stripe.paymentIntents.retrieve");
  assertStringIncludes(source, "stripe.charges.retrieve");
  assertStringIncludes(source, "payment_intent_id");
  assertStringIncludes(source, "charge_id");
  assertStringIncludes(source, "receipt_url");
});

Deno.test("subscription lookup does not request too-deep Stripe expansions", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.includes("data.items.data.price.product"), false);
  assertEquals(source.includes("data.payments.data.payment.payment_intent"), false);
  assertEquals(source.includes("data.payments.data.payment.charge"), false);
  assertEquals(source.includes("payments.data.payment.payment_intent"), false);
  assertEquals(source.includes("payments.data.payment.charge"), false);
});

restore();

type InvoiceExchange = {
  method: string;
  url: URL;
  body: string;
};

const invoiceJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const invoiceUser = "00000000-0000-4000-8000-000000000071";
const invoiceAccount = "acct_testinvoicehandler";
let invoiceRequestNumber = 0;

const invoiceFixture = async (
  options: {
    email?: string | null;
    durable?: Record<string, unknown> | null;
    customerRows?: Array<Record<string, unknown>>;
    searchCustomers?: Array<Record<string, unknown>>;
    subscriptions?: Record<string, Array<Record<string, unknown>>>;
    invoices?: Array<Record<string, unknown>>;
    stripeError?: string;
    receiptIntent?: Record<string, unknown>;
    receiptCharge?: Record<string, unknown>;
    receiptInvoice?: Record<string, unknown>;
    noKey?: boolean;
    noServiceKey?: boolean;
    mock?: boolean;
  },
  inspect: (response: Response, body: Record<string, unknown>, calls: InvoiceExchange[]) => void | Promise<void>,
) => {
  const previousFetch = globalThis.fetch;
  const envKeys = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "BILLING_MODE"];
  const previousEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  const calls: InvoiceExchange[] = [];
  const unexpected: string[] = [];
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", invoiceAccount);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_invoice_handler");
  Deno.env.set("BILLING_MODE", options.mock ? "mock" : "live");
  if (options.noKey) Deno.env.delete("STRIPE_SECRET_KEY");
  if (options.noServiceKey) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    calls.push({ method, url, body });
    if (url.hostname === "test.supabase.co") {
      if (method === "GET" && url.pathname === "/auth/v1/user") {
        return invoiceJson({ id: invoiceUser, email: options.email === undefined ? "invoice@maiprop.test" : options.email, aud: "authenticated", role: "authenticated" });
      }
      if (method === "GET" && url.pathname === "/rest/v1/billing_subscriptions") return invoiceJson(options.durable ? [options.durable] : []);
      if (method === "GET" && url.pathname === "/rest/v1/billing_customers") return invoiceJson(options.customerRows ?? []);
    }
    if (url.hostname === "api.stripe.com") {
      if (method === "GET" && url.pathname === "/v1/account") return invoiceJson({ id: invoiceAccount });
      if (method === "GET" && url.pathname === "/v1/balance") return invoiceJson({ livemode: false, available: [], pending: [] });
      if (options.stripeError === url.pathname) return invoiceJson({ error: { message: "synthetic failure", type: "api_error" } }, 500);
      if (method === "GET" && url.pathname === "/v1/customers/search") return invoiceJson({ object: "search_result", data: options.searchCustomers ?? [], has_more: false });
      if (method === "GET" && url.pathname.startsWith("/v1/subscriptions")) {
        const customer = url.searchParams.get("customer") ?? "";
        return invoiceJson({ object: "list", data: options.subscriptions?.[customer] ?? [], has_more: false });
      }
      if (method === "GET" && url.pathname === "/v1/invoices") return invoiceJson({ object: "list", data: options.invoices ?? [], has_more: false });
      if (method === "GET" && url.pathname.startsWith("/v1/invoices/")) return invoiceJson(options.receiptInvoice ?? { id: url.pathname.split("/").pop() });
      if (method === "GET" && url.pathname.startsWith("/v1/payment_intents/")) return invoiceJson(options.receiptIntent ?? { id: url.pathname.split("/").pop(), latest_charge: null });
      if (method === "GET" && url.pathname.startsWith("/v1/charges/")) return invoiceJson(options.receiptCharge ?? { id: url.pathname.split("/").pop(), receipt_url: null });
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected invoice transport ${method} ${url}`);
  };
  try {
    const response = await handler(authedReq("POST", {}, { "x-forwarded-for": `198.51.100.${++invoiceRequestNumber}` }));
    const body = await response.json() as Record<string, unknown>;
    await inspect(response, body, calls);
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
};

const invoiceDurable = (overrides: Record<string, unknown> = {}) => ({
  stripe_subscription_id: "sub_durable_invoice",
  status: "active",
  current_period_end: "2099-01-01T00:00:00.000Z",
  billing_cycle: "annual",
  plan_key: "pro",
  stripe_product_id: "prod_durable",
  stripe_price_id: "price_durable",
  ...overrides,
});

Deno.test("invoice handler returns durable state without Stripe and binds reads to the actor", async () => {
  await invoiceFixture({ noKey: true, durable: invoiceDurable(), customerRows: [{ stripe_customer_id: "cus_durable" }] },
    (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(body.billing_reason, "billing_state");
      assertEquals((body.subscription as Record<string, unknown>).source, "billing_state");
      assertEquals((body.subscription as Record<string, unknown>).interval, "year");
      assertEquals(calls.filter((call) => call.url.hostname === "api.stripe.com").length, 0);
      for (const table of ["billing_subscriptions", "billing_customers"]) {
        const read = calls.find((call) => call.url.pathname === `/rest/v1/${table}`);
        assertEquals(read?.url.searchParams.get("user_id"), `eq.${invoiceUser}`);
        assertEquals(read?.url.searchParams.get("limit"), "1");
        assertEquals(read?.url.searchParams.get("order"), "updated_at.desc");
      }
      assertEquals(calls.some((call) => !["GET"].includes(call.method)), false);
    });
});

Deno.test("invoice handler mock and disabled branches make no Stripe calls", async () => {
  for (const options of [{ mock: true }, { noKey: true }]) {
    await invoiceFixture(options, (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(body.billing_reason, options.mock ? "stripe_mock" : "stripe_disabled");
      assertEquals(calls.filter((call) => call.url.hostname === "api.stripe.com").length, 0);
      assertEquals(calls.some((call) => call.method !== "GET"), false);
    });
  }
});

Deno.test("invoice handler rejects an authenticated user without email before billing reads", async () => {
  await invoiceFixture({ email: null }, (response, _body, calls) => {
    assertEquals(response.status, 401);
    assertEquals(calls.map((call) => call.url.pathname), ["/auth/v1/user"]);
  });
});

Deno.test("invoice handler selects only actor-owned customers and returns normalized invoices", async () => {
  const owned = { id: "cus_owned_invoice", metadata: { user_id: invoiceUser } };
  const alien = { id: "cus_alien_invoice", metadata: { user_id: "someone-else" } };
  const subscription = { id: "sub_owned_invoice", status: "trialing", trial_end: 4102444800, cancel_at_period_end: false, metadata: { plan_key: "pro" }, items: { data: [{ id: "si_invoice", current_period_end: 4100000000, price: { id: "price_invoice", unit_amount: 1900, currency: "eur", recurring: { interval: "month" }, product: "prod_invoice" } }] } };
  const inv = { id: "in_owned_invoice", number: "INV-1", status: "paid", amount_paid: 12345, amount_due: 0, subtotal: 10000, total: 12345, amount_tax: 0, currency: "eur", created: 1700000000, period_start: null, period_end: null, hosted_invoice_url: "https://invoice.test/hosted", invoice_pdf: "https://invoice.test/pdf", lines: { data: [{ description: "Pro renewal" }] }, automatic_tax: { enabled: true, status: "complete" }, customer_tax_exempt: "none", customer_tax_ids: [{ id: "txi_1", type: "eu_vat", value: "EL123" }], charge: { id: "ch_invoice", receipt_url: "https://invoice.test/receipt" } };
  await invoiceFixture({ searchCustomers: [alien, owned], subscriptions: { [owned.id]: [subscription] }, invoices: [inv] },
    (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(body.billing_reason, "ok");
      const result = (body.invoices as Array<Record<string, unknown>>)[0];
      assertEquals(result.amount_paid, 123.45);
      assertEquals(result.tax_amount, 0);
      assertEquals(result.currency, "EUR");
      assertEquals(result.description, "Pro renewal");
      assertEquals(result.receipt_url, "https://invoice.test/receipt");
      const displayed = body.subscription as Record<string, unknown>;
      assertEquals(displayed.id, subscription.id);
      assertEquals(displayed.current_period_end, "2100-01-01T00:00:00.000Z");
      assertEquals(displayed.price_id, "price_invoice");
      assertEquals(calls.some((call) => call.url.searchParams.get("customer") === alien.id), false);
      const invoiceRead = calls.find((call) => call.url.pathname === "/v1/invoices");
      assertEquals(invoiceRead?.url.searchParams.get("customer"), owned.id);
      assertEquals(invoiceRead?.url.searchParams.get("limit"), "12");
      assertEquals(calls.some((call) => call.method !== "GET"), false);
    });
});

Deno.test("invoice handler retains selected customer when invoice list fails", async () => {
  const owned = { id: "cus_failure_invoice", metadata: { user_id: invoiceUser } };
  await invoiceFixture({ searchCustomers: [owned], stripeError: "/v1/invoices" }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.billing_reason, "invoice_unavailable");
    assertEquals(body.customer_found, true);
    assertEquals(body.portal_eligible, true);
    assertEquals(body.invoices, []);
    assertEquals(calls.some((call) => call.url.pathname.startsWith("/v1/payment_intents/") || call.url.pathname.startsWith("/v1/charges/")), false);
  });
});

Deno.test("invoice handler enriches receipt by intent then charge without writing", async () => {
  const owned = { id: "cus_receipt_invoice", metadata: { user_id: invoiceUser } };
  const inv = { id: "in_receipt", number: "INV-2", status: "paid", amount_paid: 1900, amount_due: 0, subtotal: 1900, total: 1900, currency: "eur", created: 1700000000, lines: { data: [] }, payment_intent: "pi_receipt", charge: null };
  await invoiceFixture({ searchCustomers: [owned], invoices: [inv], receiptIntent: { id: "pi_receipt", latest_charge: { id: "ch_receipt", receipt_url: null } }, receiptCharge: { id: "ch_receipt", receipt_url: "https://invoice.test/r2" } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    const result = (body.invoices as Array<Record<string, unknown>>)[0];
    assertEquals(result.payment_intent_id, "pi_receipt");
    assertEquals(result.charge_id, "ch_receipt");
    assertEquals(result.receipt_url, "https://invoice.test/r2");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/payment_intents/pi_receipt").length, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/charges/ch_receipt").length, 1);
    assertEquals(calls.some((call) => call.method !== "GET"), false);
  });
});

Deno.test("invoice handler applies durable trial and period validity without inventing older rows", async () => {
  const cases = [
    { row: invoiceDurable({ status: "active", current_period_end: null }), valid: true },
    { row: invoiceDurable({ status: "active", current_period_end: "2020-01-01T00:00:00Z" }), valid: false },
    { row: invoiceDurable({ status: "active", current_period_end: "invalid" }), valid: false },
    { row: invoiceDurable({ status: "trialing", current_period_end: "2020-01-01T00:00:00Z", trial_end: "2099-01-01T00:00:00Z" }), valid: true },
    { row: invoiceDurable({ status: "trialing", current_period_end: null, trial_end: null }), valid: false },
  ];
  for (const { row, valid } of cases) {
    await invoiceFixture({ noKey: true, durable: row }, (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(body.billing_reason, valid ? "billing_state" : "stripe_disabled");
      assertEquals(Boolean(body.subscription), valid);
      assertEquals(calls.filter((call) => call.url.hostname === "api.stripe.com").length, 0);
    });
  }
});

Deno.test("invoice handler service configuration failure stops before auth", async () => {
  await invoiceFixture({ noServiceKey: true }, (response, _body, calls) => {
    assertEquals(response.status, 503);
    assertEquals(calls, []);
  });
});

Deno.test("invoice handler selects provisioned owned customer over earlier canceled customer", async () => {
  const a = { id: "cus_owned_canceled", metadata: { user_id: invoiceUser } };
  const b = { id: "cus_owned_active", metadata: { user_id: invoiceUser } };
  const canceled = { id: "sub_old", status: "canceled", cancel_at_period_end: false, metadata: {}, items: { data: [] } };
  const active = { id: "sub_new", status: "active", cancel_at_period_end: false, current_period_end: 4102444800, metadata: { plan_key: "pro" }, items: { data: [{ id: "si_new", price: { id: "price_new", unit_amount: 1900, currency: "eur", recurring: { interval: "month" }, product: "prod_new" } }] } };
  await invoiceFixture({ searchCustomers: [a, b], subscriptions: { [a.id]: [canceled], [b.id]: [active] } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.subscription as Record<string, unknown>).id, "sub_new");
    const invoiceRead = calls.find((call) => call.url.pathname === "/v1/invoices");
    assertEquals(invoiceRead?.url.searchParams.get("customer"), b.id);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/subscriptions").map((call) => call.url.searchParams.get("customer")), [a.id, b.id]);
    assertEquals(calls.some((call) => call.method !== "GET"), false);
  });
});

Deno.test("invoice handler customer lookup failure falls back to valid durable state", async () => {
  await invoiceFixture({ durable: invoiceDurable(), customerRows: [{ stripe_customer_id: "cus_durable" }], stripeError: "/v1/customers/search" }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.billing_reason, "billing_state");
    assertEquals(body.customer_found, true);
    assertEquals(body.portal_eligible, false);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/invoices"), false);
  });
});

Deno.test("invoice handler normalizes tax arrays, tax IDs and zero-price subscription", async () => {
  const owned = { id: "cus_tax_invoice", metadata: { user_id: invoiceUser } };
  const subscription = { id: "sub_zero", status: "active", cancel_at_period_end: false, metadata: { plan: "pro" }, items: { data: [{ id: "si_zero", current_period_end: 4102444800, price: { id: "price_zero", unit_amount: 0, currency: "eur", recurring: { interval: "year" }, product: { id: "prod_zero", name: "Free migration" } } }] } };
  const inv = { id: "in_tax", number: "INV-TAX", status: "paid", amount_paid: 11900, amount_due: 0, subtotal: 10000, total: 11900, currency: "eur", created: 1700000000, lines: { data: [] }, total_taxes: [{ amount: 1900, taxable_amount: 10000, tax_rate: { id: "txr_eu", display_name: "VAT", percentage: 19, country: "GR" } }], customer_tax_ids: ["txi_string", { id: "txi_object", type: "eu_vat", value: "EL123" }], charge: { id: "ch_tax", receipt_url: "https://invoice.test/tax-receipt" } };
  await invoiceFixture({ searchCustomers: [owned], subscriptions: { [owned.id]: [subscription] }, invoices: [inv] }, (response, body, calls) => {
    assertEquals(response.status, 200);
    const result = (body.invoices as Array<Record<string, unknown>>)[0];
    assertEquals(result.tax_amount, 19);
    assertEquals((result.taxes as Array<Record<string, unknown>>)[0].tax_rate_id, "txr_eu");
    assertEquals((result.customer_tax_ids as Array<Record<string, unknown>>).map((item) => item.id), ["txi_string", "txi_object"]);
    const display = body.subscription as Record<string, unknown>;
    assertEquals(display.amount, null);
    assertEquals(display.product_id, "prod_zero");
    assertEquals(display.plan_key, "pro");
    assertEquals(display.interval, "year");
    assertEquals(calls.some((call) => call.method !== "GET"), false);
  });
});

Deno.test("invoice handler retrieves an invoice only when payment IDs are missing", async () => {
  const owned = { id: "cus_expand_invoice", metadata: { user_id: invoiceUser } };
  const inv = { id: "in_expand", number: "INV-E", status: "paid", amount_paid: 100, amount_due: 0, subtotal: 100, total: 100, currency: "eur", created: 1700000000, lines: { data: [] } };
  await invoiceFixture({ searchCustomers: [owned], invoices: [inv], receiptInvoice: { ...inv, payment_intent: "pi_expanded" }, receiptIntent: { id: "pi_expanded", latest_charge: { id: "ch_expanded", receipt_url: "https://invoice.test/expanded" } } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    const result = (body.invoices as Array<Record<string, unknown>>)[0];
    assertEquals(result.receipt_url, "https://invoice.test/expanded");
    const retrieve = calls.find((call) => call.url.pathname === "/v1/invoices/in_expand");
    const intent = calls.find((call) => call.url.pathname === "/v1/payment_intents/pi_expanded");
    assertEquals(Boolean(retrieve && intent), true);
    assertEquals(calls.indexOf(retrieve!) < calls.indexOf(intent!), true);
    assertEquals(calls.some((call) => call.url.pathname.startsWith("/v1/charges/")), false);
  });
});

Deno.test("invoice handler selects the paid embedded payment receipt without extra Stripe requests", async () => {
  const owned = { id: "cus_paid_receipt", metadata: { user_id: invoiceUser } };
  const invoice = {
    id: "in_paid_receipt", status: "paid", amount_paid: 1900, amount_due: 0, subtotal: 1900, total: 1900, currency: "eur", created: 1700000000, lines: { data: [] },
    payments: { data: [
      { status: "open", payment: { charge: { id: "ch_unpaid", receipt_url: "https://invoice.test/unpaid" } } },
      { status: "paid", payment: { payment_intent: { id: "pi_paid" }, charge: { id: "ch_paid", receipt_url: "https://invoice.test/paid" } } },
    ] },
  };
  await invoiceFixture({ searchCustomers: [owned], invoices: [invoice] }, (response, body, calls) => {
    assertEquals(response.status, 200);
    const normalized = (body.invoices as Array<Record<string, unknown>>)[0];
    assertEquals(normalized.payment_intent_id, "pi_paid");
    assertEquals(normalized.charge_id, "ch_paid");
    assertEquals(normalized.receipt_url, "https://invoice.test/paid");
    assertEquals(calls.some((call) => call.url.pathname.startsWith("/v1/invoices/") || call.url.pathname.startsWith("/v1/payment_intents/") || call.url.pathname.startsWith("/v1/charges/")), false);
  });
});
