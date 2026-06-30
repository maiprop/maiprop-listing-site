import { describe, expect, it } from "vitest";
import {
  hasCurrentQuickSaleSubscription,
  resolveQuickSaleEligibility,
} from "@/lib/quickSaleEntitlements";

describe("quick sale entitlement resolver", () => {
  it("allows platform admins without depending on subscription state", () => {
    expect(resolveQuickSaleEligibility({ profile: { role: "admin" }, subscriptionStatus: null })).toMatchObject({
      eligible: true,
      isAdmin: true,
      hasActiveSubscription: false,
      isInvestorRole: false,
    });
  });

  it("allows investor and institutional roles with active or trial subscription status", () => {
    expect(resolveQuickSaleEligibility({ profile: { role: "investor" }, subscriptionStatus: "active" }).eligible).toBe(true);
    expect(resolveQuickSaleEligibility({ profile: { role: "institutional" }, subscriptionStatus: "trial" }).eligible).toBe(true);
  });

  it("honors investor subscription expiry dates", () => {
    const now = new Date("2026-06-30T12:00:00.000Z");

    expect(hasCurrentQuickSaleSubscription("active", null, now)).toBe(true);
    expect(hasCurrentQuickSaleSubscription("active", "2026-07-01T00:00:00.000Z", now)).toBe(true);
    expect(hasCurrentQuickSaleSubscription("active", "2026-06-01T00:00:00.000Z", now)).toBe(false);
    expect(
      resolveQuickSaleEligibility({
        profile: { role: "investor" },
        subscriptionStatus: "active",
        subscriptionExpiresAt: "2026-06-01T00:00:00.000Z",
        now,
      }),
    ).toMatchObject({
      eligible: false,
      hasActiveSubscription: false,
      isInvestorRole: true,
    });
  });

  it("does not allow force-pro access or active subscription without the investor role", () => {
    expect(
      resolveQuickSaleEligibility({
        profile: { role: "buyer", force_pro_access: true },
        subscriptionStatus: "active",
      }),
    ).toMatchObject({
      eligible: false,
      hasActiveSubscription: true,
      isInvestorRole: false,
    });
  });

  it("locks investor access while role switching is pending", () => {
    expect(
      resolveQuickSaleEligibility({
        profile: { role: "investor", role_switch_in_progress_at: "2026-06-22T08:00:00.000Z" },
        subscriptionStatus: "active",
      }),
    ).toMatchObject({
      eligible: false,
      hasActiveSubscription: true,
      isInvestorRole: false,
    });
  });
});
