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
    expect(limits.valuationsPerMonth).toBe(0);
  });

  it("buyer pro tier unlocks features", () => {
    const limits = getPlanLimits("buyer", "pro");
    expect(limits.savedSearches).toBeNull(); // unlimited
    expect(limits.listings).toBe(5);
    expect(limits.valuationsPerMonth).toBe(5);
  });

  it("agent free tier allows 5 listings", () => {
    const limits = getPlanLimits("agent", "free");
    expect(limits.listings).toBe(5);
    expect(limits.contactsPerMonth).toBeNull(); // unlimited for agents
  });

  it("developer is pro-only (no free tier)", () => {
    const proLimits = getPlanLimits("developer", "pro");
    expect(proLimits.listings).toBeNull(); // unlimited
    // Even if free is requested, returns pro since no free tier exists
    const freeLimits = getPlanLimits("developer", "free");
    expect(freeLimits.listings).toBeNull(); // still pro limits
  });

  it("investor is pro-only", () => {
    const limits = getPlanLimits("investor", "pro");
    expect(limits.auctionListingsVisible).toBeNull(); // unlimited
    expect(limits.valuationsPerMonth).toBeNull();
  });

  it("unknown audience falls back to buyer tier", () => {
    const limits = getPlanLimits("unknown_role" as never, "free");
    expect(limits.savedSearches).toBe(1); // buyer free default
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
