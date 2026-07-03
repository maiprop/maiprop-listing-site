import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/check-stripe-catalog-parity.mjs"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("Stripe catalog parity script", () => {
  it("is exposed as a release gate script", () => {
    expect(packageJson.scripts["check:stripe-catalog-parity"]).toBe(
      "node scripts/check-stripe-catalog-parity.mjs",
    );
  });

  it("compares sandbox and live by lookup keys instead of object IDs", () => {
    expect(script).toContain("STRIPE_SANDBOX_SECRET_KEY");
    expect(script).toContain("STRIPE_LIVE_SECRET_KEY");
    expect(script).toContain("lookup_key");
    expect(script).toContain("comparePrices");
    expect(script).not.toContain("testPrice.id !== livePrice.id");
  });

  it("requires tax, portal, and webhook readiness in both environments", () => {
    expect(script).toContain("/v1/tax/registrations");
    expect(script).toContain("/v1/tax_ids");
    expect(script).toContain("/v1/billing_portal/configurations");
    expect(script).toContain("/v1/webhook_endpoints");
  });

  it("requires refund and expired-checkout webhook events", () => {
    expect(script).toContain("checkout.session.expired");
    expect(script).toContain("charge.refunded");
    expect(script).toContain("refund.created");
    expect(script).toContain("refund.updated");
    expect(script).toContain("credit_note.created");
  });
});
