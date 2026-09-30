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

Deno.test("per-row price creation reuses products, archives stale prices, and returns annual companion ids", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "existingProductId");
  assertStringIncludes(source, "stripe.products.update");
  assertStringIncludes(source, "stripe.prices.update");
  assertStringIncludes(source, "active: false");
  assertStringIncludes(source, "ensureAnnualCompanionPrice");
  assertStringIncludes(source, "annual_price_id");
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

Deno.test("per-row price replacement creates the new price before archiving the old price", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const createIndex = source.indexOf("const price = !existingPriceId");
  const archiveIndex = source.indexOf(
    "await stripe.prices.update(existingPriceId, { active: false })",
  );

  assertEquals(createIndex > -1, true);
  assertEquals(archiveIndex > -1, true);
  assertEquals(createIndex < archiveIndex, true);
  assertEquals(source.includes("is_platform_admin"), false);
  assertStringIncludes(
    source,
    "existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(
    source,
    "existingAnnualTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
});

Deno.test("marked stage-release rows enforce sandbox identity before Stripe mutation and use idempotency options", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const boundaryIndex = source.indexOf(
    "const markedStagingCatalog = assertMarkedStagingCatalogBoundary(",
  );
  const productMutationIndex = source.indexOf(
    "stripe.products.update(",
    boundaryIndex,
  );
  const priceMutationIndex = source.indexOf(
    "stripe.prices.create(",
    boundaryIndex,
  );
  assertEquals(boundaryIndex > -1, true);
  assertEquals(boundaryIndex < productMutationIndex, true);
  assertEquals(boundaryIndex < priceMutationIndex, true);
  assertStringIncludes(
    source,
    "expectedAccountId: MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID",
  );
  assertStringIncludes(
    source,
    "idempotencyKey: stagingCatalogIdempotencyKey({",
  );
  assertStringIncludes(source, 'kind: "product"');
  assertStringIncludes(source, 'kind: "annual"');
  assertStringIncludes(
    source,
    'kind: primaryCycle === "annual" ? "annual" : "monthly"',
  );
});

type PriceCall = { method: string; url: URL; body: string; form: URLSearchParams; key: string | null };
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
        return priceJson({ id: `price_e2_${++priceNumber}`, object: "price", livemode: false });
      }
      if (method === "POST" && url.pathname.startsWith("/v1/prices/")) {
        return priceJson({ id: url.pathname.split("/").pop(), object: "price", active: false, livemode: false });
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
});

Deno.test("price handler reuses matching prices and replaces stale tax prices before saving aliases", async () => {
  const existing = {
    stripe_product_id: "prod_existing", stripe_price_id_monthly: "price_old_month",
    stripe_price_id_annual: "price_old_year", stripe_last_amount_monthly: "19",
    stripe_last_amount_annual: "190", stripe_tax_behavior_monthly: "exclusive",
    stripe_tax_behavior_annual: "exclusive", keep_me: "preserved",
  };
  await priceFixture({ config: { ...basePriceConfig(), metadata: { ...existing } } }, (response, body, calls) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.price_id, "price_old_month");
    assertEquals(body.annual_price_id, "price_old_year");
    assertEquals(calls.some((call) => call.url.pathname === "/v1/products/prod_existing"), true);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/prices"), false);
  });
  await priceFixture({ config: { ...basePriceConfig(), amount: 25, metadata: { ...existing } } }, (response, body, calls, state) => {
    assertEquals(response.status, 200, JSON.stringify(body));
    const paths = calls.map((call) => call.url.pathname);
    assert(paths.indexOf("/v1/prices") < paths.indexOf("/v1/prices/price_old_month"));
    assert(paths.lastIndexOf("/v1/prices") < paths.indexOf("/v1/prices/price_old_year"));
    assert(paths.indexOf("/v1/prices/price_old_year") < paths.lastIndexOf("/rest/v1/pricing_configs"));
    assertEquals(state.config?.metadata.keep_me, "preserved");
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_monthly_price_id, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
    assertEquals(state.config?.metadata.stripe_yearly_price_id, "price_e2_2");
  });
});

Deno.test("price handler currently reuses saved EUR IDs after the same row changes to USD", async () => {
  await priceFixture({}, async (first, firstBody, calls, state) => {
    assertEquals(first.status, 200, JSON.stringify(firstBody));
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 2);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").map((call) => call.form.get("currency")), ["eur", "eur"]);
    assertEquals(state.config?.metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(state.config?.metadata.stripe_price_id_annual, "price_e2_2");
    state.config!.currency = "usd";
    const second = await state.repeat();
    assertEquals(second.response.status, 200, JSON.stringify(second.body));
    assertEquals(second.body.price_id, "price_e2_1");
    assertEquals(second.body.annual_price_id, "price_e2_2");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/prices").length, 2);
    const secondProductUpdate = calls.find((call) => call.url.pathname === "/v1/products/prod_e2_1");
    assert(secondProductUpdate);
    const configWrites = calls.filter((call) => call.method === "PATCH" && call.url.pathname === "/rest/v1/pricing_configs");
    assertEquals(configWrites.length, 2);
    assertEquals(JSON.parse(configWrites[1].body).metadata.stripe_price_id_monthly, "price_e2_1");
    assertEquals(JSON.parse(configWrites[1].body).metadata.stripe_price_id_annual, "price_e2_2");
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
