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
    const buyer = participants.find((p) => p.id === "buyer") ?? null;
    const professional = participants.find((p) => p.id === "professional") ?? null;

    expect(canRestoreDraftStep("pro-services", buyer)).toBe(false);
    expect(canRestoreDraftStep("pro-services", professional)).toBe(true);
  });

  it("keeps developer onboarding on the developer setup path", () => {
    const developer = participants.find((p) => p.id === "developer") ?? null;

    expect(resolveStepsFor(developer)).toEqual(["pick-type", "developer-setup", "done"]);
  });
});
