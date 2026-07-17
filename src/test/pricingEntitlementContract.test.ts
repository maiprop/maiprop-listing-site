import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getPlanLimits } from "@/hooks/usePlanLimits";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("pricing and entitlement contract", () => {
  it("keeps viewing limits aligned across UI, static limits, and server enforcement", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const viewingMigration = read(
      "supabase/migrations/20260707070000_audience_scoped_pro_entitlements.sql",
    );

    expect(getPlanLimits("buyer", "free").viewingsPerMonth).toBe(1);
    expect(getPlanLimits("buyer", "pro").viewingsPerMonth).toBe(10);
    expect(getPlanLimits("seller", "free").viewingsPerMonth).toBe(1);
    expect(getPlanLimits("seller", "pro").viewingsPerMonth).toBe(10);
    expect(getPlanLimits("agent", "free").viewingsPerMonth).toBe(3);
    expect(getPlanLimits("agent", "pro").viewingsPerMonth).toBe(10);

    expect(pricing).toContain(
      "Buyers and sellers: book 1 viewing/month; sellers host unlimited viewings",
    );
    expect(pricing).toContain(
      "10 booking requests/month each; sellers host unlimited viewings",
    );
    expect(pricing).not.toContain("sellers: unlimited viewings");
    expect(pricing).toContain("Up to 10 hosted listing viewings/month");
    expect(viewingMigration).toContain("THEN 10 ELSE 1 END");
    expect(viewingMigration).toContain("THEN 10 ELSE 3 END");
  });

  it("keeps core AI limits aligned across UI, plan helpers, and durable DB limits", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const quotaMigration = read(
      "supabase/migrations/20260707120000_set_core_ai_pro_quota_50.sql",
    );

    expect(getPlanLimits("buyer", "free").valuationsPerMonth).toBe(5);
    expect(getPlanLimits("buyer", "pro").valuationsPerMonth).toBe(50);
    expect(getPlanLimits("agent", "pro").valuationsPerMonth).toBe(50);
    expect(getPlanLimits("developer", "pro").valuationsPerMonth).toBe(50);
    expect(getPlanLimits("professional", "pro").valuationsPerMonth).toBe(50);
    expect(getPlanLimits("investor", "pro").valuationsPerMonth).toBe(50);
    expect(getPlanLimits("developer", "free").valuationsPerMonth).toBe(0);
    expect(getPlanLimits("investor", "free").valuationsPerMonth).toBe(0);
    expect(getPlanLimits("institutional", "free").valuationsPerMonth).toBe(0);

    expect(pricing).toContain("50/month per core AI feature");
    expect(quotaMigration).toContain("pro_monthly = 50");
    expect(quotaMigration).toContain("free_monthly <> 5 OR pro_monthly <> 50");
  });

  it("advertises the server-granted free AI allowance for agents and professionals", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const agentPricing = pricing.slice(
      pricing.indexOf("const AGENT_FREE_LIST"),
      pricing.indexOf("const DEVELOPER_PRO"),
    );
    const professionalPricing = pricing.slice(
      pricing.indexOf("const PROFESSIONAL_FREE_LIST"),
      pricing.indexOf("const INVESTOR_FEATURES"),
    );

    expect(agentPricing).toContain('"5 AI requests/month per core feature"');
    expect(agentPricing).toContain('free: "5/month per core AI feature"');
    expect(agentPricing).toContain("50/month per core AI feature");
    expect(agentPricing).toContain("unlimited property reports");

    expect(professionalPricing).toContain('"5 AI requests/month per core feature"');
    expect(professionalPricing).toContain('free: "5/month per core AI feature"');
    expect(professionalPricing).toContain("50/month per core AI feature");
  });

  it("documents the real durable subscription response instead of feature limits", () => {
    const apiDocs = read("src/lib/apiDocsData.ts");
    const subscriptionDocs = apiDocs.slice(
      apiDocs.indexOf('id: "check-subscription"'),
      apiDocs.indexOf('id: "documents"'),
    );

    expect(subscriptionDocs).toContain('method: "POST"');
    expect(subscriptionDocs).toContain('source: "billing_state"');
    expect(subscriptionDocs).toContain('plan_key: "pro"');
    expect(subscriptionDocs).toContain('sync_status: "synced"');
    expect(subscriptionDocs).not.toContain("features:");
    expect(subscriptionDocs).not.toContain("current_period_end");
  });

  it("states the exact Developer Pro monthly promotion allowance in both locales", () => {
    const dashboard = read("src/pages/Dashboard.tsx");
    const pricingMatrix = read("docs/PRICING_MATRIX.md");
    const english = read("src/locales/en.json");
    const greek = read("src/locales/el.json");

    expect(dashboard).toContain("1 Spotlight and 1 Priority Rank per month");
    expect(pricingMatrix).toContain(
      "1 Spotlight + 1 Priority included; extras from EUR 39 / EUR 59",
    );
    expect(english).toContain("1 Spotlight and 1 Priority Rank per month");
    expect(greek).toContain("1 Spotlight και 1 Priority Rank ανά μήνα");
  });

  it("states property-report allowances for every paid audience", () => {
    const pricing = read("src/pages/Pricing.tsx");

    expect(pricing).toContain('label: "Property reports"');
    expect(pricing).toContain('paid: "3/month included"');
    expect(pricing.match(/unlimited property reports/gi)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the Institutional subscription separate from the paid AVM API product", () => {
    const pricing = read("src/pages/Pricing.tsx");

    expect(pricing).not.toContain('label: "White-label API access (AVM + listings)"');
    expect(pricing).toContain('label: "Listings data integration support"');
    expect(pricing).toContain("AVM API is sold separately as a maiProp OS data product");
  });

  it("keeps paid participant and developer promotion allowances explicit", () => {
    const pricingMatrix = read("docs/PRICING_MATRIX.md");

    expect(getPlanLimits("seller", "pro").spotlightAds).toBe(1);
    expect(getPlanLimits("seller", "pro").priorityAds).toBe(0);
    expect(pricingMatrix).toContain("1 Seller Spotlight/month");

    expect(getPlanLimits("developer", "pro").spotlightAds).toBe(1);
    expect(getPlanLimits("developer", "pro").priorityAds).toBe(1);
    expect(pricingMatrix).toContain(
      "1 Spotlight + 1 Priority Rank promotion per month",
    );
  });

  it("describes the OS licence discount as a verified custom checkout", () => {
    const pricing = read("src/pages/Pricing.tsx");

    expect(pricing).toContain(
      "Contact sales to verify your OS licence and receive a custom checkout link.",
    );
    expect(pricing).not.toContain("Apply your OS licence key at checkout.");
  });

  it("retires the unfulfilled extra priority ad from catalog setup and runtime pricing", () => {
    const catalog = read("scripts/setup-stripe-catalog.mjs");
    const liveCatalogCheck = read("scripts/check-stripe-live-migration.mjs");
    const businessCatalogCheck = read("scripts/check-stripe-business-logic.mjs");
    const adminPricing = read("src/pages/AdminPricing.tsx");
    const usageAddons = read("src/hooks/useUsageAddons.ts");
    const pricingMatrix = read("docs/PRICING_MATRIX.md");
    const testCatalog = read("docs/STRIPE_TEST_CATALOG.md");
    const activeSetupCatalog = catalog.slice(
      catalog.indexOf("const CATALOG = ["),
      catalog.indexOf("function parseArgs"),
    );
    const activeLiveCatalog = liveCatalogCheck.slice(
      liveCatalogCheck.indexOf("const CATALOG = ["),
      liveCatalogCheck.indexOf("const RETIRED_CATALOG_KEYS"),
    );
    const activeBusinessCatalog = businessCatalogCheck.slice(
      businessCatalogCheck.indexOf("const EXPECTED_CATALOG = ["),
      businessCatalogCheck.indexOf("const EXPECTED_BY_KEY"),
    );
    const activeAdminSeed = adminPricing.slice(
      adminPricing.indexOf("const DEFAULT_SEED"),
      adminPricing.indexOf("function usePricingConfigs"),
    );
    const migration = read(
      "supabase/migrations/20260717083505_retire_unfulfilled_extra_priority_and_align_promotion_plan.sql",
    );

    expect(activeSetupCatalog).not.toContain('key: "extra_priority_ad"');
    expect(catalog).toContain("RETIRED_CATALOG_KEYS");
    expect(catalog).toContain('"extra_priority_ad"');
    expect(catalog).toContain("is_active = false");
    expect(activeLiveCatalog).not.toContain('["extra_priority_ad"');
    expect(liveCatalogCheck).toContain("RETIRED_CATALOG_KEYS");
    expect(activeBusinessCatalog).not.toContain('key: "extra_priority_ad"');
    expect(businessCatalogCheck).toContain("RETIRED_CATALOG_KEYS");
    expect(activeAdminSeed).not.toContain('key: "extra_priority_ad"');
    expect(usageAddons).not.toContain("PROFESSIONAL_PRIORITY_AD_EXTRA_COST");
    expect(pricingMatrix).not.toContain("| `extra_priority_ad` |");
    expect(testCatalog).not.toContain("`extra_priority_ad`");
    expect(migration).toContain("WHERE key = 'extra_priority_ad'");
    expect(migration).toContain("is_active = false");
  });

  it("grants promotion allowances only from canonical active pricing products", () => {
    const migration = read(
      "supabase/migrations/20260717083505_retire_unfulfilled_extra_priority_and_align_promotion_plan.sql",
    );
    const runtimeTest = read(
      "supabase/tests/promotion_entitlement_runtime_test.sql",
    );

    expect(migration).toContain("JOIN public.pricing_configs AS pricing");
    expect(migration).toContain("pricing.is_active = true");
    expect(migration).toContain("pricing.key = subscription.plan_key");
    expect(migration).toContain(
      "pricing.metadata->>'stripe_product_id' = subscription.stripe_product_id",
    );
    expect(migration).toContain(
      "subscription.livemode = (public.current_billing_runtime_mode() = 'live')",
    );
    expect(migration).toContain(
      "private.authoritative_role(p_user_id)::text = 'seller'",
    );
    expect(migration).toContain("subscription.plan_key = 'pro'");
    expect(migration).toContain(
      "private.authoritative_role(p_user_id)::text = 'agent'",
    );
    expect(migration).toContain("subscription.plan_key = 'agent_basic'");
    expect(migration).toContain(
      "private.authoritative_role(p_user_id)::text = 'developer'",
    );
    expect(migration).toContain("subscription.plan_key = 'developer_pro'");
    expect(migration).toContain("WHEN 'seller' THEN 1");
    expect(migration).toContain("WHEN 'agent' THEN 10");
    expect(migration.match(/WHEN 'developer' THEN 1/g)).toHaveLength(2);
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)",
    );
    expect(migration).not.toContain("profile.subscription_product_id IS NULL");
    for (const productId of [
      "prod_seller_pro",
      "prod_agent_pro",
      "prod_developer_pro",
    ]) {
      expect(runtimeTest).toContain(
        `jsonb_build_object('stripe_product_id', '${productId}')`,
      );
    }
  });
});
