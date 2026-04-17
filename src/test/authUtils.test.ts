import { describe, it, expect } from "vitest";
import { isPlatformAdmin, isSellSideRole } from "@/lib/authUtils";

describe("isPlatformAdmin", () => {
  it("returns false for null", () => {
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("returns true when role is admin", () => {
    expect(isPlatformAdmin({ role: "admin" })).toBe(true);
  });

  it("returns true for legacy is_platform_admin flag", () => {
    expect(isPlatformAdmin({ is_platform_admin: true })).toBe(true);
  });

  it("returns false for non-admin roles", () => {
    expect(isPlatformAdmin({ role: "agent" })).toBe(false);
    expect(isPlatformAdmin({ role: "seller" })).toBe(false);
    expect(isPlatformAdmin({ role: "buyer" })).toBe(false);
  });

  it("admin role takes precedence over missing is_platform_admin", () => {
    expect(isPlatformAdmin({ role: "admin", is_platform_admin: false })).toBe(true);
  });
});

describe("isSellSideRole", () => {
  it("returns false for null", () => {
    expect(isSellSideRole(null)).toBe(false);
  });

  it("returns true for sell-side roles", () => {
    for (const role of ["agent", "seller", "developer", "institutional"]) {
      expect(isSellSideRole({ role })).toBe(true);
    }
  });

  it("returns true when participant_type is sell-side even if role is not", () => {
    expect(isSellSideRole({ role: "buyer", participant_type: "agent" })).toBe(true);
  });

  it("returns false for buy-side roles", () => {
    expect(isSellSideRole({ role: "buyer" })).toBe(false);
    expect(isSellSideRole({ role: "investor" })).toBe(false);
  });

  it("returns false for empty profile", () => {
    expect(isSellSideRole({})).toBe(false);
  });
});
