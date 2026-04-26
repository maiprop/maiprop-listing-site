import { describe, it, expect } from "vitest";
import {
  participantToPricingAudience,
  getPlanForParticipant,
  classifySwitch,
  ROLE_PLAN_MAP,
} from "@/lib/rolePlanMap";

describe("participantToPricingAudience", () => {
  it("maps buyer to participant", () => {
    expect(participantToPricingAudience("buyer")).toBe("participant");
  });

  it("maps seller to participant", () => {
    expect(participantToPricingAudience("seller")).toBe("participant");
  });

  it("maps agent to agent", () => {
    expect(participantToPricingAudience("agent")).toBe("agent");
  });

  it("maps developer to developer", () => {
    expect(participantToPricingAudience("developer")).toBe("developer");
  });

  it("maps professional to professional", () => {
    expect(participantToPricingAudience("professional")).toBe("professional");
  });

  it("maps investor to investor", () => {
    expect(participantToPricingAudience("investor")).toBe("investor");
  });

  it("maps institutional to institutional", () => {
    expect(participantToPricingAudience("institutional")).toBe("institutional");
  });
});

describe("getPlanForParticipant", () => {
  it("returns the correct plan for buyer (participant plan)", () => {
    const plan = getPlanForParticipant("buyer");
    expect(plan.audienceId).toBe("participant");
    expect(plan.monthlyPrice).toBe(29);
  });

  it("returns the correct plan for agent", () => {
    const plan = getPlanForParticipant("agent");
    expect(plan.audienceId).toBe("agent");
    expect(plan.monthlyPrice).toBe(149);
  });

  it("returns developer as proOnly", () => {
    expect(getPlanForParticipant("developer").proOnly).toBe(true);
  });

  it("returns investor as proOnly", () => {
    expect(getPlanForParticipant("investor").proOnly).toBe(true);
  });

  it("returns buyer as not proOnly", () => {
    expect(getPlanForParticipant("buyer").proOnly).toBe(false);
  });
});

describe("classifySwitch", () => {
  it("buyer → seller is same-tier (both participant €29)", () => {
    expect(classifySwitch("buyer", "seller")).toBe("same-tier");
  });

  it("seller → buyer is same-tier", () => {
    expect(classifySwitch("seller", "buyer")).toBe("same-tier");
  });

  it("buyer → agent is upgrade (€29 → €149)", () => {
    expect(classifySwitch("buyer", "agent")).toBe("upgrade");
  });

  it("agent → buyer is downgrade (€149 → €29)", () => {
    expect(classifySwitch("agent", "buyer")).toBe("downgrade");
  });

  it("any → developer is proonly (developer has no free tier)", () => {
    expect(classifySwitch("buyer", "developer")).toBe("proonly");
    expect(classifySwitch("agent", "developer")).toBe("proonly");
  });

  it("any → investor is proonly", () => {
    expect(classifySwitch("buyer", "investor")).toBe("proonly");
  });

  it("any → institutional is proonly", () => {
    expect(classifySwitch("buyer", "institutional")).toBe("proonly");
  });

  it("agent → professional is downgrade (€149 → €69)", () => {
    expect(classifySwitch("agent", "professional")).toBe("downgrade");
  });

  it("professional → agent is upgrade (€69 → €149)", () => {
    expect(classifySwitch("professional", "agent")).toBe("upgrade");
  });
});

describe("ROLE_PLAN_MAP integrity", () => {
  it("has a plan for every pricing audience", () => {
    const audiences = ["participant", "agent", "developer", "professional", "investor", "institutional"] as const;
    for (const id of audiences) {
      expect(ROLE_PLAN_MAP[id]).toBeDefined();
    }
  });

  it("each plan has required fields", () => {
    for (const plan of Object.values(ROLE_PLAN_MAP)) {
      expect(plan.planKey).toBeTruthy();
      expect(plan.planName).toBeTruthy();
      expect(typeof plan.monthlyPrice).toBe("number");
      expect(typeof plan.annualPrice).toBe("number");
      expect(typeof plan.proOnly).toBe("boolean");
    }
  });

  it("annual price is always less than 12x monthly price (discount)", () => {
    for (const plan of Object.values(ROLE_PLAN_MAP)) {
      if (plan.monthlyPrice > 0) {
        expect(plan.annualPrice).toBeLessThan(plan.monthlyPrice * 12);
      }
    }
  });
});

/**
 * Canonical pricing snapshot.
 *
 * If you change ROLE_PLAN_MAP in src/lib/rolePlanMap.ts, you MUST also
 * update the "Layer A" table in MAIPROP_PLATFORM_REFERENCE.md and the
 * matching expectations below. This test is the single guard against
 * silent pricing drift between code and the platform reference doc.
 *
 * Drift policy:
 *   1. Update src/lib/rolePlanMap.ts.
 *   2. Update MAIPROP_PLATFORM_REFERENCE.md §3 Layer A table.
 *   3. Update this snapshot.
 *   4. Verify create-checkout's Stripe Price IDs in env reflect the new
 *      amount (the displayed price is FALLBACK; Stripe is authoritative).
 */
describe("ROLE_PLAN_MAP canonical pricing snapshot", () => {
  it("matches the documented Layer A table in MAIPROP_PLATFORM_REFERENCE.md", () => {
    const snapshot = {
      participant:   { planKey: "pro",                    monthlyPrice: 29,   annualPrice: 290,   proOnly: false },
      agent:         { planKey: "agent_basic",            monthlyPrice: 149,  annualPrice: 1490,  proOnly: false },
      developer:     { planKey: "developer_pro",          monthlyPrice: 129,  annualPrice: 1290,  proOnly: true  },
      professional:  { planKey: "professional_basic",     monthlyPrice: 69,   annualPrice: 690,   proOnly: false },
      investor:      { planKey: "investor_private",       monthlyPrice: 490,  annualPrice: 4900,  proOnly: true  },
      institutional: { planKey: "investor_institutional", monthlyPrice: 1490, annualPrice: 14900, proOnly: true  },
    };
    for (const [audience, expected] of Object.entries(snapshot)) {
      const actual = ROLE_PLAN_MAP[audience as keyof typeof ROLE_PLAN_MAP];
      expect(actual.planKey,       `${audience}.planKey`).toBe(expected.planKey);
      expect(actual.monthlyPrice,  `${audience}.monthlyPrice`).toBe(expected.monthlyPrice);
      expect(actual.annualPrice,   `${audience}.annualPrice`).toBe(expected.annualPrice);
      expect(actual.proOnly,       `${audience}.proOnly`).toBe(expected.proOnly);
    }
  });
});
