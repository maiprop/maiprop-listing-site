import { describe, expect, it } from "vitest";
import { participants } from "@/lib/onboardingConfig";
import { canRestoreDraftStep, isOnboardingStep, resolveStepsFor } from "@/lib/onboardingFlow";

const findParticipant = (id: string) => participants.find((p) => p.id === id) ?? null;

describe("onboardingFlow", () => {
  it("recognizes only known onboarding steps", () => {
    expect(isOnboardingStep("pro-video")).toBe(true);
    expect(isOnboardingStep("pro-services")).toBe(true);
    expect(isOnboardingStep("done")).toBe(true);
    expect(isOnboardingStep("unknown-step")).toBe(false);
    expect(isOnboardingStep(null)).toBe(false);
  });

  it("only restores the safe initial step without a participant selection", () => {
    expect(resolveStepsFor(null)).toEqual(["pick-type", "done"]);
    expect(canRestoreDraftStep(null, "pick-type")).toBe(true);
    expect(canRestoreDraftStep(null, "done")).toBe(false);
  });

  it("keeps buyer and seller drafts on the participant path", () => {
    expect(resolveStepsFor(findParticipant("buyer"))).toEqual(["pick-participant-goal", "done"]);
    expect(resolveStepsFor(findParticipant("seller"))).toEqual(["pick-participant-goal", "done"]);
    expect(canRestoreDraftStep(findParticipant("buyer"), "pro-services")).toBe(false);
  });

  it("includes the video step in the service professional path", () => {
    expect(resolveStepsFor(findParticipant("professional"))).toEqual([
      "pick-type",
      "pro-category",
      "pro-verify",
      "pro-services",
      "pro-availability",
      "pro-video",
      "done",
    ]);
    expect(canRestoreDraftStep(findParticipant("professional"), "pro-video")).toBe(true);
  });

  it("keeps developer setup on the developer path only", () => {
    expect(resolveStepsFor(findParticipant("developer"))).toEqual(["pick-type", "developer-setup", "done"]);
    expect(canRestoreDraftStep(findParticipant("developer"), "developer-setup")).toBe(true);
    expect(canRestoreDraftStep(findParticipant("agent"), "developer-setup")).toBe(false);
  });
});
