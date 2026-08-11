import { describe, expect, it } from "vitest";

import {
  REQUIRED_STRIPE_SECRET_MESSAGE,
  formatStripeKeyEvidence,
  getStripeReadOnlyKey,
  getStripeSecretKey,
  stripeKeyMetadata,
} from "./stripe-readiness-env.mjs";

describe("Stripe readiness environment helpers", () => {
  it("uses a single actionable missing-secret message", () => {
    expect(() => getStripeSecretKey({})).toThrow(REQUIRED_STRIPE_SECRET_MESSAGE);
  });

  it("exposes only masked key metadata", () => {
    const key = ["sk", "test", "51TnuLbSyntheticValueForMaskingOnly"].join("_");
    const metadata = stripeKeyMetadata(key);

    expect(metadata).toEqual({
      mode: "test",
      keyPrefix: "sk_test_...",
    });
    expect(formatStripeKeyEvidence(key)).toContain("Stripe mode: test");
    expect(formatStripeKeyEvidence(key)).toContain("Stripe key prefix: sk_test_...");
    expect(formatStripeKeyEvidence(key)).not.toContain("SecretValueThatMustNotLeak");
  });

  it("allows restricted keys only for read-only Stripe checks", () => {
    const key = ["rk", "live", "51TnuLTSyntheticValueForMaskingOnly"].join("_");

    expect(getStripeReadOnlyKey({ STRIPE_RESTRICTED_KEY: key })).toBe(key);
    expect(stripeKeyMetadata(key)).toEqual({
      mode: "live",
      keyPrefix: "rk_live_...",
    });
    expect(() => getStripeSecretKey({ STRIPE_SECRET_KEY: key })).toThrow(/secret key/i);
  });

  it.each([
    ["standard live secret", { STRIPE_RESTRICTED_KEY: "sk_live_synthetic" }],
    ["standard test secret", { STRIPE_RESTRICTED_KEY: "sk_test_synthetic" }],
    ["restricted test key", { STRIPE_RESTRICTED_KEY: "rk_test_synthetic" }],
    ["read-only alias", { STRIPE_READ_ONLY_KEY: "rk_live_synthetic" }],
    ["secret fallback", { STRIPE_SECRET_KEY: "rk_live_synthetic" }],
    ["API fallback", { STRIPE_API_KEY: "rk_live_synthetic" }],
    ["live-secret alias", { STRIPE_LIVE_SECRET_KEY: "rk_live_synthetic" }],
    ["alternate live-secret alias", { STRIPE_SECRET_KEY_LIVE: "rk_live_synthetic" }],
  ])("rejects %s for live readiness", (_label, env) => {
    expect(() => getStripeReadOnlyKey(env)).toThrow(/STRIPE_RESTRICTED_KEY.*rk_live_/i);
  });

  it("rejects ambiguous Stripe aliases even when the restricted key is valid", () => {
    expect(() => getStripeReadOnlyKey({
      STRIPE_RESTRICTED_KEY: "rk_live_synthetic",
      STRIPE_SECRET_KEY: "sk_live_forbidden",
    })).toThrow(/alias|fallback/i);
  });
});
