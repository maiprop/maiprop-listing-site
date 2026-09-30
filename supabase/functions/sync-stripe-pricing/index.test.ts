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
    if (
      url.hostname === "test.supabase.co" && request.method === "GET" &&
      url.pathname === "/auth/v1/user"
    ) {
      return Promise.resolve(
        pricingJson({ code: 401, msg: "invalid token" }, 401),
      );
    }
    throw new Error(
      `Unexpected pricing auth transport ${request.method} ${url}`,
    );
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
  assertStringIncludes(source, "annualCompanionAmountMajor");
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
  assertStringIncludes(source, "selectedIds.has(old.id)");
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

Deno.test("pricing sync fails loudly when Stripe metadata cannot be saved", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "role,is_platform_admin");
  assertStringIncludes(source, "Failed to save Stripe pricing metadata");
  assertStringIncludes(source, "if (updateError)");
});

restore();

type PricingCall = {
  method: string;
  url: URL;
  body: string;
  form: URLSearchParams;
};
const pricingJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const pricingUser = "00000000-0000-4000-8000-000000000072";
const pricingAccount = "acct_testpricinghandler";
let pricingIp = 0;

const pricingConfig = (overrides: Record<string, unknown> = {}) => ({
  id: "cfg_pro",
  key: "pro",
  audience: "participant",
  module: "user_subscription",
  unit: "monthly",
  amount: 19,
  currency: "EUR",
  label: "Pro",
  description: "Pro membership",
  metadata: {},
  ...overrides,
});

