import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCheckoutAddon, getCheckoutPlan } from "./pricing.ts";
import type { PricingConfigRow } from "./types.ts";

const pricingClient = (row: PricingConfigRow | null) => ({
  from(table: string) {
    assertEquals(table, "pricing_configs");
    return {
      select(_columns: string) {
        return this;
      },
      eq(_column: string, _value: unknown) {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: row });
      },
    };
  },
});

Deno.test("getCheckoutPlan resolves annual and monthly DB price IDs distinctly", async () => {
  const row: PricingConfigRow = {
    key: "pro",
    audience: "participant",
    module: "user_subscription",
    unit: "monthly",
    label: "Participant Pro",
    metadata: {
      stripe_price_id: "price_month_legacy",
      stripe_price_id_monthly: "price_month",
      stripe_monthly_price_id: "price_month_alias",
      stripe_price_id_annual: "price_year",
      stripe_annual_price_id: "price_year_alias",
      stripe_product_id: "prod_participant",
    },
  };

  const annual = await getCheckoutPlan(pricingClient(row), "pro", "annual");
  assertEquals(annual, {
    priceId: "price_year",
    planKey: "pro",
    audience: "participant",
    role: "participant",
    billingCycle: "annual",
    productId: "prod_participant",
  });

  const monthly = await getCheckoutPlan(pricingClient(row), "pro", "monthly");
  assertEquals(monthly?.priceId, "price_month");
  assertEquals(monthly?.billingCycle, "monthly");
});

Deno.test("getCheckoutPlan refuses DB price IDs for the wrong pricing audience", async () => {
  const row: PricingConfigRow = {
    key: "developer_pro",
    audience: "participant",
    module: "developer_subscription",
    unit: "monthly",
    metadata: {
      stripe_price_id_monthly: "price_wrong_audience",
      stripe_product_id: "prod_wrong",
    },
  };

  const previous = Deno.env.get("STRIPE_PRICE_DEVELOPER_MONTHLY");
  try {
    Deno.env.delete("STRIPE_PRICE_DEVELOPER_MONTHLY");
    const plan = await getCheckoutPlan(
      pricingClient(row),
      "developer_pro",
      "monthly",
    );
    assertEquals(plan, null);
  } finally {
    if (previous === undefined) {
      Deno.env.delete("STRIPE_PRICE_DEVELOPER_MONTHLY");
    } else Deno.env.set("STRIPE_PRICE_DEVELOPER_MONTHLY", previous);
  }
});

Deno.test("getCheckoutPlan fails closed when the active plan config is missing", async () => {
  const previous = Deno.env.get("STRIPE_PRICE_PRO_MONTHLY");
  try {
    Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_env_fallback");
    const plan = await getCheckoutPlan(
      pricingClient(null),
      "pro",
      "monthly",
    );
    assertEquals(plan, null);
  } finally {
    if (previous === undefined) Deno.env.delete("STRIPE_PRICE_PRO_MONTHLY");
    else Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", previous);
  }
});

Deno.test("getCheckoutPlan fails closed when an active plan lacks the requested price", async () => {
  const previous = Deno.env.get("STRIPE_PRICE_PRO_ANNUAL");
  try {
    Deno.env.set("STRIPE_PRICE_PRO_ANNUAL", "price_env_fallback");
    const plan = await getCheckoutPlan(
      pricingClient({
        key: "pro",
        audience: "participant",
        module: "user_subscription",
        unit: "monthly",
        metadata: { stripe_price_id_monthly: "price_month" },
      }),
      "pro",
      "annual",
    );
    assertEquals(plan, null);
  } finally {
    if (previous === undefined) Deno.env.delete("STRIPE_PRICE_PRO_ANNUAL");
    else Deno.env.set("STRIPE_PRICE_PRO_ANNUAL", previous);
  }
});

