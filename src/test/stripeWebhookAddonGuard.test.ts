import { describe, expect, it } from "vitest";
import {
  isAddonSubscription,
  shouldSkipProfileEntitlementSync,
} from "../../supabase/functions/stripe-webhook/addonGuard";

describe("Stripe add-on checkout guard", () => {
  it("skips profile entitlement sync only for add-on subscriptions", () => {
    expect(isAddonSubscription({ metadata: { checkout_type: "addon" } })).toBe(true);
    expect(shouldSkipProfileEntitlementSync({ metadata: { checkout_type: "addon" } })).toBe(true);

    expect(isAddonSubscription({ metadata: { checkout_type: "subscription" } })).toBe(false);
    expect(shouldSkipProfileEntitlementSync({ metadata: { checkoutMode: "subscription" } })).toBe(false);
    expect(shouldSkipProfileEntitlementSync({ metadata: null })).toBe(false);
    expect(shouldSkipProfileEntitlementSync({})).toBe(false);
  });
});
