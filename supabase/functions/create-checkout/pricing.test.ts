import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCheckoutPlan } from "./pricing.ts";
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
    if (previous === undefined) Deno.env.delete("STRIPE_PRICE_DEVELOPER_MONTHLY");
    else Deno.env.set("STRIPE_PRICE_DEVELOPER_MONTHLY", previous);
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
