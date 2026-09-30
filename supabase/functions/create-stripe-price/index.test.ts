/**
 * Tests for create-stripe-price edge function (admin only).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
  const res = await handler(
    req("POST", { name: "Pro Plan", amount: 2900, interval: "month" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns auth/permission error, not crash", async () => {
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.hostname === "test.supabase.co" && request.method === "GET" && url.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ message: "invalid token" }), { status: 401, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected price auth transport ${request.method} ${url}`);
  };
  try {
    const res = await handler(authedReq("POST", { config_id: "config_e2" }));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(calls, ["GET /auth/v1/user"]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("created Stripe prices persist billing-cycle-specific metadata", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "stripe_price_id_monthly");
  assertStringIncludes(source, "stripe_price_id_annual");
  assertStringIncludes(source, "setCycleSpecificPriceMetadata");
  assertStringIncludes(source, "stripe_tax_behavior_monthly");
  assertStringIncludes(source, "stripe_tax_behavior_annual");
});

Deno.test("per-row price creation writes Stripe Tax settings to Products and Prices", async () => {
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
  assertStringIncludes(source, "applyStripeTaxMetadata(meta, stripeTaxCode)");
});

type PriceCall = { method: string; url: URL; body: string; form: URLSearchParams; key: string | null };
type RemotePrice = {
  id: string; object: "price"; active: boolean; product: string; currency: string;
  unit_amount: number; recurring: { interval: string } | null; tax_behavior: string;
  metadata: Record<string, string>; livemode: false;
};
const priceActor = "00000000-0000-4000-8000-000000000191";
const priceAccount = "acct_testpricee2";
const stageAccount = "acct_1TnuLbGfkWWBWEyh";
let priceFixtureNumber = 0;
const priceJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const basePriceConfig = () => ({
  id: "config_e2", key: "pro", audience: "participant", module: "user_subscription",
  label: "MaiProp Pro", description: "Pro access", amount: 19, currency: "eur", unit: "monthly",
  metadata: {} as Record<string, unknown>,
});
const remotePrice = (id: string, interval: string | null, unitAmount: number, overrides: Partial<RemotePrice> = {}): RemotePrice => ({
  id, object: "price", active: true, product: "prod_existing", currency: "eur",
  unit_amount: unitAmount, recurring: interval ? { interval } : null,
  tax_behavior: "exclusive", metadata: { pricing_config_id: "config_e2" }, livemode: false,
  ...overrides,
});

async function priceFixture(
  options: {
    profile?: { role: string; is_platform_admin?: boolean };
    input?: Record<string, unknown>;
    config?: ReturnType<typeof basePriceConfig> | null;
    configError?: boolean;
    patchError?: boolean;
    proError?: boolean;
    failProviderPath?: string;
    stripeKey?: string;
    expectedAccount?: string;
    seedPrices?: RemotePrice[];
  },
  inspect: (response: Response, body: Record<string, unknown>, calls: PriceCall[], state: {
    config: ReturnType<typeof basePriceConfig> | null;
    repeat: () => Promise<{ response: Response; body: Record<string, unknown> }>;
  }) => void | Promise<void>,
) {
  const oldFetch = globalThis.fetch;
  const envKeys = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "BILLING_MODE"];
  const oldEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  const config = options.config === undefined ? basePriceConfig() : options.config;
  const marked = config?.metadata.staging_catalog_initialized_by_stage_release === true;
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", options.expectedAccount ?? (marked ? stageAccount : priceAccount));
  Deno.env.set("STRIPE_SECRET_KEY", options.stripeKey ?? `sk_test_pricee2${++priceFixtureNumber}`);
  Deno.env.set("BILLING_MODE", "live");
  const calls: PriceCall[] = [];
  const unexpected: string[] = [];
  let productNumber = 0;
  let priceNumber = 0;
  const prices = new Map((options.seedPrices ?? []).map((price) => [price.id, { ...price }]));
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    calls.push({ method, url, body, form: new URLSearchParams(body), key: request.headers.get("Idempotency-Key") });
    if (url.hostname === "test.supabase.co") {
      if (method === "GET" && url.pathname === "/auth/v1/user") {
        return priceJson({ id: priceActor, email: "admin@maiprop.test", aud: "authenticated", role: "authenticated" });
      }
      if (method === "GET" && url.pathname === "/rest/v1/profiles") {
        return priceJson(options.profile ?? { role: "admin" });
      }
      if (method === "GET" && url.pathname === "/rest/v1/pricing_configs") {
        if (options.configError) return priceJson({ code: "PGRST116", message: "config unavailable" }, 406);
        return config && url.searchParams.get("id") === `eq.${config.id}`
          ? priceJson(config)
          : priceJson({ code: "PGRST116", details: "The result contains 0 rows", message: "Cannot coerce the result to a single JSON object" }, 406);
      }
      if (method === "PATCH" && url.pathname === "/rest/v1/pricing_configs") {
        if (url.searchParams.getAll("id").length !== 1 || url.searchParams.get("id") !== "eq.config_e2") {
          unexpected.push(`${method} ${url}`);
          throw new Error(`Pricing metadata PATCH is not bound to config_e2: ${url}`);
        }
        if (options.patchError) return priceJson({ message: "synthetic metadata save failure" }, 500);
        if (config) Object.assign(config, JSON.parse(body));
        return new Response(null, { status: 204 });
      }
      if (method === "POST" && url.pathname === "/rest/v1/pro_product_ids") {
        return options.proError
          ? priceJson({ message: "synthetic Pro registration failure" }, 500)
          : new Response(null, { status: 201 });
      }
    }
    if (url.hostname === "api.stripe.com") {
      if (method === "GET" && url.pathname === "/v1/account") return priceJson({ id: marked ? stageAccount : priceAccount });
      if (method === "GET" && url.pathname === "/v1/balance") return priceJson({ livemode: false, available: [], pending: [] });
      if (url.pathname === options.failProviderPath) {
        return priceJson({ error: { message: "synthetic provider failure", type: "api_error" } }, 500);
      }
      if (method === "POST" && url.pathname === "/v1/products") {
        return priceJson({ id: `prod_e2_${++productNumber}`, object: "product", livemode: false });
      }
      if (method === "POST" && url.pathname.startsWith("/v1/products/")) {
        return priceJson({ id: url.pathname.split("/").pop(), object: "product", livemode: false });
      }
      if (method === "POST" && url.pathname === "/v1/prices") {
        const form = new URLSearchParams(body);
        const price: RemotePrice = {
          id: `price_e2_${++priceNumber}`, object: "price", active: true,
          product: form.get("product") ?? "", currency: form.get("currency") ?? "",
          unit_amount: Number(form.get("unit_amount")),
          recurring: form.get("recurring[interval]") ? { interval: form.get("recurring[interval]")! } : null,
          tax_behavior: form.get("tax_behavior") ?? "",
          metadata: { pricing_config_id: form.get("metadata[pricing_config_id]") ?? "" },
          livemode: false,
        };
        prices.set(price.id, price);
        return priceJson(price);
      }
      if (method === "GET" && url.pathname.startsWith("/v1/prices/")) {
        const price = prices.get(url.pathname.split("/").pop()!);
        return price ? priceJson(price) : priceJson({ error: { message: "No such price", type: "invalid_request_error", code: "resource_missing" } }, 404);
      }
      if (method === "POST" && url.pathname.startsWith("/v1/prices/")) {
        const price = prices.get(url.pathname.split("/").pop()!);
        if (!price) return priceJson({ error: { message: "No such price", type: "invalid_request_error", code: "resource_missing" } }, 404);
        price.active = false;
        return priceJson(price);
      }
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected price transport ${method} ${url}`);
  };
  try {
    const ip = `203.0.113.${priceFixtureNumber}`;
    const repeat = async () => {
      const response = await handler(authedReq("POST", options.input ?? { config_id: "config_e2" }, { "x-forwarded-for": ip }));
      return { response, body: await response.json() as Record<string, unknown> };
    };
    const { response, body } = await repeat();
    await inspect(response, body, calls, { config, repeat });
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of oldEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("price handler binds admin role, config ID, and positive amount before Stripe", async () => {
  for (const options of [
    { profile: { role: "buyer", is_platform_admin: false }, expected: 403 },
    { profile: { role: "buyer", is_platform_admin: true }, expected: 403 },
    { input: {}, expected: 400 },
    { input: { config_id: "config_e2", unexpected: true }, expected: 400 },
    { config: null, expected: 500 },
    { configError: true, expected: 500 },
    { config: { ...basePriceConfig(), amount: 0 }, expected: 500 },
  ]) {
    await priceFixture(options, (response, _body, calls) => {
      assertEquals(response.status, options.expected);
      assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
      const profile = calls.find((call) => call.url.pathname === "/rest/v1/profiles");
      assertEquals(profile?.url.searchParams.get("user_id"), `eq.${priceActor}`);
      const row = calls.find((call) => call.url.pathname === "/rest/v1/pricing_configs");
      if (row) assertEquals(row.url.searchParams.get("id"), "eq.config_e2");
    });
  }
});

Deno.test("price handler creates one monthly config, annual companion, then durable metadata and Pro registration", async () => {
  await priceFixture({}, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.product_id, "prod_e2_1");
    assertEquals(body.price_id, "price_e2_1");
    assertEquals(body.annual_price_id, "price_e2_2");
    const paths = calls.map((call) => call.url.pathname);
    assert(paths.indexOf("/v1/account") < paths.indexOf("/v1/products"));
    assert(paths.indexOf("/v1/balance") < paths.indexOf("/v1/products"));
    assert(paths.indexOf("/v1/products") < paths.indexOf("/v1/prices"));
    assert(paths.lastIndexOf("/v1/prices") < paths.lastIndexOf("/rest/v1/pricing_configs"));
    assert(paths.lastIndexOf("/rest/v1/pricing_configs") < paths.indexOf("/rest/v1/pro_product_ids"));
    const metadataWrite = calls.find((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs");
    assertEquals(metadataWrite?.url.searchParams.getAll("id"), ["eq.config_e2"]);
    const product = calls.find((call) => call.url.pathname === "/v1/products")!;
    const prices = calls.filter((call) => call.url.pathname === "/v1/prices");
    assertEquals(product.form.get("name"), "MaiProp Pro");
    assertEquals(product.form.get("metadata[pricing_config_id]"), "config_e2");
    assert(product.form.get("tax_code"));
    assertEquals(prices.map((call) => call.form.get("unit_amount")), ["1900", "19000"]);
    assertEquals(prices.map((call) => call.form.get("recurring[interval]")), ["month", "year"]);
    assertEquals(prices.map((call) => call.form.get("tax_behavior")), ["exclusive", "exclusive"]);
    assertEquals(prices[0].form.get("metadata[plan_key]"), "pro");
    assertEquals(prices[1].form.get("metadata[billing_cycle]"), "annual");
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
    assertEquals(calls.find((call) => call.url.pathname === "/rest/v1/pro_product_ids")?.body, '{"product_id":"prod_e2_1"}');
  });
  await priceFixture({ config: { ...basePriceConfig(), module: "listing", unit: "one_time" } }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.annual_price_id, null);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 1);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pro_product_ids"), false);
  });
  await priceFixture({ config: { ...basePriceConfig(), module: "listing", unit: "yearly" } }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.annual_price_id, null);
    const created = calls.filter((call) => call.method === "POST" && call.url.pathname === "/v1/prices");
    assertEquals(created.length, 1);
    assertEquals(created[0].form.get("recurring[interval]"), "year");
  });
});

Deno.test("price handler reuses matching prices and replaces stale tax prices before saving aliases", async () => {
  const existing = {
    stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_old_month",
    stripe_price_id_annual: "price_old_year", stripe_last_amount_monthly: "19",
    stripe_last_amount_annual: "190", stripe_tax_behavior_monthly: "exclusive",
    stripe_tax_behavior_annual: "exclusive", keep_me: "preserved",
  };
  const seedPrices = [remotePrice("price_old_month", "month", 1900), remotePrice("price_old_year", "year", 19000)];
  await priceFixture({ config: { ...basePriceConfig(), metadata: { ...existing } }, seedPrices }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_old_month");
    assertEquals(body.annual_price_id, "price_old_year");
    assertEquals(calls.some((call) => call.url.pathname === "/v1/products/prod_existing"), true);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/prices"), false);
    assertEquals(calls.filter((call) => call.method === "GET" && call.url.pathname.startsWith("/v1/prices/")).map((call) => call.url.pathname), ["/v1/prices/price_old_month", "/v1/prices/price_old_year"]);
    assertEquals(calls.some((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices/")), false);
  });
  await priceFixture({ config: { ...basePriceConfig(), amount: 25, metadata: { ...existing } }, seedPrices }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    const priceWrites = calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices"));
    assertEquals(priceWrites.map((call) => call.url.pathname), ["/v1/prices", "/v1/prices", "/v1/prices/price_old_month", "/v1/prices/price_old_year"]);
    assert(calls.indexOf(priceWrites[3]) < calls.findIndex((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs"));
    assertEquals(state.config?.metadata.keep_me, "preserved");
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_monthly_price_id, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
    assertEquals(state.config?.metadata.stripe_yearly_price_id, "price_e2_2");
  });
});

Deno.test("remote monthly amount drift replaces only that cycle despite matching saved metadata", async () => {
  const metadata = {
    stripe_product_id: "prod_existing", stripe_price_id: "price_old_month",
    stripe_price_id_monthly: "price_old_month", stripe_price_id_annual: "price_old_year",
    stripe_last_amount: "19", stripe_last_amount_monthly: "19", stripe_last_amount_annual: "190",
    stripe_tax_behavior: "exclusive", stripe_tax_behavior_monthly: "exclusive", stripe_tax_behavior_annual: "exclusive",
  };
  await priceFixture({
    config: { ...basePriceConfig(), metadata },
    seedPrices: [remotePrice("price_old_month", "month", 2000), remotePrice("price_old_year", "year", 19000)],
  }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_e2_1");
    assertEquals(body.annual_price_id, "price_old_year");
    const priceWrites = calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices"));
    assertEquals(priceWrites.map((call) => call.url.pathname), ["/v1/prices", "/v1/prices/price_old_month"]);
    assertEquals(priceWrites[0].form.get("unit_amount"), "1900");
    assertEquals(priceWrites[0].form.get("recurring[interval]"), "month");
    assertEquals(priceWrites[1].form.get("active"), "false");
    assertEquals(state.config?.metadata.stripe_price_id, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_old_year");
  });
});

Deno.test("one-time currency drift replaces the recorded price without a recurring or annual price", async () => {
  const config = { ...basePriceConfig(), module: "listing", unit: "one_time", currency: "usd", metadata: {
    stripe_product_id: "prod_existing", stripe_price_id: "price_old_once", stripe_last_amount: "19", stripe_tax_behavior: "exclusive",
  } };
  await priceFixture({ config, seedPrices: [remotePrice("price_old_once", null, 1900)] }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_e2_1");
    assertEquals(body.annual_price_id, null);
    const priceWrites = calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices"));
    assertEquals(priceWrites.map((call) => call.url.pathname), ["/v1/prices", "/v1/prices/price_old_once"]);
    assertEquals(priceWrites[0].form.get("currency"), "usd");
    assertEquals(priceWrites[0].form.get("unit_amount"), "1900");
    assertEquals(priceWrites[0].form.has("recurring[interval]"), false);
    assertEquals(state.config?.metadata.stripe_price_id, "price_e2_1");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pro_product_ids"), false);
  });
});

Deno.test("missing and foreign recorded prices produce owned replacements without archive", async () => {
  for (const recorded of [
    null,
    remotePrice("price_old_once", null, 1900, { product: "prod_foreign" }),
    remotePrice("price_old_once", null, 1900, { metadata: { pricing_config_id: "config_foreign" } }),
  ]) {
    const config = { ...basePriceConfig(), module: "listing", unit: "one_time", metadata: {
      stripe_product_id: "prod_existing", stripe_price_id: "price_old_once", stripe_last_amount: "19", stripe_tax_behavior: "exclusive",
    } };
    await priceFixture({ config, seedPrices: recorded ? [recorded] : [] }, (response, body, calls, state) => {
      assertEquals(response.status, 200, JSON.stringify(body));
      assertEquals(body.price_id, "price_e2_1");
      assertEquals(calls.filter((call) => call.method === "GET" && call.url.pathname === "/v1/prices/price_old_once").length, 1);
      assertEquals(calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices")).map((call) => call.url.pathname), ["/v1/prices"]);
      assertEquals(state.config?.metadata.stripe_price_id, "price_e2_1");
    });
  }
});

Deno.test("failed companion retrieval prevents all price writes and leaves metadata unchanged", async () => {
  const config = { ...basePriceConfig(), metadata: {
    stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_old_month", stripe_price_id_annual: "price_old_year",
  } };
  await priceFixture({ config, seedPrices: [remotePrice("price_old_month", "month", 1900)], failProviderPath: "/v1/prices/price_old_year" }, (response, _body, calls, state) => {
    assertEquals(response.status, 500);
    assertEquals(calls.some((call) => call.method === "GET" && call.url.pathname === "/v1/prices/price_old_month"), true);
    assertEquals(calls.some((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices")), false);
    assertEquals(calls.some((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs"), false);
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_old_year");
  });
});

Deno.test("shared recorded ID retained for monthly is not archived when annual is replaced", async () => {
  const config = { ...basePriceConfig(), metadata: {
    stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_shared", stripe_price_id_annual: "price_shared",
  } };
  await priceFixture({ config, seedPrices: [remotePrice("price_shared", "month", 1900)] }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_shared");
    assertEquals(body.annual_price_id, "price_e2_1");
    assertEquals(calls.filter((call) => call.method === "GET" && call.url.pathname === "/v1/prices/price_shared").length, 1);
    assertEquals(calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices")).map((call) => call.url.pathname), ["/v1/prices"]);
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_shared");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_1");
  });
});

Deno.test("inactive owned recorded price is replaced without an archive", async () => {
  const config = { ...basePriceConfig(), module: "listing", unit: "one_time", metadata: {
    stripe_product_id: "prod_existing", stripe_price_id: "price_old_once",
  } };
  await priceFixture({ config, seedPrices: [remotePrice("price_old_once", null, 1900, { active: false })] }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_e2_1");
    assertEquals(calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices")).map((call) => call.url.pathname), ["/v1/prices"]);
  });
});

Deno.test("one shared drifted price is archived once after both cycle replacements", async () => {
  const config = { ...basePriceConfig(), currency: "usd", metadata: {
    stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_shared", stripe_price_id_annual: "price_shared",
  } };
  await priceFixture({ config, seedPrices: [remotePrice("price_shared", "month", 1900)] }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_e2_1");
    assertEquals(body.annual_price_id, "price_e2_2");
    const priceWrites = calls.filter((call) => call.method === "POST" && call.url.pathname.startsWith("/v1/prices"));
    assertEquals(priceWrites.map((call) => call.url.pathname), ["/v1/prices", "/v1/prices", "/v1/prices/price_shared"]);
    assertEquals(priceWrites.slice(0, 2).map((call) => call.form.get("recurring[interval]")), ["month", "year"]);
    assertEquals(calls.filter((call) => call.method === "GET" && call.url.pathname === "/v1/prices/price_shared").length, 1);
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
  });
});

Deno.test("price handler replaces owned EUR monthly and annual IDs when the row changes to USD, then reuses USD", async () => {
  await priceFixture({}, async (first, firstBody, calls, state) => {
    assertEquals(first.status, 200, JSON.stringify(firstBody));
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 2);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").map((call) => call.form.get("currency")), ["eur", "eur"]);
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
    state.config!.currency = "usd";
    const second = await state.repeat();
    assertEquals(second.response.status, 200, JSON.stringify(second.body));
    assertEquals(second.body.price_id, "price_e2_3");
    assertEquals(second.body.annual_price_id, "price_e2_4");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 4);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").slice(2).map((call) => call.form.get("currency")), ["usd", "usd"]);
    const secondProductUpdate = calls.find((call) => call.url.pathname === "/v1/products/prod_e2_1");
    assert(secondProductUpdate);
    const configWrites = calls.filter((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs");
    assertEquals(configWrites.length, 2);
    assertEquals(JSON.parse(configWrites[1].body).metadata.stripe_price_id_monthly, "price_e2_3");
    assertEquals(JSON.parse(configWrites[1].body).metadata.stripe_price_id_annual, "price_e2_4");
    const stripeCalls = calls.filter((call) => call.url.hostname === "api.stripe.com");
    const oldReads = stripeCalls.filter((call) => call.method === "GET" && /^\/v1\/prices\/price_e2_[12]$/.test(call.url.pathname));
    assertEquals(oldReads.length, 2);
    const archives = stripeCalls.filter((call) => call.method === "POST" && /^\/v1\/prices\/price_e2_[12]$/.test(call.url.pathname));
    assertEquals(archives.map((call) => call.url.pathname), ["/v1/prices/price_e2_1", "/v1/prices/price_e2_2"]);
    assertEquals(archives.every((call) => call.form.get("active") === "false"), true);
    assert(calls.indexOf(oldReads[1]) < calls.findIndex((call) => call.method === "POST" && call.url.pathname === "/v1/prices" && call.form.get("currency") === "usd"));
    assert(calls.findLastIndex((call) => call.method === "POST" && call.url.pathname === "/v1/prices" && call.form.get("currency") === "usd") < calls.indexOf(archives[0]));
    assert(calls.indexOf(archives[1]) < calls.indexOf(configWrites[1]));
    const third = await state.repeat();
    assertEquals(third.response.status, 200, JSON.stringify(third.body));
    assertEquals(third.body.price_id, "price_e2_3");
    assertEquals(third.body.annual_price_id, "price_e2_4");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 4);
    assertEquals(calls.filter((call) => call.method === "POST" && /^\/v1\/prices\/price_e2_[12]$/.test(call.url.pathname)).length, 2);
    assertEquals(calls.filter((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs").length, 3);
    assertEquals(state.config?.metadata.stripe_price_id, "price_e2_3");
    assertEquals(state.config?.metadata.stripe_monthly_price_id, "price_e2_3");
    assertEquals(state.config?.metadata.stripe_annual_price_id, "price_e2_4");
    assertEquals(state.config?.metadata.stripe_yearly_price_id, "price_e2_4");
  });
});

Deno.test("marked stage row verifies exact sandbox identity and retries with stable create keys", async () => {
  const stage = { ...basePriceConfig(), metadata: { staging_catalog_initialized_by_stage_release: true } };
  for (const options of [
    { config: stage, stripeKey: "sk_live_wrong", expected: 500 },
    { config: stage, expectedAccount: priceAccount, expected: 500 },
  ]) {
    await priceFixture(options, (response, _body, calls) => {
      assertEquals(response.status, options.expected);
      assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
    });
  }
  await priceFixture({ config: { ...basePriceConfig(), metadata: { staging_catalog_initialized_by_stage_release: true } }, patchError: true },
    async (response, _body, calls, state) => {
      assertEquals(response.status, 500);
      const firstCreates = calls.filter((call) => call.url.pathname === "/v1/products" || call.url.pathname === "/v1/prices");
      assertEquals(firstCreates.length, 3);
      assert(firstCreates.every((call) => call.key?.startsWith("maiprop-stage-catalog-v1:")));
      const again = await state.repeat();
      assertEquals(again.response.status, 500);
      const writes = calls.filter((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs");
      assertEquals(writes.length, 2);
      assertEquals(writes.map((call) => call.url.searchParams.getAll("id")), [["eq.config_e2"], ["eq.config_e2"]]);
      const creates = calls.filter((call) => call.url.pathname === "/v1/products" || call.url.pathname === "/v1/prices");
      assertEquals(creates.slice(0, 3).map((call) => call.key), creates.slice(3).map((call) => call.key));
      assertEquals(state.config?.metadata.staging_catalog_initialized_by_stage_release, true);
      assertEquals(state.config?.metadata.stripe_product_id, undefined);
    });
});

Deno.test("price handler exposes partial durable and provider failures without claiming rollback", async () => {
  for (const options of [
    { patchError: true, failedPath: "/rest/v1/pricing_configs" },
    { proError: true, failedPath: "/rest/v1/pro_product_ids" },
    { failProviderPath: "/v1/products", failedPath: "/v1/products" },
    { failProviderPath: "/v1/prices", failedPath: "/v1/prices" },
    { config: { ...basePriceConfig(), metadata: { stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_old_month", stripe_last_amount_monthly: "19", stripe_tax_behavior_monthly: "stale" } }, failProviderPath: "/v1/prices/price_old_month", failedPath: "/v1/prices/price_old_month" },
  ]) {
    await priceFixture(options, (response, _body, calls, state) => {
      assertEquals(response.status, 500);
      assertEquals(calls.some((call) => call.url.pathname === options.failedPath), true);
      if (options.patchError) {
        assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pro_product_ids"), false);
        assertEquals(state.config?.metadata.stripe_price_id, undefined);
      }
      if (options.proError) assertEquals(state.config?.metadata.stripe_price_id, "price_e2_1");
      if (options.failProviderPath) assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs" && call.method === "PATCH"), false);
    });
  }
});

restore();
