import { describe, it, expect } from "vitest";
import { profileNeedsOnboarding } from "@/contexts/AuthContext";

describe("profileNeedsOnboarding", () => {
  it("returns false for null profile", () => {
    expect(profileNeedsOnboarding(null)).toBe(false);
  });

  it("returns true when participant_type is missing", () => {
    expect(
      profileNeedsOnboarding({
        role: "buyer",
        participant_type: null,
      } as never)
    ).toBe(true);
  });

  it("returns true when role and participant_type are mismatched", () => {
    expect(
      profileNeedsOnboarding({
        role: "buyer",
        participant_type: "professional",
      } as never)
    ).toBe(true);
  });

  it("returns false when role and participant_type are aligned", () => {
    expect(
      profileNeedsOnboarding({
        role: "developer",
        participant_type: "developer",
      } as never)
    ).toBe(false);
  });

  it("returns false for admin profile", () => {
    expect(
      profileNeedsOnboarding({
        role: "admin",
        participant_type: null,
      } as never)
    ).toBe(false);
  });

  it("returns false for legacy bio marker", () => {
    expect(
      profileNeedsOnboarding({
        role: null,
        participant_type: null,
        bio: "__type:buyer",
      } as never)
    ).toBe(false);
  });
});
