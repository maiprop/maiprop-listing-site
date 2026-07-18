import { describe, expect, it } from "vitest";
import { mapPricingConfigRows } from "@/hooks/usePricingConfigs";

describe("pricing catalog mapping", () => {
  it("preserves audience and resolves monthly and annual Price mappings", () => {
    const configs = mapPricingConfigRows([
      {
        key: "agent_basic",
        audience: "agent",
        label: "Agent Pro",
        description: "Agent plan",
        amount: 149,
        currency: "EUR",
        unit: "monthly",
        metadata: {
          stripe_price_id: "price_legacy_month",
          stripe_price_id_monthly: "price_agent_month",
          stripe_monthly_price_id: "price_agent_month_alias",
          stripe_price_id_annual: "price_agent_year",
          stripe_annual_price_id: "price_agent_year_alias",
          stripe_product_id: "prod_agent",
          stripe_last_amount_annual: "1490",
        },
      },
    ]);

    expect(configs.agent_basic).toMatchObject({
      audience: "agent",
      stripePriceMonthly: "price_agent_month",
      stripePriceAnnual: "price_agent_year",
      stripeProductId: "prod_agent",
      annualAmount: 1490,
    });
  });

  it("does not invent a selected-cycle Price mapping", () => {
    const configs = mapPricingConfigRows([
      {
        key: "professional_basic",
        audience: "professional",
        label: "Professional Pro",
        description: null,
        amount: 69,
        currency: "EUR",
        unit: "monthly",
        metadata: { stripe_price_id_monthly: "price_professional_month" },
      },
    ]);

    expect(configs.professional_basic.stripePriceMonthly).toBe("price_professional_month");
    expect(configs.professional_basic.stripePriceAnnual).toBeUndefined();
  });
});
