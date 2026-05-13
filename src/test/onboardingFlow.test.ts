import { describe, expect, it } from "vitest";
import { canRestoreDraftStep, isOnboardingStep, resolveStepsFor } from "@/lib/onboardingFlow";
import { participants } from "@/lib/onboardingConfig";

describe("onboarding flow helpers", () => {
  it("recognizes only valid onboarding steps", () => {
    expect(isOnboardingStep("pro-services")).toBe(true);
    expect(isOnboardingStep("unknown-module")).toBe(false);
    expect(isOnboardingStep(null)).toBe(false);
  });

  it("rejects draft steps that do not belong to the selected participant module", () => {
    const buyer = participants.find((participant) => participant.id === "buyer") ?? null;
    const professional = participants.find((participant) => participant.id === "professional") ?? null;
    expect(buyer).not.toBeNull();
    expect(professional).not.toBeNull();

    expect(canRestoreDraftStep("pro-services", buyer)).toBe(false);
    expect(canRestoreDraftStep("pro-services", professional)).toBe(true);
  });

  it("only restores the safe first step without a selected participant", () => {
    expect(resolveStepsFor(null)).toEqual(["pick-type", "done"]);
    expect(canRestoreDraftStep("pick-type", null)).toBe(true);
    expect(canRestoreDraftStep("done", null)).toBe(false);
  });

  it("keeps developer onboarding on the developer setup path", () => {
    const developer = participants.find((participant) => participant.id === "developer") ?? null;
    expect(developer).not.toBeNull();

    expect(resolveStepsFor(developer)).toEqual(["pick-type", "developer-setup", "done"]);
  });

  it("keeps buyer, seller, and agent drafts on their active module paths", () => {
    const buyer = participants.find((participant) => participant.id === "buyer") ?? null;
    const seller = participants.find((participant) => participant.id === "seller") ?? null;
    const agent = participants.find((participant) => participant.id === "agent") ?? null;
    expect(buyer).not.toBeNull();
    expect(seller).not.toBeNull();
    expect(agent).not.toBeNull();

    expect(resolveStepsFor(buyer)).toEqual(["pick-participant-goal", "done"]);
    expect(resolveStepsFor(seller)).toEqual(["pick-participant-goal", "done"]);
    expect(resolveStepsFor(agent)).toEqual(["pick-pro-type", "done"]);
  });
});
