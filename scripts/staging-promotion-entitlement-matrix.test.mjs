import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "staging-promotion-entitlement-matrix.mjs"),
  "utf8",
);

describe("staging promotion durable subscription fixtures", () => {
  it("requires the staging service secret and never uses it as a bearer token", () => {
    expect(source).toContain(
      'const SERVICE_ROLE_KEY = required("STAGING_SUPABASE_SERVICE_ROLE_KEY")',
    );
    expect(source).toContain("apikey: SERVICE_ROLE_KEY");
    expect(source).not.toContain("Authorization: `Bearer ${SERVICE_ROLE_KEY}`");
  });

  it("seeds canonical pricing dependencies and matching active test subscriptions", () => {
    expect(source).toContain('planKey: "developer_pro"');
    expect(source).toContain('audience: "developer"');
    expect(source).toContain('planKey: "agent_basic"');
    expect(source).toContain('audience: "agent"');
    expect(source).toContain('runtime_mode: "test"');
    expect(source).toContain("livemode: false");
    expect(source).toContain('status: "active"');
    expect(source).toContain("current_period_end: periodEnd");
    expect(source).toContain("developerA: globalThis.crypto.randomUUID()");
    expect(source).toContain("developerB: globalThis.crypto.randomUUID()");
    expect(source).toContain("async function ensurePricingConfigFixtures");
    expect(source).toContain("pricing_configs?on_conflict=key");
    expect(source).toContain("resolution=ignore-duplicates,return=representation");
    expect(source).toContain("insertedPricingConfigIds.add(inserted[0].id)");
    expect(source).toContain("stripe_product_id: pricing.stripeProductId");
    expect(source).toContain("stripe_price_id: pricing.stripePriceId");
  });

  it("preallocates fixture IDs and deletes only those IDs even after partial setup", () => {
    expect(source).toContain("developerA: globalThis.crypto.randomUUID()");
    expect(source).toContain("developerB: globalThis.crypto.randomUUID()");
    expect(source).toContain("async function cleanupBillingSubscriptionFixtures");
    expect(source).toContain("async function cleanupPricingConfigFixtures");
    expect(source).toContain(
      'id=in.(${Object.values(billingSubscriptionIds).join(",")})',
    );
    expect(source).toMatch(/finally \{[\s\S]*?await cleanup\(\)/);
    expect(source).not.toMatch(/billing_subscriptions[^\n]*user_id=eq/);
    expect(source).toContain("const insertedPricingConfigIds = new Set()");
    expect(source).toContain('id=in.(${[...insertedPricingConfigIds].join(",")})');
  });

  it("cleans dependent subscriptions before owned pricing rows", () => {
    const subscriptionCleanup = source.indexOf(
      "await cleanupBillingSubscriptionFixtures()",
    );
    const pricingCleanup = source.indexOf("await cleanupPricingConfigFixtures()");
    expect(subscriptionCleanup).toBeGreaterThan(-1);
    expect(pricingCleanup).toBeGreaterThan(subscriptionCleanup);
  });

  it("preserves durable-fixture evidence alongside the existing balance proof", () => {
    expect(source).toContain("durable billing subscription fixtures are active and runtime-scoped");
    expect(source).toContain("canonical paid Developer Pro grants exactly one Spotlight and one Priority");
    expect(source).toContain('billing_subscription_fixtures: "deleted"');
  });
});
