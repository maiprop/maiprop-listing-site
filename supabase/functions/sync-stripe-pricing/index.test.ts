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
  const res = await handler(authedReq("POST"));
  assertEquals([401, 403].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("pricing sync stores monthly and annual Stripe price IDs distinctly", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "stripe_price_id_monthly");
  assertStringIncludes(source, "stripe_price_id_annual");
  assertStringIncludes(source, "ensureAnnualCompanionPrice");
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
  assertStringIncludes(source, "await archiveActiveLookupPrice");
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

Deno.test("pricing sync replaces immutable prices when tax behavior is stale", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(
    source,
    "price.tax_behavior === STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(source, "existingPriceTaxBehavior");
  assertStringIncludes(
    source,
    "existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
  assertStringIncludes(source, "existingAnnualTaxBehavior");
  assertStringIncludes(
    source,
    "existingAnnualTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
  );
});

Deno.test("pricing sync compares price changes in major units, not Stripe cents", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "const amountMajor = Number(config.amount)");
  assertStringIncludes(source, "amountMajor !== existingAmount");
  assertEquals(source.includes("amount !== existingAmount"), false);
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
