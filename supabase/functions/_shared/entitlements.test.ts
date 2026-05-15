import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getProfilePricingAudience,
  isAudienceAllowed,
  pricingConfigMatchesStripeItem,
  resolveSubscriptionEntitlement,
} from "./entitlements.ts";

const fakeSupabase = (profile: unknown, pricingRows: unknown[]) => ({
  from(table: string) {
    const state = { table };
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({
          data: state.table === "profiles" ? profile : null,
          error: null,
        });
      },
      then(resolve: (value: unknown) => void) {
        resolve({
          data: state.table === "pricing_configs" ? pricingRows : [],
          error: null,
        });
      },
    };
    return builder;
  },
});

Deno.test("getProfilePricingAudience maps buyer and seller to participant", () => {
  assertEquals(
    getProfilePricingAudience({ role: "buyer", participant_type: "buyer" }),
    "participant",
  );
  assertEquals(
    getProfilePricingAudience({ role: "seller", participant_type: "seller" }),
    "participant",
  );
});

Deno.test("getProfilePricingAudience prefers explicit participant_type", () => {
  assertEquals(
    getProfilePricingAudience({
      role: "buyer",
      participant_type: "developer",
    }),
    "developer",
  );
});

Deno.test("isAudienceAllowed rejects mismatched role audiences", () => {
  assertEquals(isAudienceAllowed("developer", "developer"), true);
  assertEquals(isAudienceAllowed("participant", "developer"), false);
  assertEquals(isAudienceAllowed("investor", ["investor", "institutional"]), true);
});

Deno.test("pricingConfigMatchesStripeItem matches product and scoped prices", () => {
  const row = {
    key: "developer_pro",
    audience: "developer",
    metadata: {
      stripe_product_id: "prod_dev",
      stripe_price_id_monthly: "price_month",
      stripe_price_id_annual: "price_year",
    },
  };

  assertEquals(
    pricingConfigMatchesStripeItem(row, { productId: "prod_dev" }),
    true,
  );
  assertEquals(
    pricingConfigMatchesStripeItem(row, {
      productId: "other",
      priceId: "price_year",
    }),
    true,
  );
  assertEquals(
    pricingConfigMatchesStripeItem(row, {
      productId: "other",
      priceId: "price_other",
    }),
    false,
  );
});

Deno.test("resolveSubscriptionEntitlement rejects cross-audience products", async () => {
  const supabase = fakeSupabase(
    { role: "developer", participant_type: "developer" },
    [
      {
        key: "pro",
        audience: "participant",
        metadata: { stripe_product_id: "prod_participant" },
      },
      {
        key: "developer_pro",
        audience: "developer",
        metadata: { stripe_product_id: "prod_dev" },
      },
    ],
  );

  assertEquals(
    await resolveSubscriptionEntitlement(supabase, "user_123", {
      productId: "prod_participant",
    }),
    null,
  );
  assertEquals(
    await resolveSubscriptionEntitlement(supabase, "user_123", {
      productId: "prod_dev",
    }),
    {
      planKey: "developer_pro",
      audience: "developer",
      productId: "prod_dev",
    },
  );
});
