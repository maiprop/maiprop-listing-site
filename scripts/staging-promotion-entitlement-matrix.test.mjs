import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "staging-promotion-entitlement-matrix.mjs"),
  "utf8",
);
const openHouseGuardMigration = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/20260719061629_report_promotion_campaign_truth_and_block_open_houses.sql",
  ),
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
    expect(source).toContain("async function cleanupPromotionAllocationFixtures");
    expect(source).toContain("async function cleanupPricingConfigFixtures");
    expect(source).toContain(
      'id=in.(${Object.values(billingSubscriptionIds).join(",")})',
    );
    expect(source).toMatch(/finally \{[\s\S]*?await cleanup\(\)/);
    expect(source).not.toMatch(/billing_subscriptions[^\n]*user_id=eq/);
    expect(source).toContain("const insertedPricingConfigIds = new Set()");
    expect(source).toContain('id=in.(${[...insertedPricingConfigIds].join(",")})');
    expect(source).toContain(
      'billing_subscription_id: `in.(${Object.values(billingSubscriptionIds).join(",")})`',
    );
    expect(source).toContain('request_key: `like.${REQUEST_PREFIX}*`');
    expect(source).toContain("!expectedSubscriptionIds.has(row.billing_subscription_id)");
    expect(source).toContain("!row.request_key?.startsWith(REQUEST_PREFIX)");
    expect(source).toContain('allocationFilter("id")');
  });

  it("cleans owned allocations before subscriptions and owned pricing rows", () => {
    const allocationCleanup = source.indexOf(
      "await cleanupPromotionAllocationFixtures()",
    );
    const subscriptionCleanup = source.indexOf(
      "await cleanupBillingSubscriptionFixtures()",
    );
    const pricingCleanup = source.indexOf("await cleanupPricingConfigFixtures()");
    expect(allocationCleanup).toBeGreaterThan(-1);
    expect(subscriptionCleanup).toBeGreaterThan(allocationCleanup);
    expect(pricingCleanup).toBeGreaterThan(subscriptionCleanup);
  });

  it("preserves durable-fixture evidence alongside the existing balance proof", () => {
    expect(source).toContain("durable billing subscription fixtures are active and runtime-scoped");
    expect(source).toContain("canonical paid Developer Pro grants exactly one Spotlight and one Priority");
    expect(source).toContain('billing_subscription_fixtures: "deleted"');
  });

  it("treats monthly audit-ledger usage as a baseline and fails closed", () => {
    expect(source).toContain("function assertEntitlementBalance");
    expect(source).toContain("Number.isInteger(actual.used)");
    expect(source).toContain("Math.max(actual.included - actual.used, 0)");
    expect(source).toContain("balance?.bundles?.addons !== 0");
    expect(source).toContain("function assertBalanceUnchanged");
    expect(source).toContain("async function provePromotionInventory");
    expect(source).toContain("if (initial.remaining === 1)");
    expect(source).toContain("expectedUsed = initial.used + 1");
    expect(source).toContain("expectedUsed = initial.used");
    expect(source).not.toContain("spotlight: { included: 1, used: 0, remaining: 1 }");
    expect(source).not.toContain("priority: { included: 1, used: 0, remaining: 1 }");
  });

  it("behaviorally rejects plan usage above included inventory without add-ons", () => {
    const functionSource = source.match(
      /function assertEntitlementBalance\(balance\) \{[\s\S]*?\n\}\n\nfunction assertBalanceUnchanged/,
    )?.[0].replace(/\n\nfunction assertBalanceUnchanged$/, "");
    expect(functionSource).toBeTruthy();
    const assertEntitlementBalance = Function(
      "boundedJson",
      `${functionSource}; return assertEntitlementBalance;`,
    )(JSON.stringify);

    expect(() => assertEntitlementBalance({
      spotlight: { included: 1, used: 2, remaining: 0, addons: 0 },
      priority: { included: 1, used: 0, remaining: 1, addons: 0 },
      bundles: { addons: 0 },
    })).toThrow(/Invalid spotlight entitlement balance/);
  });

  it("reaches and asserts the database Open House guard with run-owned priority inventory", () => {
    const sqlGuardToken = openHouseGuardMigration.match(
      /guard_listing_promotion_eligibility\(\)[\s\S]*?RAISE EXCEPTION '([^']+)'/,
    )?.[1];
    expect(sqlGuardToken).toBe("open_house_promotion_not_supported");
    expect(source).toContain("async function seedOpenHousePriorityAddonFixture");
    expect(source).toContain("await seedOpenHousePriorityAddonFixture()");
    expect(source).toContain("/open_house_promotion_not_supported/");
    expect(source).not.toContain("expectedOpenHousePriorityError");
    expect(source).toMatch(
      /await seedOpenHousePriorityAddonFixture\(\)[\s\S]*?const openHouseActivation = await activate\([\s\S]*?openHouse\.id,[\s\S]*?"priority",[\s\S]*?"open-house"[\s\S]*?\/open_house_promotion_not_supported\//,
    );
    expect(source).toMatch(
      /if \(openHouseActivation\.ok\) \{[\s\S]*?activePromotions\.push/,
    );
  });

  it("deletes and verifies only the marked run-owned priority add-on", () => {
    expect(source).toContain(
      "const openHousePriorityAddonPurchaseId = globalThis.crypto.randomUUID()",
    );
    expect(source).toContain("async function cleanupOpenHousePriorityAddonFixture");
    expect(source).toContain('id: `eq.${openHousePriorityAddonPurchaseId}`');
    expect(source).toContain(
      '"metadata->>ecas_fixture": "eq.staging-promotion-entitlement-matrix"',
    );
    expect(source).toContain('"metadata->>ecas_run_id": `eq.${RUN_ID}`');
    expect(source).toContain(
      '`addon_purchases?select=id&id=eq.${openHousePriorityAddonPurchaseId}`',
    );
    expect(source).toMatch(
      /finally \{[\s\S]*?await cleanup\(\)[\s\S]*?\}/,
    );
  });

  it("deletes an unexpected Open House allocation before its add-on purchase", () => {
    const functionSource = source.match(
      /function openHouseAddonAllocationFilter\(select\) \{[\s\S]*?\n\}/,
    )?.[0];
    expect(functionSource).toBeTruthy();
    const openHouseAddonAllocationFilter = Function(
      "URLSearchParams",
      "openHousePriorityAddonPurchaseId",
      "REQUEST_PREFIX",
      `${functionSource}; return openHouseAddonAllocationFilter;`,
    )(URLSearchParams, "addon-fixture-id", "ecas:run-id:");
    const filterUrl = new URL(
      `https://example.test/${openHouseAddonAllocationFilter("id")}`,
    );
    expect(filterUrl.searchParams.get("select")).toBe("id");
    expect(filterUrl.searchParams.get("addon_purchase_id"))
      .toBe("eq.addon-fixture-id");
    expect(filterUrl.searchParams.get("request_key"))
      .toBe("eq.ecas:run-id:open-house");

    expect(source).toContain(
      "async function cleanupOpenHousePriorityAddonAllocationFixture",
    );
    expect(source).toContain("row.addon_purchase_id !== openHousePriorityAddonPurchaseId");
    expect(source).toContain("row.request_key !== `${REQUEST_PREFIX}open-house`");
    expect(source).toContain('openHouseAddonAllocationFilter("id")');
    const allocationCleanup = source.indexOf(
      "await cleanupOpenHousePriorityAddonAllocationFixture()",
    );
    const purchaseCleanup = source.indexOf(
      "await cleanupOpenHousePriorityAddonFixture()",
      allocationCleanup,
    );
    expect(allocationCleanup).toBeGreaterThan(-1);
    expect(purchaseCleanup).toBeGreaterThan(allocationCleanup);
  });
});
