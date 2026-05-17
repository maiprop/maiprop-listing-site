import { describe, it, expect } from "vitest";
import {
  getExplicitParticipantTypeFromProfile,
  getParticipantTypeFromProfile,
  getOwnerParticipantType,
  getPricingAudienceFromProfile,
  isInvestorMode,
  PARTICIPANT_LABELS,
  type ParticipantId,
} from "@/lib/participantConfig";

describe("getExplicitParticipantTypeFromProfile", () => {
  it("returns null for null profile", () => {
    expect(getExplicitParticipantTypeFromProfile(null)).toBe(null);
  });

  it("returns null when participant_type is missing", () => {
    expect(getExplicitParticipantTypeFromProfile({})).toBe(null);
  });

  it("returns participant_type when valid", () => {
    expect(getExplicitParticipantTypeFromProfile({ participant_type: "professional" })).toBe("professional");
  });

  it("returns null when participant_type is invalid", () => {
    expect(getExplicitParticipantTypeFromProfile({ participant_type: "unknown" })).toBe(null);
  });
});

describe("getParticipantTypeFromProfile", () => {
  it("returns 'buyer' for null", () => {
    expect(getParticipantTypeFromProfile(null)).toBe("buyer");
  });

  it("prefers participant_type column over role", () => {
    expect(
      getParticipantTypeFromProfile({ participant_type: "seller", role: "buyer" })
    ).toBe("seller");
  });

  it("falls back to role when participant_type is absent", () => {
    expect(getParticipantTypeFromProfile({ role: "agent" })).toBe("agent");
  });

  it("returns 'agent' for admin role (admin uses agent dashboard)", () => {
    expect(getParticipantTypeFromProfile({ role: "admin" })).toBe("agent");
  });

  it("handles all valid participant_type values", () => {
    const ids: ParticipantId[] = ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"];
    for (const id of ids) {
      expect(getParticipantTypeFromProfile({ participant_type: id })).toBe(id);
    }
  });

  it("uses legacy bio __type: prefix when columns are absent", () => {
    expect(getParticipantTypeFromProfile({ bio: "__type:developer" })).toBe("developer");
    expect(getParticipantTypeFromProfile({ bio: "__type:seller" })).toBe("seller");
    expect(getParticipantTypeFromProfile({ bio: "__type:professional" })).toBe("professional");
    expect(getParticipantTypeFromProfile({ bio: "__type:agent" })).toBe("agent");
    expect(getParticipantTypeFromProfile({ bio: "__type:buyer" })).toBe("buyer");
  });

  it("returns 'buyer' when no match found", () => {
    expect(getParticipantTypeFromProfile({ role: "unknown_role" })).toBe("buyer");
  });

  it("ignores invalid participant_type values and falls back to role", () => {
    expect(
      getParticipantTypeFromProfile({ participant_type: "notarole", role: "seller" })
    ).toBe("seller");
  });
});

describe("getOwnerParticipantType", () => {
  it("returns null for null profile", () => {
    expect(getOwnerParticipantType(null)).toBe(null);
  });

  it("returns 'agent' for role=agent", () => {
    expect(getOwnerParticipantType({ role: "agent" })).toBe("agent");
  });

  it("returns 'agent' for role=developer", () => {
    expect(getOwnerParticipantType({ role: "developer" })).toBe("agent");
  });

  it("returns 'agent' for role=admin", () => {
    expect(getOwnerParticipantType({ role: "admin" })).toBe("agent");
  });

  it("returns 'seller' for role=seller", () => {
    expect(getOwnerParticipantType({ role: "seller" })).toBe("seller");
  });

  it("returns 'seller' for legacy bio __type:seller", () => {
    expect(getOwnerParticipantType({ bio: "__type:seller" })).toBe("seller");
  });

  it("returns null for buyer role", () => {
    expect(getOwnerParticipantType({ role: "buyer" })).toBe(null);
  });
});

describe("getPricingAudienceFromProfile", () => {
  it("maps buyer to 'participant'", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "buyer" })).toBe("participant");
  });

  it("maps seller to 'participant'", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "seller" })).toBe("participant");
  });

  it("maps agent to 'agent'", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "agent" })).toBe("agent");
  });

  it("maps developer to 'developer'", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "developer" })).toBe("developer");
  });

  it("maps professional to 'professional'", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "professional" })).toBe("professional");
  });

  it("maps investor and institutional profiles to invite-only pricing audiences", () => {
    expect(getPricingAudienceFromProfile({ participant_type: "investor" })).toBe("investor");
    expect(getPricingAudienceFromProfile({ participant_type: "institutional" })).toBe("institutional");
  });

  it("prefers participant_type over legacy role for pricing gates", () => {
    expect(
      getPricingAudienceFromProfile({ participant_type: "seller", role: "agent" })
    ).toBe("participant");
    expect(
      getPricingAudienceFromProfile({ participant_type: "developer", role: "buyer" })
    ).toBe("developer");
  });
});

describe("isInvestorMode", () => {
  it("returns false for null", () => {
    expect(isInvestorMode(null)).toBe(false);
  });

  it("returns true when investor_mode is true", () => {
    expect(isInvestorMode({ investor_mode: true })).toBe(true);
  });

  it("returns false when investor_mode is false", () => {
    expect(isInvestorMode({ investor_mode: false })).toBe(false);
  });

  it("returns false when investor_mode is null", () => {
    expect(isInvestorMode({ investor_mode: null })).toBe(false);
  });
});

describe("PARTICIPANT_LABELS", () => {
  it("has a label for every ParticipantId", () => {
    const ids: ParticipantId[] = ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"];
    for (const id of ids) {
      expect(PARTICIPANT_LABELS[id]).toBeTruthy();
    }
  });
});
