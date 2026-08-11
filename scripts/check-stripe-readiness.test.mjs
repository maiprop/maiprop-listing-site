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
    expect(() => getStripeReadOnlyKey({
      STRIPE_RESTRICTED_KEY: "rk_test_synthetic",
    })).toThrow(/rk_live/i);
    expect(() => getStripeReadOnlyKey({
      STRIPE_RESTRICTED_KEY: "sk_live_synthetic",
    })).toThrow(/rk_live/i);
    expect(() => getStripeReadOnlyKey({
      STRIPE_SECRET_KEY: "sk_live_synthetic",
    })).toThrow(/STRIPE_RESTRICTED_KEY/i);
  });
});
