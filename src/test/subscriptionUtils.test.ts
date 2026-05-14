import { describe, it, expect } from "vitest";
import {
  isActiveSubscription,
  isProSubscription,
  isSubscriptionAudienceAllowed,
  normalizeSubscriptionAudience,
} from "@/lib/subscriptionUtils";

describe("isActiveSubscription", () => {
  it("returns true for active", () => {
    expect(isActiveSubscription("active")).toBe(true);
    // Should be a strict boolean, not just truthy.
    expect(typeof isActiveSubscription("active")).toBe("boolean");
  });

  it("returns true for trialing — consistent with stripe-webhook", () => {
    expect(isActiveSubscription("trialing")).toBe(true);
    // active and trialing produce the same result.
    expect(isActiveSubscription("trialing")).toBe(isActiveSubscription("active"));
  });

  it("returns false for non-billable statuses", () => {
    for (const status of ["past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(isActiveSubscription(status), `expected ${status} to be inactive`).toBe(false);
    }
  });

  it("returns false for empty string or unknown value", () => {
    expect(isActiveSubscription("")).toBe(false);
    expect(isActiveSubscription("unknown")).toBe(false);
    expect(isActiveSubscription("ACTIVE")).toBe(false); // case-sensitive
  });
});

describe("isProSubscription", () => {
  it("returns true for active subscription object", () => {
    expect(isProSubscription({ status: "active" })).toBe(true);
    expect(typeof isProSubscription({ status: "active" })).toBe("boolean");
  });

  it("returns true for trialing subscription object", () => {
    expect(isProSubscription({ status: "trialing" })).toBe(true);
    // Both active and trialing flow through to the same Pro state.
    expect(isProSubscription({ status: "trialing" })).toBe(isProSubscription({ status: "active" }));
  });

  it("returns false for canceled subscription object", () => {
    expect(isProSubscription({ status: "canceled" })).toBe(false);
    expect(isProSubscription({ status: "past_due" })).toBe(false);
    expect(isProSubscription({ status: "incomplete" })).toBe(false);
  });
});

describe("subscription audience entitlement", () => {
  it("normalizes buyer/seller/pro to participant", () => {
    expect(normalizeSubscriptionAudience("buyer")).toBe("participant");
    expect(normalizeSubscriptionAudience("seller")).toBe("participant");
    expect(normalizeSubscriptionAudience("pro")).toBe("participant");
  });

  it("accepts only matching role audiences", () => {
    expect(isSubscriptionAudienceAllowed("developer", "developer")).toBe(true);
    expect(isSubscriptionAudienceAllowed("participant", "developer")).toBe(false);
    expect(isSubscriptionAudienceAllowed("agent", "professional")).toBe(false);
  });
});