const pricingFixture = async (
  options: {
    admin?: boolean;
    platformAdmin?: boolean;
    body?: unknown;
    configs?: Array<Record<string, unknown>>;
    lookupPrices?: Record<string, Record<string, unknown>>;
    prices?: Record<string, Record<string, unknown>>;
    products?: Record<string, Record<string, unknown>>;
    failAnnualOnce?: boolean;
    failPriceOnce?: boolean;
    failPath?: string;
    failProductOnce?: boolean;
    failDbPatch?: boolean;
    failPro?: boolean;
    stripeAccount?: string;
  },
  inspect: (
    response: Response,
    result: Record<string, unknown>,
    calls: PricingCall[],
    repeat: () => Promise<
      { response: Response; result: Record<string, unknown> }
    >,
  ) => void | Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  const names = [
    "STRIPE_RUNTIME_MODE",
    "STRIPE_EXPECTED_ACCOUNT_ID",
    "STRIPE_SECRET_KEY",
  ];
  const originals = new Map(names.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", pricingAccount);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_pricing_handler");
  const calls: PricingCall[] = [];
  const unexpected: string[] = [];
  let productNumber = 0;
  let priceNumber = 0;
  let productFailures = 0;
  let priceFailures = 0;
  let annualFailures = 0;
  const products = structuredClone(options.products ?? {});
  const prices = structuredClone(options.prices ?? {});
  for (const [lookup, price] of Object.entries(options.lookupPrices ?? {})) {
    prices[String(price.id)] = {
      active: true,
      metadata: {},
      ...price,
      lookup_key: lookup,
    };
  }
  const metadataFrom = (form: URLSearchParams) =>
    Object.fromEntries(
      [...form].filter(([key]) => key.startsWith("metadata[")).map((
        [key, value],
      ) => [key.slice(9, -1), value]),
    );
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    const form = new URLSearchParams(body);
    calls.push({ method, url, body, form });
    if (url.hostname === "test.supabase.co") {
      if (url.pathname === "/auth/v1/user" && method === "GET") {
        return pricingJson({
          id: pricingUser,
          email: "pricing@maiprop.test",
          aud: "authenticated",
          role: "authenticated",
        });
      }
      if (url.pathname === "/rest/v1/profiles" && method === "GET") {
        return pricingJson({
          role: options.admin ? "admin" : "buyer",
          is_platform_admin: Boolean(options.platformAdmin),
        });
      }
      if (url.pathname === "/rest/v1/pricing_configs" && method === "GET") {
        return pricingJson(options.configs ?? []);
      }
      if (url.pathname === "/rest/v1/pricing_configs" && method === "PATCH") {
        if (options.failDbPatch) {
          return pricingJson({ message: "synthetic save failure" }, 500);
        }
        const id = String(url.searchParams.get("id") ?? "").replace(
          /^eq\./,
          "",
        );
        const config = options.configs?.find((row) => row.id === id);
        if (!config || url.searchParams.getAll("id").length !== 1) {
          throw new Error("Unscoped pricing PATCH");
        }
        Object.assign(config, JSON.parse(body));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/pro_product_ids" && method === "POST") {
        return options.failPro
          ? pricingJson({ message: "synthetic Pro failure" }, 500)
          : new Response(null, { status: 201 });
      }
    }
    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/account" && method === "GET") {
        return pricingJson({ id: options.stripeAccount ?? pricingAccount });
      }
      if (url.pathname === "/v1/balance" && method === "GET") {
        return pricingJson({ livemode: false, available: [], pending: [] });
      }
      if (options.failPath === url.pathname) {
        return pricingJson({
          error: { message: "synthetic Stripe failure", type: "api_error" },
        }, 400);
      }
      if (url.pathname === "/v1/products" && method === "POST") {
        if (options.failProductOnce && productFailures++ === 0) {
          return pricingJson({
            error: {
              message: "synthetic first-product failure",
              type: "api_error",
            },
          }, 400);
        }
        const product = {
          id: `prod_pricing_${++productNumber}`,
          object: "product",
          active: true,
          metadata: metadataFrom(form),
        };
        products[product.id] = product;
        return pricingJson(product);
      }
      if (url.pathname.startsWith("/v1/products/")) {
        const id = url.pathname.split("/").pop()!;
        if (method === "GET") {
          return products[id] ? pricingJson(products[id]) : pricingJson({
            error: {
              type: "invalid_request_error",
              code: "resource_missing",
              message: "No such product",
            },
          }, 404);
        }
        if (method === "POST") {
          products[id] = {
            ...products[id],
            id,
            active: true,
            metadata: metadataFrom(form),
          };
          return pricingJson(products[id]);
        }
      }
      if (url.pathname === "/v1/prices" && method === "GET") {
        const lookup = url.searchParams.get("lookup_keys[0]") ?? "";
        assertEquals(url.searchParams.get("active"), "true");
        const found = Object.values(prices).filter((price) =>
          price.lookup_key === lookup && price.active === true
        );
        return pricingJson({ object: "list", data: found, has_more: false });
      }
      if (url.pathname === "/v1/prices" && method === "POST") {
        if (
          (options.failPriceOnce && priceFailures++ === 0) ||
          (options.failAnnualOnce &&
            form.get("recurring[interval]") === "year" &&
            annualFailures++ === 0)
        ) {
          return pricingJson({
            error: { type: "api_error", message: "synthetic price failure" },
          }, 400);
        }
        const lookup = form.get("lookup_key");
        const old = Object.values(prices).find((price) =>
          price.lookup_key === lookup
        );
        if (old) {
          assertEquals(form.get("transfer_lookup_key"), "true");
          old.lookup_key = null;
        }
        const price = {
          id: `price_pricing_${++priceNumber}`,
          object: "price",
          active: true,
          product: form.get("product"),
          currency: form.get("currency"),
          unit_amount: Number(form.get("unit_amount")),
          recurring: form.get("recurring[interval]")
            ? { interval: form.get("recurring[interval]") }
            : null,
          tax_behavior: form.get("tax_behavior"),
          lookup_key: lookup,
          metadata: metadataFrom(form),
        };
        prices[price.id] = price;
        return pricingJson(price);
      }
      if (url.pathname.startsWith("/v1/prices/")) {
        const id = url.pathname.split("/").pop()!;
        if (method === "GET") {
          return prices[id] ? pricingJson(prices[id]) : pricingJson({
            error: {
              type: "invalid_request_error",
              code: "resource_missing",
              message: "No such price",
            },
          }, 404);
        }
        if (method === "POST") {
          if (!prices[id]) throw new Error(`Mutation of absent price ${id}`);
          if (form.has("active")) {
            prices[id].active = form.get("active") === "true";
          }
          if ([...form.keys()].some((key) => key.startsWith("metadata["))) {
            prices[id].metadata = metadataFrom(form);
          }
          return pricingJson(prices[id]);
        }
      }
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected pricing transport ${method} ${url}`);
  };
  try {
    const ip = `203.0.113.${++pricingIp}`;
    const repeat = async () => {
      const response = await handler(
        authedReq("POST", options.body ?? {}, { "x-forwarded-for": ip }),
      );
      return {
        response,
        result: await response.json() as Record<string, unknown>,
      };
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
  await pricingFixture(
    { configs: [pricingConfig()] },
    (response, body, calls) => {
      assertEquals(response.status, 403);
      assertEquals(body.error, "Platform admin only");
      assertEquals(
        calls.some((call) => call.url.hostname === "api.stripe.com"),
        false,
      );
      assertEquals(
        calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs"),
        false,
      );
    },
  );
  await pricingFixture(
    { admin: true, body: { unknown_field: true } },
    (response, _body, calls) => {
      assertEquals(response.status, 400);
      assertEquals(
        calls.some((call) => call.url.hostname === "api.stripe.com"),
        false,
      );
    },
  );
});

Deno.test("pricing handler creates product, monthly and annual prices before durable metadata", async () => {
  await pricingFixture(
    { admin: true, configs: [pricingConfig()] },
    (response, body, calls) => {
      assertEquals(response.status, 200);
      assertEquals((body.summary as Record<string, unknown>).created, 1);
      const products = calls.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      );
      const prices = calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      );
      assertEquals(products.length, 1);
      assertEquals(prices.length, 2);
      assertEquals(prices[0].form.get("unit_amount"), "1900");
      assertEquals(prices[0].form.get("recurring[interval]"), "month");
      assertEquals(prices[0].form.get("tax_behavior"), "exclusive");
      assertEquals(prices[1].form.get("unit_amount"), "19000");
      assertEquals(prices[1].form.get("recurring[interval]"), "year");
      assertEquals(prices[0].form.get("lookup_key"), "maiprop_pro_monthly");
      assertEquals(prices[1].form.get("lookup_key"), "maiprop_pro_annual");
      const save = calls.find((call) =>
        call.url.pathname === "/rest/v1/pricing_configs" &&
        call.method === "PATCH"
      );
      const pro = calls.find((call) =>
        call.url.pathname === "/rest/v1/pro_product_ids"
      );
      assertEquals(save?.url.searchParams.get("id"), "eq.cfg_pro");
      assertEquals(Boolean(save && pro), true);
      const metadata = JSON.parse(save!.body).metadata;
      assertEquals(metadata.stripe_price_id_monthly, "price_pricing_1");
      assertEquals(metadata.stripe_price_id_annual, "price_pricing_2");
      assertEquals(metadata.stripe_last_amount_monthly, "19");
      assertEquals(metadata.stripe_last_amount_annual, "190");
      assertEquals(calls.indexOf(save!) > calls.indexOf(prices[1]), true);
      assertEquals(calls.indexOf(pro!) > calls.indexOf(save!), true);
    },
  );
});

Deno.test("pricing handler reuses a matching active lookup price without creating another", async () => {
  const lookup = "maiprop_featured_listing";
  await pricingFixture({
    admin: true,
    configs: [pricingConfig({
      key: "featured_listing",
      module: "adhoc_charges",
      unit: "per_listing",
      metadata: {
        stripe_product_id: "prod_existing",
        stripe_last_label: "Pro",
        stripe_last_audience: "participant",
        stripe_tax_code: "txcd_10103000",
      },
    })],
    lookupPrices: {
      [lookup]: {
        id: "price_existing",
        product: "prod_existing",
        currency: "eur",
        unit_amount: 1900,
        recurring: null,
        tax_behavior: "exclusive",
      },
    },
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).product_updated, 1);
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      ).length,
      0,
    );
    const save = calls.find((call) =>
      call.url.pathname === "/rest/v1/pricing_configs" &&
      call.method === "PATCH"
    );
    assertEquals(
      JSON.parse(save!.body).metadata.stripe_price_id,
      "price_existing",
    );
    assertEquals(
      calls.some((call) => call.url.pathname === "/rest/v1/pro_product_ids"),
      false,
    );
  });
});

Deno.test("pricing handler keeps per-config errors and continues to the next row", async () => {
  const first = pricingConfig({ id: "cfg_bad", key: "bad" });
  const second = pricingConfig({
    id: "cfg_good",
    key: "good",
    module: "adhoc_charges",
    unit: "per_listing",
  });
  await pricingFixture({
    admin: true,
    configs: [first, second],
    failDbPatch: true,
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 2);
    assertEquals(
      (body.results as Array<Record<string, unknown>>).map((r) => r.id),
      ["cfg_bad", "cfg_good"],
    );
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      ).length,
      2,
    );
    assertEquals(
      calls.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids")
        .length,
      0,
    );
  });
});

Deno.test("pricing handler creates replacement price before archiving stale price and saving metadata", async () => {
  const metadata = {
    stripe_product_id: "prod_existing",
    stripe_price_id: "price_old",
    stripe_last_amount: "19",
    stripe_last_label: "Pro",
    stripe_last_audience: "participant",
    stripe_tax_code: "txcd_10103000",
    stripe_tax_behavior: "exclusive",
  };
  const lookup = "maiprop_featured_listing";
  await pricingFixture({
    admin: true,
    configs: [
      pricingConfig({
        key: "featured_listing",
        module: "adhoc_charges",
        unit: "per_listing",
        amount: 20,
        metadata,
      }),
    ],
    lookupPrices: {
      [lookup]: {
        id: "price_old",
        product: "prod_existing",
        currency: "eur",
        unit_amount: 1900,
        tax_behavior: "exclusive",
      },
    },
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    const created = calls.find((call) =>
      call.url.pathname === "/v1/prices" && call.method === "POST"
    );
    const archived = calls.filter((call) =>
      call.url.pathname === "/v1/prices/price_old" && call.method === "POST"
    );
    const saved = calls.find((call) =>
      call.url.pathname === "/rest/v1/pricing_configs" &&
      call.method === "PATCH"
    );
    assertEquals(created?.form.get("unit_amount"), "2000");
    assertEquals(created?.form.get("transfer_lookup_key"), "true");
    assertEquals(archived.length, 1, "archive each distinct owned ID once");
    assertEquals(calls.indexOf(created!) < calls.indexOf(archived[0]), true);
    assertEquals(calls.indexOf(archived[0]) < calls.indexOf(saved!), true);
    assertEquals(JSON.parse(saved!.body).metadata.stripe_last_amount, "20");
  });
});

Deno.test("pricing handler updates product metadata for audience drift without replacing price", async () => {
  const metadata = {
    stripe_product_id: "prod_audience",
    stripe_price_id: "price_audience",
    stripe_last_amount: "19",
    stripe_last_label: "Pro",
    stripe_last_audience: "participant",
    stripe_tax_code: "txcd_10103001",
    stripe_tax_behavior: "exclusive",
  };
  await pricingFixture({
    admin: true,
    configs: [
      pricingConfig({
        key: "audience_pro",
        audience: "professional",
        module: "professional_subscription",
        unit: "yearly",
        metadata,
      }),
    ],
    prices: {
      price_audience: {
        id: "price_audience",
        active: true,
        product: "prod_audience",
        currency: "eur",
        unit_amount: 1900,
        recurring: { interval: "year" },
        tax_behavior: "exclusive",
      },
    },
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).product_updated, 1);
    assertEquals(
      calls.filter((call) =>
        call.url.pathname.startsWith("/v1/products/") && call.method === "POST"
      ).length,
      1,
    );
    assertEquals(
      calls.filter((call) =>
        call.url.pathname.startsWith("/v1/prices/") && call.method === "POST"
      ).length,
      1,
    );
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      ).length,
      0,
    );
    const save = calls.find((call) =>
      call.url.pathname === "/rest/v1/pricing_configs" &&
      call.method === "PATCH"
    );
    assertEquals(
      JSON.parse(save!.body).metadata.stripe_last_audience,
      "professional",
    );
    assertEquals(
      calls.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids")
        .length,
      1,
    );
  });
});

Deno.test("pricing handler honors explicit annual companion amount and selection filter", async () => {
  await pricingFixture({
    platformAdmin: true,
    body: { config_ids: ["cfg_pro"] },
    configs: [pricingConfig({ metadata: { annual_amount: "210" } })],
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).created, 1);
    const read = calls.find((call) =>
      call.url.pathname === "/rest/v1/pricing_configs" && call.method === "GET"
    );
    assertEquals(read?.url.searchParams.get("is_active"), "eq.true");
    assertEquals(read?.url.searchParams.get("amount"), "gt.0");
    assertEquals(read?.url.searchParams.get("id"), "in.(cfg_pro)");
    const annual = calls.filter((call) =>
      call.url.pathname === "/v1/prices" && call.method === "POST"
    )[1];
    assertEquals(annual.form.get("unit_amount"), "21000");
  });
});

Deno.test("pricing handler reports Pro registration failure after remote and metadata writes", async () => {
  await pricingFixture({
    admin: true,
    configs: [pricingConfig()],
    failPro: true,
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    const save = calls.find((call) =>
      call.url.pathname === "/rest/v1/pricing_configs" &&
      call.method === "PATCH"
    );
    const pro = calls.find((call) =>
      call.url.pathname === "/rest/v1/pro_product_ids" && call.method === "POST"
    );
    assertEquals(Boolean(save && pro), true);
    assertEquals(calls.indexOf(save!) < calls.indexOf(pro!), true);
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      ).length,
      2,
    );
  });
});

Deno.test("pricing handler repeat keeps durable prices and product unchanged", async () => {
  const configs = [pricingConfig()];
  await pricingFixture(
    { admin: true, configs },
    async (response, body, calls, repeat) => {
      assertEquals(response.status, 200);
      assertEquals((body.summary as Record<string, unknown>).created, 1);
      const firstCalls = calls.length;
      const second = await repeat();
      assertEquals(second.response.status, 200);
      assertEquals(
        (second.result.summary as Record<string, unknown>).no_change,
        1,
      );
      const repeated = calls.slice(firstCalls);
      assertEquals(
        repeated.filter((call) =>
          call.url.pathname === "/v1/products" && call.method === "POST"
        ).length,
        0,
      );
      assertEquals(
        repeated.filter((call) =>
          call.url.pathname === "/v1/prices" && call.method === "POST"
        ).length,
        0,
      );
      assertEquals(
        repeated.filter((call) =>
          call.url.pathname.startsWith("/v1/prices/") && call.method === "POST"
        ).length,
        0,
      );
      assertEquals(
        repeated.filter((call) =>
          call.url.pathname === "/rest/v1/pricing_configs" &&
          call.method === "PATCH"
        ).length,
        0,
      );
      const savedMetadata = configs[0].metadata as Record<string, unknown>;
      assertEquals(savedMetadata.stripe_price_id_monthly, "price_pricing_1");
      assertEquals(savedMetadata.stripe_price_id_annual, "price_pricing_2");
    },
  );
});

Deno.test("P8 recovery reuses original catalog after metadata-save failure", async () => {
  const configs = [pricingConfig()];
  const options = { admin: true, configs, failDbPatch: true };
  await pricingFixture(options, async (response, body, calls, repeat) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals(
      (body.results as Array<Record<string, unknown>>)[0].error,
      "Failed to save Stripe pricing metadata: synthetic save failure",
    );
    assertEquals(
      Object.keys(configs[0].metadata),
      [],
      "failed durable write leaves original config without provider IDs",
    );
    const first = calls.slice();
    assertEquals(
      first.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      ).length,
      1,
    );
    assertEquals(
      first.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      ).length,
      2,
    );
    assertEquals(
      first.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids")
        .length,
      0,
    );
    options.failDbPatch = false;
    const retry = await repeat();
    assertEquals(retry.response.status, 200);
    assertEquals(
      (retry.result.summary as Record<string, unknown>).product_updated,
      1,
    );
    const retried = calls.slice(first.length);
    assertEquals(
      retried.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      ).length,
      0,
    );
    const created = retried.filter((call) =>
      call.url.pathname === "/v1/prices" && call.method === "POST"
    );
    assertEquals(created.length, 0);
    assertEquals(
      created.map((call) => call.form.get("transfer_lookup_key")),
      [],
    );
    assertEquals(created.map((call) => call.form.get("product")), []);
    assertEquals(
      retried.filter((call) =>
        call.url.pathname.startsWith("/v1/prices/price_pricing_") &&
        call.method === "POST"
      ).length,
      0,
    );
    const saved = configs[0].metadata as Record<string, unknown>;
    assertEquals(saved.stripe_product_id, "prod_pricing_1");
    assertEquals(saved.stripe_price_id_monthly, "price_pricing_1");
    assertEquals(saved.stripe_price_id_annual, "price_pricing_2");
    const save = retried.find((call) => call.method === "PATCH")!;
    const pro = retried.find((call) =>
      call.url.pathname === "/rest/v1/pro_product_ids"
    )!;
    assertEquals(JSON.parse(pro.body).product_id, "prod_pricing_1");
    assertEquals(retried.indexOf(save) < retried.indexOf(pro), true);
    const offset = calls.length;
    assertEquals(
      ((await repeat()).result.summary as Record<string, unknown>).no_change,
      1,
    );
    assertEquals(writes(calls.slice(offset)), []);
  });
});

Deno.test("pricing handler isolates a remote product failure and continues with the second config", async () => {
  const configs = [
    pricingConfig({ id: "cfg_remote_bad", key: "remote_bad" }),
    pricingConfig({
      id: "cfg_remote_good",
      key: "remote_good",
      module: "adhoc_charges",
      unit: "per_listing",
    }),
  ];
  await pricingFixture(
    { admin: true, configs, failProductOnce: true },
    (response, body, calls) => {
      assertEquals(response.status, 200);
      const results = body.results as Array<Record<string, unknown>>;
      assertEquals(results.map((result) => [result.id, result.action]), [[
        "cfg_remote_bad",
        "error",
      ], ["cfg_remote_good", "created"]]);
      assertEquals(
        String(results[0].error).includes("synthetic first-product failure"),
        true,
      );
      assertEquals((body.summary as Record<string, unknown>).errors, 1);
      assertEquals((body.summary as Record<string, unknown>).created, 1);
      const products = calls.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      );
      const price = calls.find((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      );
      const save = calls.find((call) =>
        call.url.pathname === "/rest/v1/pricing_configs" &&
        call.method === "PATCH"
      );
      assertEquals(products.length, 2);
      assertEquals(Boolean(price && save), true);
      assertEquals(calls.indexOf(products[1]) < calls.indexOf(price!), true);
      assertEquals(calls.indexOf(price!) < calls.indexOf(save!), true);
      assertEquals(save!.url.searchParams.get("id"), "eq.cfg_remote_good");
      assertEquals(
        calls.filter((call) =>
          call.url.pathname === "/rest/v1/pricing_configs" &&
          call.method === "PATCH"
        ).length,
        1,
      );
    },
  );
});

Deno.test("pricing handler rejects a mismatched Stripe account before remote catalog writes", async () => {
  await pricingFixture({
    admin: true,
    configs: [pricingConfig()],
    stripeAccount: "acct_wrong_pricing",
  }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/account" && call.method === "GET"
      ).length,
      1,
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/v1/products" ||
        call.url.pathname === "/v1/prices"
      ),
      false,
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/rest/v1/pricing_configs" &&
        call.method === "PATCH"
      ),
      false,
    );
  });
});

Deno.test("drift replaces existing currency despite unchanged saved amount", async () => {
  const metadata = {
    stripe_product_id: "prod_currency",
    stripe_price_id: "price_currency",
    stripe_last_amount: "19",
    stripe_last_label: "Pro",
    stripe_last_audience: "participant",
    stripe_tax_code: "txcd_10103000",
    stripe_tax_behavior: "exclusive",
  };
  const lookup = "maiprop_featured_listing";
  await pricingFixture({
    admin: true,
    configs: [
      pricingConfig({
        key: "featured_listing",
        module: "adhoc_charges",
        unit: "per_listing",
        currency: "USD",
        metadata,
      }),
    ],
    lookupPrices: {
      [lookup]: {
        id: "price_currency",
        active: true,
        product: "prod_currency",
        currency: "eur",
        unit_amount: 1900,
        recurring: null,
        tax_behavior: "exclusive",
      },
    },
  }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "GET"
      ).length,
      1,
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/v1/prices" && call.method === "POST"
      ),
      true,
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/rest/v1/pricing_configs" &&
        call.method === "PATCH"
      ),
      true,
    );
    assertEquals(metadata.stripe_price_id, "price_currency");
  });
});

const savedOneTime = (id = "price_old") => ({
  stripe_product_id: "prod_existing",
  stripe_price_id: id,
  stripe_last_amount: "19",
  stripe_last_label: "Pro",
  stripe_last_audience: "participant",
  stripe_tax_code: "txcd_10103000",
  stripe_tax_behavior: "exclusive",
});
const canonical = (overrides: Record<string, unknown> = {}) => ({
  id: "price_old",
  active: true,
  product: "prod_existing",
  currency: "eur",
  unit_amount: 1900,
  recurring: null,
  tax_behavior: "exclusive",
  metadata: { pricing_config_id: "cfg_pro" },
  ...overrides,
});
const oneTime = (overrides: Record<string, unknown> = {}) =>
  pricingConfig({
    key: "featured_listing",
    module: "adhoc_charges",
    unit: "per_listing",
    metadata: savedOneTime(),
    ...overrides,
  });
const writes = (calls: PricingCall[]) =>
  calls.filter((call) =>
    call.url.hostname === "api.stripe.com" && call.method === "POST" ||
    call.method === "PATCH"
  );
const createdPrices = (calls: PricingCall[]) =>
  calls.filter((call) =>
    call.url.pathname === "/v1/prices" && call.method === "POST"
  );

Deno.test("drift canonical attributes replace owned prices and repeat without writes", async () => {
  for (
    const drift of [
      { unit_amount: 1800 },
      { recurring: { interval: "month" } },
      { tax_behavior: "inclusive" },
    ]
  ) {
    const configs = [oneTime()];
    await pricingFixture({
      admin: true,
      configs,
      lookupPrices: { maiprop_featured_listing: canonical(drift) },
    }, async (_response, body, calls, repeat) => {
      assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
      assertEquals(createdPrices(calls).length, 1);
      assertEquals(
        calls.some((call) =>
          call.method === "GET" && call.url.pathname === "/v1/prices/price_old"
        ),
        false,
      );
      assertEquals(
        calls.filter((call) =>
          call.method === "POST" && call.url.pathname === "/v1/prices/price_old"
        ).length,
        1,
      );
      const offset = calls.length;
      assertEquals(
        ((await repeat()).result.summary as Record<string, unknown>).no_change,
        1,
      );
      assertEquals(writes(calls.slice(offset)), []);
    });
  }
});

Deno.test("drift recorded no-lookup identity handles matching inactive missing foreign and failed retrieval", async () => {
  for (
    const scenario of ["matching", "inactive", "missing", "foreign", "failure"]
  ) {
    await pricingFixture({
      admin: true,
      configs: [oneTime()],
      prices: scenario === "missing" ? {} : {
        price_old: canonical({
          metadata: {},
          ...(scenario === "inactive" ? { active: false } : {}),
          ...(scenario === "foreign" ? { product: "prod_foreign" } : {}),
        }),
      },
      failPath: scenario === "failure" ? "/v1/prices/price_old" : undefined,
    }, (_response, body, calls) => {
      const expected = scenario === "failure"
        ? "errors"
        : scenario === "matching"
        ? "no_change"
        : "price_updated";
      assertEquals((body.summary as Record<string, unknown>)[expected], 1);
      assertEquals(
        createdPrices(calls).length,
        ["matching", "failure"].includes(scenario) ? 0 : 1,
      );
      assertEquals(
        calls.some((call) =>
          call.url.pathname === "/v1/prices/price_old" && call.method === "POST"
        ),
        false,
      );
      if (scenario === "failure") assertEquals(writes(calls), []);
    });
  }
});

Deno.test("drift stale local ID reuses canonical lookup and foreign lookup rejects before mutations", async () => {
  for (const foreign of [false, true]) {
    await pricingFixture({
      admin: true,
      configs: [oneTime()],
      lookupPrices: {
        maiprop_featured_listing: canonical({
          id: "price_current",
          ...(foreign ? { product: "prod_foreign" } : {}),
        }),
      },
    }, (_response, body, calls) => {
      assertEquals(
        (body.summary as Record<string, unknown>)[
          foreign ? "errors" : "product_updated"
        ],
        1,
      );
      assertEquals(createdPrices(calls), []);
      if (foreign) assertEquals(writes(calls), []);
      else {
        const patch = calls.find((call) => call.method === "PATCH")!;
        assertEquals(
          JSON.parse(patch.body).metadata.stripe_price_id,
          "price_current",
        );
        assertEquals(
          calls.some((call) => call.url.pathname === "/v1/prices/price_old"),
          false,
        );
      }
    });
  }
});

Deno.test("recovery identity preflight rejects ambiguity across both cycles before any mutation", async () => {
  for (
    const scenario of [
      "missing_identity",
      "foreign_product",
      "foreign_price",
      "split_products",
      "inactive",
      "missing_product",
      "retrieve_failure",
      "lookup_failure",
    ]
  ) {
    const products = {
      prod_existing: {
        id: "prod_existing",
        active: scenario !== "inactive",
        metadata: scenario === "missing_identity" ? {} : {
          pricing_config_id: scenario === "foreign_product"
            ? "cfg_foreign"
            : "cfg_pro",
        },
      },
    };
    await pricingFixture({
      admin: true,
      configs: [pricingConfig()],
      products: scenario === "missing_product" ? {} : products,
      lookupPrices: {
        maiprop_pro_monthly: canonical({ recurring: { interval: "month" } }),
        maiprop_pro_annual: canonical({
          id: "price_annual",
          unit_amount: 19000,
          recurring: { interval: "year" },
          product: scenario === "split_products"
            ? "prod_other"
            : "prod_existing",
          metadata: {
            pricing_config_id: scenario === "foreign_price"
              ? "cfg_foreign"
              : "cfg_pro",
          },
        }),
      },
      failPath: scenario === "retrieve_failure"
        ? "/v1/products/prod_existing"
        : scenario === "lookup_failure"
        ? "/v1/prices"
        : undefined,
    }, (_response, body, calls) => {
      assertEquals(
        (body.summary as Record<string, unknown>).errors,
        1,
        scenario,
      );
      assertEquals(writes(calls), [], scenario);
    });
  }
});

Deno.test("recovery annual-only and legacy price identity use positively identified product", async () => {
  for (const annualOnly of [false, true]) {
    const configs = [pricingConfig()];
    await pricingFixture({
      admin: true,
      configs,
      products: {
        prod_existing: {
          id: "prod_existing",
          active: true,
          metadata: { pricing_config_id: "cfg_pro" },
        },
      },
      lookupPrices: annualOnly
        ? {
          maiprop_pro_annual: canonical({
            id: "price_annual",
            metadata: {},
            unit_amount: 19000,
            recurring: { interval: "year" },
          }),
        }
        : {
          maiprop_pro_monthly: canonical({
            metadata: {},
            recurring: { interval: "month" },
          }),
        },
    }, (_response, body, calls) => {
      assertEquals((body.summary as Record<string, unknown>).errors, 0);
      assertEquals(
        calls.filter((call) =>
          call.url.pathname === "/v1/products" && call.method === "POST"
        ),
        [],
      );
      assertEquals(
        createdPrices(calls).map((call) =>
          call.form.get("recurring[interval]")
        ),
        [annualOnly ? "month" : "year"],
      );
      assertEquals(
        (configs[0].metadata as Record<string, unknown>).stripe_product_id,
        "prod_existing",
      );
      const firstWrite = calls.findIndex((call) => writes([call]).length > 0);
      const lookups = calls.filter((call) =>
        call.url.pathname === "/v1/prices" && call.method === "GET"
      );
      assertEquals(lookups.length, 2);
      assertEquals(
        lookups.every((call) => calls.indexOf(call) < firstWrite),
        true,
      );
    });
  }
});

Deno.test("drift overlap never archives monthly canonical shared by stale annual aliases", async () => {
  const configs = [
    pricingConfig({
      metadata: {
        ...savedOneTime(),
        stripe_price_id_monthly: "price_old",
        stripe_price_id_annual: "price_old",
      },
    }),
  ];
  await pricingFixture({
    admin: true,
    configs,
    lookupPrices: {
      maiprop_pro_monthly: canonical({ recurring: { interval: "month" } }),
    },
  }, (_response, body, calls) => {
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    assertEquals(
      createdPrices(calls).map((call) => call.form.get("recurring[interval]")),
      ["year"],
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/v1/prices/price_old" && call.method === "POST"
      ),
      false,
    );
    assertEquals(
      (configs[0].metadata as Record<string, unknown>).stripe_price_id_monthly,
      "price_old",
    );
  });
});

Deno.test("drift annual retrieval failure preflights before primary replacement", async () => {
  await pricingFixture({
    admin: true,
    configs: [
      pricingConfig({
        currency: "USD",
        metadata: { ...savedOneTime(), stripe_price_id_annual: "price_annual" },
      }),
    ],
    lookupPrices: {
      maiprop_pro_monthly: canonical({ recurring: { interval: "month" } }),
    },
    failPath: "/v1/prices/price_annual",
  }, (_response, body, calls) => {
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals(writes(calls), []);
  });
});

Deno.test("drift monthly and annual currency replacement saves distinct aliases and repeats", async () => {
  const configs = [
    pricingConfig({
      currency: "USD",
      metadata: {
        ...savedOneTime("price_monthly"),
        stripe_price_id_monthly: "price_monthly",
        stripe_price_id_annual: "price_annual",
      },
    }),
  ];
  await pricingFixture({
    admin: true,
    configs,
    lookupPrices: {
      maiprop_pro_monthly: canonical({
        id: "price_monthly",
        recurring: { interval: "month" },
      }),
      maiprop_pro_annual: canonical({
        id: "price_annual",
        unit_amount: 19000,
        recurring: { interval: "year" },
      }),
    },
  }, async (_response, body, calls, repeat) => {
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    const created = createdPrices(calls);
    assertEquals(
      created.map((
        call,
      ) => [
        call.form.get("currency"),
        call.form.get("lookup_key"),
        call.form.get("transfer_lookup_key"),
      ]),
      [["usd", "maiprop_pro_monthly", "true"], [
        "usd",
        "maiprop_pro_annual",
        "true",
      ]],
    );
    const archives = calls.filter((call) =>
      call.form.get("active") === "false"
    );
    assertEquals(archives.map((call) => call.url.pathname), [
      "/v1/prices/price_monthly",
      "/v1/prices/price_annual",
    ]);
    assertEquals(
      archives.every((call) => calls.indexOf(call) > calls.indexOf(created[1])),
      true,
    );
    const metadata = configs[0].metadata as Record<string, unknown>;
    assertEquals([
      metadata.stripe_price_id,
      metadata.stripe_price_id_monthly,
      metadata.stripe_monthly_price_id,
    ], ["price_pricing_1", "price_pricing_1", "price_pricing_1"]);
    assertEquals([
      metadata.stripe_price_id_annual,
      metadata.stripe_annual_price_id,
      metadata.stripe_price_id_yearly,
      metadata.stripe_yearly_price_id,
    ], Array(4).fill("price_pricing_2"));
    const offset = calls.length;
    assertEquals(
      ((await repeat()).result.summary as Record<string, unknown>).no_change,
      1,
    );
    assertEquals(writes(calls.slice(offset)), []);
  });
});

Deno.test("recovery repeated save failure preserves one catalog until successful publication", async () => {
  const configs = [pricingConfig()];
  const options = { admin: true, configs, failDbPatch: true };
  await pricingFixture(options, async (_response, body, calls, repeat) => {
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals(
      ((await repeat()).result.summary as Record<string, unknown>).errors,
      1,
    );
    assertEquals(configs[0].metadata, {});
    options.failDbPatch = false;
    assertEquals(
      ((await repeat()).result.summary as Record<string, unknown>)
        .product_updated,
      1,
    );
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      ).length,
      1,
    );
    assertEquals(createdPrices(calls).length, 2);
    assertEquals(
      (configs[0].metadata as Record<string, unknown>).stripe_product_id,
      "prod_pricing_1",
    );
    assertEquals(
      calls.filter((call) => call.url.pathname === "/rest/v1/pro_product_ids")
        .length,
      1,
    );
  });
});

Deno.test("recovery partial annual failure creates only missing annual on retry", async () => {
  const configs = [pricingConfig()];
  await pricingFixture(
    { admin: true, configs, failAnnualOnce: true },
    async (_response, body, calls, repeat) => {
      assertEquals((body.summary as Record<string, unknown>).errors, 1);
      assertEquals(configs[0].metadata, {});
      const offset = calls.length;
      assertEquals(
        ((await repeat()).result.summary as Record<string, unknown>).created,
        1,
      );
      const retry = calls.slice(offset);
      assertEquals(
        retry.filter((call) =>
          call.url.pathname === "/v1/products" && call.method === "POST"
        ),
        [],
      );
      assertEquals(
        createdPrices(retry).map((call) => call.form.get("lookup_key")),
        ["maiprop_pro_annual"],
      );
      assertEquals(
        (configs[0].metadata as Record<string, unknown>)
          .stripe_price_id_monthly,
        "price_pricing_1",
      );
      assertEquals(
        (configs[0].metadata as Record<string, unknown>).stripe_price_id_annual,
        "price_pricing_2",
      );
    },
  );
});

Deno.test("recovery residual no lookup after first price failure still permits second product", async () => {
  await pricingFixture({
    admin: true,
    configs: [pricingConfig()],
    failPriceOnce: true,
  }, async (_response, body, calls, repeat) => {
    assertEquals((body.summary as Record<string, unknown>).errors, 1);
    assertEquals(
      ((await repeat()).result.summary as Record<string, unknown>).created,
      1,
    );
    assertEquals(
      calls.filter((call) =>
        call.url.pathname === "/v1/products" && call.method === "POST"
      ).length,
      2,
    );
  });
});

Deno.test("recovery companion drift replaces only owned annual while retaining product and primary", async () => {
  const configs = [pricingConfig()];
  await pricingFixture({
    admin: true,
    configs,
    products: {
      prod_existing: {
        id: "prod_existing",
        active: true,
        metadata: { pricing_config_id: "cfg_pro" },
      },
    },
    lookupPrices: {
      maiprop_pro_monthly: canonical({ recurring: { interval: "month" } }),
      maiprop_pro_annual: canonical({
        id: "price_annual",
        currency: "usd",
        recurring: { interval: "year" },
        unit_amount: 19000,
      }),
    },
  }, (_response, body, calls) => {
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    assertEquals(
      createdPrices(calls).map((call) => call.form.get("lookup_key")),
      ["maiprop_pro_annual"],
    );
    assertEquals(
      calls.filter((call) => call.form.get("active") === "false").map((call) =>
        call.url.pathname
      ),
      ["/v1/prices/price_annual"],
    );
    assertEquals(
      (configs[0].metadata as Record<string, unknown>).stripe_product_id,
      "prod_existing",
    );
    assertEquals(
      (configs[0].metadata as Record<string, unknown>).stripe_price_id_monthly,
      "price_old",
    );
  });
});

Deno.test("drift differing owned recorded and lookup IDs archive each once after replacement", async () => {
  await pricingFixture({
    admin: true,
    configs: [oneTime({ currency: "USD" })],
    prices: { price_old: canonical({ metadata: {} }) },
    lookupPrices: {
      maiprop_featured_listing: canonical({ id: "price_lookup" }),
    },
  }, (_response, body, calls) => {
    assertEquals((body.summary as Record<string, unknown>).price_updated, 1);
    const create = createdPrices(calls)[0];
    const retrieve = calls.find((call) =>
      call.url.pathname === "/v1/prices/price_old" && call.method === "GET"
    )!;
    assertEquals(calls.indexOf(retrieve) < calls.indexOf(create), true);
    const archives = calls.filter((call) =>
      call.form.get("active") === "false"
    );
    assertEquals(archives.map((call) => call.url.pathname).sort(), [
      "/v1/prices/price_lookup",
      "/v1/prices/price_old",
    ]);
    assertEquals(
      archives.every((call) => calls.indexOf(call) > calls.indexOf(create)),
      true,
    );
  });
});

Deno.test("recovery ownership rejection isolates later config", async () => {
  await pricingFixture({
    admin: true,
    configs: [pricingConfig(), oneTime({ id: "cfg_later", metadata: {} })],
    products: {
      prod_existing: { id: "prod_existing", active: true, metadata: {} },
    },
    lookupPrices: {
      maiprop_pro_monthly: canonical({ recurring: { interval: "month" } }),
    },
  }, (_response, body, calls) => {
    assertEquals(
      (body.results as Array<Record<string, unknown>>).map((
        result,
      ) => [result.id, result.action]),
      [["cfg_pro", "error"], ["cfg_later", "created"]],
    );
    assertEquals(
      calls.filter((call) => call.method === "PATCH").map((call) =>
        call.url.searchParams.get("id")
      ),
      ["eq.cfg_later"],
    );
    assertEquals(
      calls.some((call) =>
        call.url.pathname === "/v1/products/prod_existing" &&
        call.method === "POST"
      ),
      false,
    );
  });
});
