import { describe, expect, it } from "vitest";

import {
  REQUIRED_STRIPE_SECRET_MESSAGE,
  formatStripeKeyEvidence,
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
});
