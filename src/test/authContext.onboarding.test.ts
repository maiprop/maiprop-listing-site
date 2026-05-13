import { describe, it, expect } from "vitest";
import { profileNeedsOnboarding } from "@/contexts/AuthContext";

describe("profileNeedsOnboarding", () => {
  it("returns false for null/undefined profile", () => {
    expect(profileNeedsOnboarding(null)).toBe(false);
    expect(profileNeedsOnboarding(undefined as never)).toBe(false);
  });

  it("returns true when participant_type is missing", () => {
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: null } as never),
    ).toBe(true);
    // Empty string also counts as missing.
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: "" } as never),
    ).toBe(true);
  });

  it("returns true when role and participant_type are mismatched", () => {
    // Several mismatched pairings should all need onboarding.
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: "professional" } as never),
    ).toBe(true);
    expect(
      profileNeedsOnboarding({ role: "agent", participant_type: "buyer" } as never),
    ).toBe(true);
    expect(
      profileNeedsOnboarding({ role: "investor", participant_type: "developer" } as never),
    ).toBe(true);
  });

  it("returns false when role and participant_type are aligned", () => {
    // Several aligned pairings should all be onboarded.
    expect(
      profileNeedsOnboarding({ role: "developer", participant_type: "developer" } as never),
    ).toBe(false);
    expect(
      profileNeedsOnboarding({ role: "agent", participant_type: "agent" } as never),
    ).toBe(false);
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: "buyer" } as never),
    ).toBe(false);
  });

  it("returns false for admin profile (admin bypasses participant_type)", () => {
    expect(
      profileNeedsOnboarding({ role: "admin", participant_type: null } as never),
    ).toBe(false);
    expect(
      profileNeedsOnboarding({ role: "admin", participant_type: "any" } as never),
    ).toBe(false);
  });

  it("does not trust legacy bio markers as onboarding completion", () => {
    expect(
      profileNeedsOnboarding({ role: null, participant_type: null, bio: "__type:buyer" } as never),
    ).toBe(true);
    expect(
      profileNeedsOnboarding({ role: null, participant_type: null, bio: "__type:seller" } as never),
    ).toBe(true);
  });
});
