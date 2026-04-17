import { describe, it, expect } from "vitest";
import { isActiveSubscription, isProSubscription } from "@/lib/subscriptionUtils";

describe("isActiveSubscription", () => {
  it("returns true for active", () => {
    expect(isActiveSubscription("active")).toBe(true);
  });

  it("returns true for trialing — consistent with stripe-webhook", () => {
    expect(isActiveSubscription("trialing")).toBe(true);
  });

  it("returns false for non-billable statuses", () => {
    for (const status of ["past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(isActiveSubscription(status), `expected ${status} to be inactive`).toBe(false);
    }
  });

  it("returns false for empty string or unknown value", () => {
    expect(isActiveSubscription("")).toBe(false);
    expect(isActiveSubscription("unknown")).toBe(false);
  });
});

describe("isProSubscription", () => {
  it("returns true for active subscription object", () => {
    expect(isProSubscription({ status: "active" })).toBe(true);
  });

  it("returns true for trialing subscription object", () => {
    expect(isProSubscription({ status: "trialing" })).toBe(true);
  });

  it("returns false for canceled subscription object", () => {
    expect(isProSubscription({ status: "canceled" })).toBe(false);
  });
});
