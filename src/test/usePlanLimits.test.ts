/**
 * getPlanLimits tests — verifies tiered limits per participant type,
 * fallback behavior for unknown roles, and pro-only role handling.
 */
import { describe, it, expect } from "vitest";
import { getPlanLimits, startOfCurrentMonth } from "@/hooks/usePlanLimits";

describe("getPlanLimits", () => {
  it("buyer free tier has restrictive limits", () => {
    const limits = getPlanLimits("buyer", "free");
    expect(limits.savedSearches).toBe(1);
    expect(limits.listings).toBe(0);
    expect(limits.valuationsPerMonth).toBe(5);
  });

  it("buyer pro tier unlocks features", () => {
    const limits = getPlanLimits("buyer", "pro");
    expect(limits.savedSearches).toBeNull(); // unlimited
    expect(limits.listings).toBe(5);
    expect(limits.valuationsPerMonth).toBe(50);
    expect(limits.viewingsPerMonth).toBe(10);
    expect(limits.reportsPerMonth).toBe(3);
  });

  it("applies participant booking limits equally to buyers and sellers", () => {
    expect(getPlanLimits("buyer", "free").viewingsPerMonth).toBe(1);
    expect(getPlanLimits("seller", "free").viewingsPerMonth).toBe(1);
    expect(getPlanLimits("buyer", "pro").viewingsPerMonth).toBe(10);
    expect(getPlanLimits("seller", "pro").viewingsPerMonth).toBe(10);
  });

  it("agent free tier allows 5 listings", () => {
    const limits = getPlanLimits("agent", "free");
    expect(limits.listings).toBe(5);
    expect(limits.contactsPerMonth).toBeNull(); // unlimited for agents
    expect(limits.viewingsPerMonth).toBe(3);
    expect(limits.valuationsPerMonth).toBe(5);
  });

  it("keeps agent viewing rules unchanged", () => {
    expect(getPlanLimits("agent", "free").viewingsPerMonth).toBe(3);
    expect(getPlanLimits("agent", "pro").viewingsPerMonth).toBe(10);
    expect(getPlanLimits("agent", "pro").valuationsPerMonth).toBe(50);
  });

  it("keeps non-agent B2B viewing semantics unchanged", () => {
    for (const audience of ["developer", "professional", "investor", "institutional"] as const) {
      expect(getPlanLimits(audience, "free").viewingsPerMonth).toBeNull();
      expect(getPlanLimits(audience, "pro").viewingsPerMonth).toBeNull();
    }
  });

  it("does not grant paid Developer limits before entitlement resolves", () => {
    const proLimits = getPlanLimits("developer", "pro");
    expect(proLimits.listings).toBeNull(); // unlimited
    expect(proLimits.spotlightAds).toBe(1);
    expect(proLimits.priorityAds).toBe(1);

    const freeLimits = getPlanLimits("developer", "free");
    expect(freeLimits.listings).toBe(0);
    expect(freeLimits.spotlightAds).toBe(0);
    expect(freeLimits.priorityAds).toBe(0);
    expect(freeLimits.valuationsPerMonth).toBe(0);
  });

  it("investor is pro-only", () => {
    const limits = getPlanLimits("investor", "pro");
    expect(limits.auctionListingsVisible).toBe(600);
    expect(limits.valuationsPerMonth).toBe(50);
    const unresolved = getPlanLimits("investor", "free");
    expect(unresolved.valuationsPerMonth).toBe(0);
    expect(unresolved.reportsPerMonth).toBe(0);
  });

  it("does not grant unpaid AI calls to Pro-only audiences", () => {
    for (const audience of ["developer", "investor", "institutional"] as const) {
      expect(getPlanLimits(audience, "free").valuationsPerMonth).toBe(0);
    }
  });

  it("unknown audience falls back to buyer tier", () => {
    const limits = getPlanLimits("unknown_role" as never, "free");
    expect(limits.savedSearches).toBe(1); // buyer free default
  });

  it("treats platform admin limits as unlimited instead of agent Pro limits", () => {
    const limits = getPlanLimits("admin", "pro");

    expect(limits.viewingsPerMonth).toBeNull();
    expect(limits.valuationsPerMonth).toBeNull();
    expect(limits.reportsPerMonth).toBeNull();
    expect(limits.auctionListingsVisible).toBe(600);
  });
});

describe("startOfCurrentMonth", () => {
  it("returns first day of current month in UTC", () => {
    const result = startOfCurrentMonth();
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });
});
