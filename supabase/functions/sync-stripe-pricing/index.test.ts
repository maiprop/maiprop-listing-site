/**
 * Tests for sync-stripe-pricing edge function (admin only).
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
});

Deno.test("missing Authorization returns error", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns auth/permission error", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.hostname === "test.supabase.co" && request.method === "GET" && url.pathname === "/auth/v1/user") {
      return Promise.resolve(pricingJson({ code: 401, msg: "invalid token" }, 401));
    }
    throw new Error(`Unexpected pricing auth transport ${request.method} ${url}`);
  };
  try {
    const res = await handler(authedReq("POST"));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(calls, ["GET /auth/v1/user"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test("pricing sync stores monthly and annual Stripe price IDs distinctly", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "stripe_price_id_monthly");
  assertStringIncludes(source, "stripe_price_id_annual");
  assertStringIncludes(source, "ensureAnnualCompanionPrice");
  assertStringIncludes(source, "stripe_last_amount_annual");
});

Deno.test("pricing sync uses catalog lookup keys and transfers them on replacement", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "stripeLookupKeyForConfig");
  assertStringIncludes(source, "findActivePriceByLookupKey");
  assertStringIncludes(source, "lookup_key: lookupKey");
  assertStringIncludes(source, "stripe_catalog_lookup_key: lookupKey");
  assertStringIncludes(
    source,
    "transfer_lookup_key: Boolean(activeLookupPrice)",
  );
  assertStringIncludes(source, "await archiveActiveLookupPrice");
});

Deno.test("pricing sync writes Stripe Tax settings to Products and Prices", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "resolveStripeSoftwareTaxCode");
  assertStringIncludes(source, "STRIPE_DEFAULT_TAX_BEHAVIOR");
  assertStringIncludes(source, "tax_code: stripeTaxCode");
  assertStringIncludes(source, "tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR");
  assertStringIncludes(
    source,
    "stripe_tax_code: taxCode",
  );
  assertStringIncludes(
    source,
    "stripe_tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(source, "stripe_tax_behavior_monthly");
  assertStringIncludes(source, "stripe_tax_behavior_annual");
});

Deno.test("pricing sync replaces immutable prices when tax behavior is stale", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(
    source,
    "price.tax_behavior === STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(source, "existingPriceTaxBehavior");
  assertStringIncludes(
    source,
    "existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(source, "existingAnnualTaxBehavior");
  assertStringIncludes(
    source,
    "existingAnnualTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
});

Deno.test("pricing sync compares price changes in major units, not Stripe cents", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "const amountMajor = Number(config.amount)");
  assertStringIncludes(source, "amountMajor !== existingAmount");
  assertEquals(source.includes("amount !== existingAmount"), false);
});

Deno.test("pricing sync fails loudly when Stripe metadata cannot be saved", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "role,is_platform_admin");
  assertStringIncludes(source, "Failed to save Stripe pricing metadata");
  assertStringIncludes(source, "if (updateError)");
});

restore();

type PricingCall = { method: string; url: URL; body: string; form: URLSearchParams };
const pricingJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const pricingUser = "00000000-0000-4000-8000-000000000072";
const pricingAccount = "acct_testpricinghandler";
let pricingIp = 0;

const pricingConfig = (overrides: Record<string, unknown> = {}) => ({
  id: "cfg_pro", key: "pro", audience: "participant", module: "user_subscription", unit: "monthly", amount: 19, currency: "EUR", label: "Pro", description: "Pro membership", metadata: {}, ...overrides,
});

const pricingFixture = async (
  options: {
    admin?: boolean;
    platformAdmin?: boolean;
    body?: unknown;
    configs?: Array<Record<string, unknown>>;
    lookupPrices?: Record<string, Record<string, unknown>>;
    failPath?: string;
    failProductOnce?: boolean;
    failDbPatch?: boolean;
    failPro?: boolean;
    stripeAccount?: string;
  },
  inspect: (response: Response, result: Record<string, unknown>, calls: PricingCall[], repeat: () => Promise<{ response: Response; result: Record<string, unknown> }>) => void | Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  const names = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY"];
  const originals = new Map(names.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", pricingAccount);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_pricing_handler");
  const calls: PricingCall[] = [];
  const unexpected: string[] = [];
  let productNumber = 0;
  let priceNumber = 0;
  let productFailures = 0;
  const lookupPrices = { ...options.lookupPrices };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    const form = new URLSearchParams(body);
    calls.push({ method, url, body, form });
    if (url.hostname === "test.supabase.co") {
      if (url.pathname === "/auth/v1/user" && method === "GET") return pricingJson({ id: pricingUser, email: "pricing@maiprop.test", aud: "authenticated", role: "authenticated" });
      if (url.pathname === "/rest/v1/profiles" && method === "GET") return pricingJson({ role: options.admin ? "admin" : "buyer", is_platform_admin: Boolean(options.platformAdmin) });
      if (url.pathname === "/rest/v1/pricing_configs" && method === "GET") return pricingJson(options.configs ?? []);
      if (url.pathname === "/rest/v1/pricing_configs" && method === "PATCH") {
        if (options.failDbPatch) return pricingJson({ message: "synthetic save failure" }, 500);
        const id = String(url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        const config = options.configs?.find((row) => row.id === id);
        if (config) Object.assign(config, JSON.parse(body));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/pro_product_ids" && method === "POST") return options.failPro ? pricingJson({ message: "synthetic Pro failure" }, 500) : new Response(null, { status: 201 });
    }
    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/account" && method === "GET") return pricingJson({ id: options.stripeAccount ?? pricingAccount });
      if (url.pathname === "/v1/balance" && method === "GET") return pricingJson({ livemode: false, available: [], pending: [] });
      if (options.failPath === url.pathname) return pricingJson({ error: { message: "synthetic Stripe failure", type: "api_error" } }, 400);
      if (url.pathname === "/v1/products" && method === "POST") {
        if (options.failProductOnce && productFailures++ === 0) return pricingJson({ error: { message: "synthetic first-product failure", type: "api_error" } }, 400);
        return pricingJson({ id: `prod_pricing_${++productNumber}`, object: "product" });
      }
      if (url.pathname.startsWith("/v1/products/") && method === "POST") return pricingJson({ id: url.pathname.split("/").pop(), object: "product" });
      if (url.pathname === "/v1/prices" && method === "GET") {
        const lookup = url.searchParams.get("lookup_keys[0]") ?? "";
        const found = lookupPrices[lookup];
        return pricingJson({ object: "list", data: found ? [found] : [], has_more: false });
      }
      if (url.pathname === "/v1/prices" && method === "POST") {
        const price = { id: `price_pricing_${++priceNumber}`, object: "price", active: true, product: form.get("product"), currency: form.get("currency"), unit_amount: Number(form.get("unit_amount")), recurring: form.get("recurring[interval]") ? { interval: form.get("recurring[interval]") } : null, tax_behavior: form.get("tax_behavior") };
        const lookup = form.get("lookup_key");
        if (lookup) lookupPrices[lookup] = price;
        return pricingJson(price);
      }
      if (url.pathname.startsWith("/v1/prices/") && method === "POST") return pricingJson({ id: url.pathname.split("/").pop(), object: "price", active: false });
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected pricing transport ${method} ${url}`);
  };
  try {
    const ip = `203.0.113.${++pricingIp}`;
    const repeat = async () => {
      const response = await handler(authedReq("POST", options.body ?? {}, { "x-forwarded-for": ip }));
      return { response, result: await response.json() as Record<string, unknown> };
    };
    const { response, result } = await repeat();
    await inspect(response, result, calls, repeat);
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originals) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
};

Deno.test("pricing handler rejects non-admin and malformed selection before Stripe calls", async () => {
  await pricingFixture({ configs: [pricingConfig()] }, (response, body, calls) => {
    assertEquals(response.status, 403);
    assertEquals(body.error, "Platform admin only");
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs"), false);
  });
  await pricingFixture({ admin: true, body: { unknown_field: true } }, (response, _body, calls) => {
    assertEquals(response.status, 400);
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
  });
});

Deno.test("pricing handler creates product, monthly and annual prices before durable metadata", async () => {
  await pricingFixture({ admin: true, configs: [pricingConfig()] }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).created, 1);
    const products = calls.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST");
    const prices = calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST");
    assertEquals(products.length, 1);
    assertEquals(prices.length, 2);
    assertEquals(prices[0].form.get("unit_amount"), "1900");
    assertEquals(prices[0].form.get("recurring[interval]"), "month");
    assertEquals(prices[0].form.get("tax_behavior"), "exclusive");
    assertEquals(prices[1].form.get("unit_amount"), "19000");
    assertEquals(prices[1].form.get("recurring[interval]"), "year");
    assertEquals(prices[0].form.get("lookup_key"), "maiprop_pro_monthly");
    assertEquals(prices[1].form.get("lookup_key"), "maiprop_pro_annual");
    const save = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    const pro = calls.find((call) => call.url.pathname === "/rest/v1/pro_product_ids");
    assertEquals(save?.url.searchParams.get("id"), "eq.cfg_pro");
    assertEquals(Boolean(save && pro), true);
    const metadata = JSON.parse(save!.body).metadata;
    assertEquals(metadata.stripe_price_id_monthly, "price_pricing_1");
    assertEquals(metadata.stripe_price_id_annual, "price_pricing_2");
    assertEquals(metadata.stripe_last_amount_monthly, "19");
    assertEquals(metadata.stripe_last_amount_annual, "190");
    assertEquals(calls.indexOf(save!) > calls.indexOf(prices[1]), true);
    assertEquals(calls.indexOf(pro!) > calls.indexOf(save!), true);
  });
});

Deno.test("pricing handler reuses a matching active lookup price without creating another", async () => {
  const lookup = "maiprop_featured_listing";
  await pricingFixture({ admin: true, configs: [pricingConfig({ key: "featured_listing", module: "adhoc_charges", unit: "per_listing", metadata: { stripe_product_id: "prod_existing", stripe_last_label: "Pro", stripe_last_audience: "participant", stripe_tax_code: "txcd_10103000" } })], lookupPrices: { [lookup]: { id: "price_existing", product: "prod_existing", currency: "eur", unit_amount: 1900, recurring: null, tax_behavior: "exclusive" } } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).product_updated, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST").length, 0);
    const save = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    assertEquals(JSON.parse(save!.body).metadata.stripe_price_id, "price_existing");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pro_product_ids"), false);
  });
});

Deno.test("pricing handler keeps per-config errors and continues to the next row", async () => {
  const first = pricingConfig({ id: "cfg_bad", key: "bad" });
  const second = pricingConfig({ id: "cfg_good", key: "good", module: "adhoc_charges", unit: "per_listing" });
  await pricingFixture({ admin: true, configs: [first, second], failDbPatch: true }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 2);
    assertEquals((body.results as Array<Record<string, unknown>>).map((r) => r.id), ["cfg_bad", "cfg_good"]);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST").length, 2);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids").length, 0);
  });
});

Deno.test("pricing handler creates replacement price before archiving stale price and saving metadata", async () => {
  const metadata = { stripe_product_id: "prod_existing", stripe_price_id: "price_old", stripe_last_amount: "19", stripe_last_label: "Pro", stripe_last_audience: "participant", stripe_tax_code: "txcd_10103000", stripe_tax_behavior: "exclusive" };
  const lookup = "maiprop_featured_listing";
  await pricingFixture({ admin: true, configs: [pricingConfig({ key: "featured_listing", module: "adhoc_charges", unit: "per_listing", amount: 20, metadata })], lookupPrices: { [lookup]: { id: "price_old", product: "prod_existing", currency: "eur", unit_amount: 1900, tax_behavior: "exclusive" } } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    const created = calls.find((call) => call.url.pathname === "/v1/prices" && call.method === "POST");
    const archived = calls.filter((call) => call.url.pathname === "/v1/prices/price_old" && call.method === "POST");
    const saved = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    assertEquals(created?.form.get("unit_amount"), "2000");
    assertEquals(created?.form.get("transfer_lookup_key"), "true");
    assertEquals(archived.length, 2, "source archives both old ID and active lookup ID when they coincide");
    assertEquals(calls.indexOf(created!) < calls.indexOf(archived[0]), true);
    assertEquals(calls.indexOf(archived[1]) < calls.indexOf(saved!), true);
    assertEquals(JSON.parse(saved!.body).metadata.stripe_last_amount, "20");
  });
});

Deno.test("pricing handler updates product metadata for audience drift without replacing price", async () => {
  const metadata = { stripe_product_id: "prod_audience", stripe_price_id: "price_audience", stripe_last_amount: "19", stripe_last_label: "Pro", stripe_last_audience: "participant", stripe_tax_code: "txcd_10103001", stripe_tax_behavior: "exclusive" };
  await pricingFixture({ admin: true, configs: [pricingConfig({ key: "audience_pro", audience: "professional", module: "professional_subscription", unit: "yearly", metadata })] }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).product_updated, 1);
    assertEquals(calls.filter((call) => call.url.pathname.startsWith("/v1/products/") && call.method === "POST").length, 1);
    assertEquals(calls.filter((call) => call.url.pathname.startsWith("/v1/prices/") && call.method === "POST").length, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST").length, 0);
    const save = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    assertEquals(JSON.parse(save!.body).metadata.stripe_last_audience, "professional");
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids").length, 1);
  });
});

Deno.test("pricing handler honors explicit annual companion amount and selection filter", async () => {
  await pricingFixture({ platformAdmin: true, body: { config_ids: ["cfg_pro"] }, configs: [pricingConfig({ metadata: { annual_amount: "210" } })] }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).created, 1);
    const read = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "GET");
    assertEquals(read?.url.searchParams.get("is_active"), "eq.true");
    assertEquals(read?.url.searchParams.get("amount"), "gt.0");
    assertEquals(read?.url.searchParams.get("id"), "in.(cfg_pro)");
    const annual = calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST")[1];
    assertEquals(annual.form.get("unit_amount"), "21000");
  });
});

Deno.test("pricing handler reports Pro registration failure after remote and metadata writes", async () => {
  await pricingFixture({ admin: true, configs: [pricingConfig()], failPro: true }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    const save = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    const pro = calls.find((call) => call.url.pathname === "/rest/v1/pro_product_ids" && call.method === "POST");
    assertEquals(Boolean(save && pro), true);
    assertEquals(calls.indexOf(save!) < calls.indexOf(pro!), true);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST").length, 2);
  });
});

Deno.test("pricing handler repeat keeps durable prices and product unchanged", async () => {
  const configs = [pricingConfig()];
  await pricingFixture({ admin: true, configs }, async (response, body, calls, repeat) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).created, 1);
    const firstCalls = calls.length;
    const second = await repeat();
    assertEquals(second.response.status, 200);
    assertEquals((second.result.summary as Record<string, unknown>).no_change, 1);
    const repeated = calls.slice(firstCalls);
    assertEquals(repeated.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST").length, 0);
    assertEquals(repeated.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST").length, 0);
    assertEquals(repeated.filter((call) => call.url.pathname.startsWith("/v1/prices/") && call.method === "POST").length, 0);
    assertEquals(repeated.filter((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH").length, 0);
    const savedMetadata = configs[0].metadata as Record<string, unknown>;
    assertEquals(savedMetadata.stripe_price_id_monthly, "price_pricing_1");
    assertEquals(savedMetadata.stripe_price_id_annual, "price_pricing_2");
  });
});

Deno.test("pricing handler retry after metadata-save failure creates a new product and transfers active lookups", async () => {
  const configs = [pricingConfig()];
  const options = { admin: true, configs, failDbPatch: true };
  await pricingFixture(options, async (response, body, calls, repeat) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals((body.results as Array<Record<string, unknown>>)[0].error, "Failed to save Stripe pricing metadata: synthetic save failure");
    assertEquals(Object.keys(configs[0].metadata), [], "failed durable write leaves original config without provider IDs");
    const first = calls.slice();
    assertEquals(first.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST").length, 1);
    assertEquals(first.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST").length, 2);
    assertEquals(first.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids").length, 0);
    options.failDbPatch = false;
    const retry = await repeat();
    assertEquals(retry.response.status, 200);
    assertEquals((retry.result.summary as Record<string, unknown>).created, 1);
    const retried = calls.slice(first.length);
    assertEquals(retried.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST").length, 1);
    const created = retried.filter((call) => call.url.pathname === "/v1/prices" && call.method === "POST");
    assertEquals(created.length, 2);
    assertEquals(created.map((call) => call.form.get("transfer_lookup_key")), ["true", "true"]);
    assertEquals(created.map((call) => call.form.get("product")), ["prod_pricing_2", "prod_pricing_2"]);
    assertEquals(retried.filter((call) => call.url.pathname.startsWith("/v1/prices/price_pricing_") && call.method === "POST").length, 2);
    const saved = configs[0].metadata as Record<string, unknown>;
    assertEquals(saved.stripe_product_id, "prod_pricing_2");
    assertEquals(saved.stripe_price_id_monthly, "price_pricing_3");
    assertEquals(saved.stripe_price_id_annual, "price_pricing_4");
  });
});

Deno.test("pricing handler isolates a remote product failure and continues with the second config", async () => {
  const configs = [pricingConfig({ id: "cfg_remote_bad", key: "remote_bad" }), pricingConfig({ id: "cfg_remote_good", key: "remote_good", module: "adhoc_charges", unit: "per_listing" })];
  await pricingFixture({ admin: true, configs, failProductOnce: true }, (response, body, calls) => {
    assertEquals(response.status, 200);
    const results = body.results as Array<Record<string, unknown>>;
    assertEquals(results.map((result) => [result.id, result.action]), [["cfg_remote_bad", "error"], ["cfg_remote_good", "created"]]);
    assertEquals(String(results[0].error).includes("synthetic first-product failure"), true);
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals((body.summary as Record<string, unknown>).created, 1);
    const products = calls.filter((call) => call.url.pathname === "/v1/products" && call.method === "POST");
    const price = calls.find((call) => call.url.pathname === "/v1/prices" && call.method === "POST");
    const save = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH");
    assertEquals(products.length, 2);
    assertEquals(Boolean(price && save), true);
    assertEquals(calls.indexOf(products[1]) < calls.indexOf(price!), true);
    assertEquals(calls.indexOf(price!) < calls.indexOf(save!), true);
    assertEquals(save!.url.searchParams.get("id"), "eq.cfg_remote_good");
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH").length, 1);
  });
});

Deno.test("pricing handler rejects a mismatched Stripe account before remote catalog writes", async () => {
  await pricingFixture({ admin: true, configs: [pricingConfig()], stripeAccount: "acct_wrong_pricing" }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/account" && call.method === "GET").length, 1);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/products" || call.url.pathname === "/v1/prices"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH"), false);
  });
});

Deno.test("pricing handler existing price currently leaves currency drift unchanged", async () => {
  const metadata = { stripe_product_id: "prod_currency", stripe_price_id: "price_currency", stripe_last_amount: "19", stripe_last_label: "Pro", stripe_last_audience: "participant", stripe_tax_code: "txcd_10103000", stripe_tax_behavior: "exclusive" };
  const lookup = "maiprop_featured_listing";
  await pricingFixture({ admin: true, configs: [pricingConfig({ key: "featured_listing", module: "adhoc_charges", unit: "per_listing", currency: "USD", metadata })], lookupPrices: { [lookup]: { id: "price_currency", active: true, product: "prod_currency", currency: "eur", unit_amount: 1900, recurring: null, tax_behavior: "exclusive" } } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).no_change, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices" && call.method === "GET").length, 1);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/prices" && call.method === "POST"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH"), false);
    assertEquals(metadata.stripe_price_id, "price_currency");
  });
});