Deno.test("promotion add-ons resolve exact server-owned EUR prices and credit metadata", async () => {
  const cases = [
    ["featured_listing", 39, 3_900],
    ["priority_placement", 59, 5_900],
    ["featured_priority_bundle", 79, 7_900],
  ] as const;

  for (const [addonKey, amount, amountMinor] of cases) {
    const row = {
      key: addonKey,
      audience: "participant",
      module: "adhoc_charges",
      unit: "per_listing",
      label: addonKey,
      amount,
      currency: "EUR",
      metadata: {
        stripe_price_id: `price_server_${addonKey}`,
        stripe_product_id: `prod_server_${addonKey}`,
      },
    } as unknown as PricingConfigRow;

    const addon = await getCheckoutAddon(pricingClient(row), addonKey);
    assertEquals(addon as unknown, {
      priceId: `price_server_${addonKey}`,
      addonKey,
      audience: "participant",
      module: "adhoc_charges",
      unit: "per_listing",
      checkoutMode: "payment",
      label: addonKey,
      productId: `prod_server_${addonKey}`,
      amountMinor,
      currency: "eur",
      creditsPerUnit: 1,
      entitlementDays: 30,
    });
  }
});

Deno.test("promotion add-ons fail closed when server pricing drifts from the catalog", async () => {
  const wrongAmount = {
    key: "featured_listing",
    audience: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    amount: 1,
    currency: "EUR",
    metadata: { stripe_price_id: "price_wrong_amount" },
  } as unknown as PricingConfigRow;

  assertEquals(
    await getCheckoutAddon(pricingClient(wrongAmount), "featured_listing"),
    null,
  );
});

Deno.test("Stripe promotion prices must match the server catalog and runtime", async () => {
  const pricingModule = await import("./pricing.ts");
  const assertStripePriceMatchesCheckoutAddon = (
    pricingModule as unknown as {
      assertStripePriceMatchesCheckoutAddon?: (
        addon: unknown,
        price: unknown,
        runtimeMode: "test" | "live",
      ) => void;
    }
  ).assertStripePriceMatchesCheckoutAddon;
  assertEquals(typeof assertStripePriceMatchesCheckoutAddon, "function");

  const addon = await getCheckoutAddon(
    pricingClient({
      key: "featured_listing",
      audience: "participant",
      module: "adhoc_charges",
      unit: "per_listing",
      label: "Featured Listing",
      amount: 39,
      currency: "EUR",
      metadata: {
        stripe_price_id: "price_featured_test",
        stripe_product_id: "prod_featured",
      },
    } as unknown as PricingConfigRow),
    "featured_listing",
  );

  const validPrice = {
    id: "price_featured_test",
    active: true,
    livemode: false,
    currency: "eur",
    unit_amount: 3_900,
    product: "prod_featured",
  };
  assertStripePriceMatchesCheckoutAddon!(addon, validPrice, "test");
  assertThrows(() =>
    assertStripePriceMatchesCheckoutAddon!(
      addon,
      { ...validPrice, livemode: true },
      "test",
    )
  );
  assertThrows(() =>
    assertStripePriceMatchesCheckoutAddon!(
      addon,
      { ...validPrice, unit_amount: 100 },
      "test",
    )
  );
  assertThrows(() =>
    assertStripePriceMatchesCheckoutAddon!(
      addon,
      { ...validPrice, product: "prod_client_supplied" },
      "test",
    )
  );
});

Deno.test("checkout resolves the active billing runtime from the server", async () => {
  const pricingModule = await import("./pricing.ts");
  const getCurrentBillingRuntimeMode = (
    pricingModule as unknown as {
      getCurrentBillingRuntimeMode?: (
        client: unknown,
      ) => Promise<"test" | "live">;
    }
  ).getCurrentBillingRuntimeMode;

  assertEquals(typeof getCurrentBillingRuntimeMode, "function");
  if (!getCurrentBillingRuntimeMode) return;

  const mode = await getCurrentBillingRuntimeMode({
    rpc(name: string) {
      assertEquals(name, "current_billing_runtime_mode");
      return Promise.resolve({ data: "live", error: null });
    },
  });
  assertEquals(mode, "live");
});
