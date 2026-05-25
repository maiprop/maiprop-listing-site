import { describe, expect, it } from "vitest";
import {
  hasProvisionedSubscriptionAccess,
  shouldRevokeSubscriptionAccess,
} from "../../supabase/functions/_shared/subscriptionStatus";

describe("shared Stripe subscription status policy", () => {
  it("keeps Pro access through Stripe's payment recovery grace state", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(hasProvisionedSubscriptionAccess(status), status).toBe(true);
      expect(shouldRevokeSubscriptionAccess(status), status).toBe(false);
    }
  });

  it("revokes only on terminal or non-provisioned statuses", () => {
    for (const status of ["canceled", "incomplete_expired", "paused", "unpaid"]) {
      expect(hasProvisionedSubscriptionAccess(status), status).toBe(false);
      expect(shouldRevokeSubscriptionAccess(status), status).toBe(true);
    }
  });

  it("does not treat initial incomplete checkout as active or terminal lapse", () => {
    expect(hasProvisionedSubscriptionAccess("incomplete")).toBe(false);
    expect(shouldRevokeSubscriptionAccess("incomplete")).toBe(false);
  });
});
