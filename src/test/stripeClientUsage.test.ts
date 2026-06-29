import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const criticalStripeFunctions = [
  "apply-data-input-credit",
  "check-subscription",
  "create-checkout",
  "create-investor-payment",
  "create-stripe-price",
  "customer-portal",
  "delete-account",
  "get-invoices",
  "log-role-switch",
  "stripe-webhook",
  "sync-stripe-pricing",
] as const;

describe("Stripe client runtime guard", () => {
  it("instantiates Stripe through the shared test-mode-aware helper", () => {
    for (const fnName of criticalStripeFunctions) {
      const file = path.join(root, "supabase", "functions", fnName, "index.ts");
      const source = fs.readFileSync(file, "utf8");

      expect(source, `${fnName} should import createStripeClient`).toContain(
        "createStripeClient",
      );
      expect(source, `${fnName} should not instantiate Stripe directly`)
        .not.toMatch(/\bnew\s+Stripe\s*\(/);
    }
  });

  it("keeps Stripe Tax wired for checkout sessions and catalog creation", () => {
    const checkoutSource = fs.readFileSync(
      path.join(root, "supabase", "functions", "create-checkout", "index.ts"),
      "utf8",
    );
    const investorSource = fs.readFileSync(
      path.join(root, "supabase", "functions", "create-investor-payment", "index.ts"),
      "utf8",
    );
    const catalogSource = fs.readFileSync(
      path.join(root, "scripts", "setup-stripe-catalog.mjs"),
      "utf8",
    );
    const createStripePriceSource = fs.readFileSync(
      path.join(root, "supabase", "functions", "create-stripe-price", "index.ts"),
      "utf8",
    );
    const syncStripePricingSource = fs.readFileSync(
      path.join(root, "supabase", "functions", "sync-stripe-pricing", "index.ts"),
      "utf8",
    );

    for (const [name, source] of [
      ["create-checkout", checkoutSource],
      ["create-investor-payment", investorSource],
    ] as const) {
      expect(source, `${name} should enable Stripe Tax collection`).toContain(
        "CHECKOUT_TAX_COLLECTION_PARAMS",
      );
      expect(source, `${name} should include tax settings in idempotency`).toContain(
        '"stripe-tax-v1"',
      );
    }

    expect(checkoutSource).toContain("buildPaymentModeInvoiceCreationParams(addonMetadata)");
    expect(investorSource).toContain("buildPaymentModeInvoiceCreationParams(metadata)");
    expect(catalogSource).toContain("tax_code:");
    expect(catalogSource).toContain("tax_behavior:");
    expect(catalogSource).toContain("taxCodeForItem");
    expect(catalogSource).toContain("txcd_10103000");
    expect(catalogSource).toContain("txcd_10103001");
    expect(catalogSource).toContain("txcd_10105001");
    expect(catalogSource).toContain("STRIPE_DEFAULT_TAX_BEHAVIOR");

    for (const [name, source] of [
      ["create-stripe-price", createStripePriceSource],
      ["sync-stripe-pricing", syncStripePricingSource],
    ] as const) {
      expect(source, `${name} should resolve software-specific tax codes`).toContain(
        "resolveStripeSoftwareTaxCode",
      );
      expect(source, `${name} should set product tax codes`).toContain(
        "tax_code: stripeTaxCode",
      );
      expect(source, `${name} should set price tax behavior`).toContain(
        "tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR",
      );
      expect(source, `${name} should replace stale immutable prices`).toContain(
        "existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR",
      );
    }
  });
});
