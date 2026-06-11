import { describe, it, expect } from "vitest";
import { isPlatformAdmin, isSellSideRole, isSellerRole } from "@/lib/authUtils";

describe("isPlatformAdmin", () => {
  it("returns false for null", () => {
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("returns true when role is admin", () => {
    expect(isPlatformAdmin({ role: "admin" })).toBe(true);
  });

  it("returns false for non-admin roles", () => {
    expect(isPlatformAdmin({ role: "agent" })).toBe(false);
    expect(isPlatformAdmin({ role: "seller" })).toBe(false);
    expect(isPlatformAdmin({ role: "buyer" })).toBe(false);
  });

});


describe("isSellSideRole", () => {
  it("returns false for null", () => {
    expect(isSellSideRole(null)).toBe(false);
  });

  it("returns true for sell-side roles including institutional", () => {
    for (const role of ["agent", "seller", "developer", "institutional"]) {
      expect(isSellSideRole({ role })).toBe(true);
    }
  });

  it("does NOT grant sell-side via participant_type (security: only role is authoritative)", () => {
    expect(isSellSideRole({ role: "buyer" })).toBe(false);
  });

  it("returns false for buy-side roles", () => {
    expect(isSellSideRole({ role: "buyer" })).toBe(false);
    expect(isSellSideRole({ role: "investor" })).toBe(false);
  });

  it("returns false for empty profile", () => {
    expect(isSellSideRole({})).toBe(false);
  });
});

describe("isSellerRole", () => {
  it("returns true only for seller profiles", () => {
    expect(isSellerRole({ role: "seller" })).toBe(true);
    expect(isSellerRole({ role: "agent" })).toBe(false);
    expect(isSellerRole({ role: "developer" })).toBe(false);
    expect(isSellerRole({ role: "admin" })).toBe(false);
    expect(isSellerRole(null)).toBe(false);
  });
});
