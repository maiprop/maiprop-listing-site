import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCatalogBootstrapCredentials } from "./setup-stripe-catalog.mjs";

const account = "acct_1TnuLTGfOEgBOxtl";

describe("Stripe catalog bootstrap credentials", () => {
  it("keeps test setup on a test secret key", () => {
    expect(validateCatalogBootstrapCredentials({
      args: { live: false, confirmLiveAccount: null },
      env: { STRIPE_SECRET_KEY: "sk_test_synthetic" },
    })).toEqual({
      key: "sk_test_synthetic",
      live: false,
      expectedAccountId: null,
    });
  });

  it("requires a dedicated restricted live bootstrap key and exact account", () => {
    expect(validateCatalogBootstrapCredentials({
      args: { live: true, confirmLiveAccount: account },
      env: {
        STRIPE_CATALOG_BOOTSTRAP_KEY: "rk_live_synthetic",
      },
    })).toEqual({
      key: "rk_live_synthetic",
      live: true,
      expectedAccountId: account,
    });
  });

  it.each([
    ["standard live key", { STRIPE_CATALOG_BOOTSTRAP_KEY: "sk_live_synthetic" }, account],
    ["missing acknowledgement", {
      STRIPE_CATALOG_BOOTSTRAP_KEY: "rk_live_synthetic",
    }, null],
    ["mismatched account", {
      STRIPE_CATALOG_BOOTSTRAP_KEY: "rk_live_synthetic",
    }, "acct_other"],
  ])("rejects live bootstrap with %s", (_label, env, confirmation) => {
    expect(() => validateCatalogBootstrapCredentials({
      args: { live: true, confirmLiveAccount: confirmation },
      env,
    })).toThrow(/live|account|restricted/i);
  });

  it("does not let an environment variable redirect live bootstrap", () => {
    expect(validateCatalogBootstrapCredentials({
      args: { live: true, confirmLiveAccount: account },
      env: {
        STRIPE_CATALOG_BOOTSTRAP_KEY: "rk_live_synthetic",
        STRIPE_EXPECTED_ACCOUNT_ID: "acct_attacker",
      },
    }).expectedAccountId).toBe(account);
  });

  it("checks the exact live account before the first catalog operation", () => {
    const source = readFileSync(resolve("scripts/setup-stripe-catalog.mjs"), "utf8");
    const accountCheck = source.lastIndexOf(
      'stripeRequest("GET", "/v1/account")',
    );
    const firstCatalogOperation = source.lastIndexOf(
      "for (const key of RETIRED_CATALOG_KEYS)",
    );
    expect(accountCheck).toBeGreaterThan(0);
    expect(accountCheck).toBeLessThan(firstCatalogOperation);
  });
});
