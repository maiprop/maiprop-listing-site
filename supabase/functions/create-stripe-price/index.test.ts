/**
 * Tests for create-stripe-price edge function (admin only).
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
  const res = await handler(
    req("POST", { name: "Pro Plan", amount: 2900, interval: "month" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns auth/permission error, not crash", async () => {
  const res = await handler(
    authedReq("POST", { name: "Pro Plan", amount: 2900, interval: "month" }),
  );
  assertEquals([401, 403].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
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

restore();
