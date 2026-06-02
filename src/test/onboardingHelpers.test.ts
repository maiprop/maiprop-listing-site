import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BACK_STEP_BY_STEP,
  extractStripeError,
  isFirstOnboardingFor,
  isProfessionalCategory,
  parseServiceRate,
  readRoleSwitchCtx,
  resolvePresetType,
} from "@/pages/onboarding/onboardingHelpers";

describe("onboardingHelpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("extracts Stripe error strings from role-switch responses only when present", () => {
    expect(extractStripeError({ stripe_error: "checkout_unavailable" })).toBe("checkout_unavailable");
    expect(extractStripeError({ stripe_error: "" })).toBeNull();
    expect(extractStripeError(null)).toBeNull();
  });

  it("parses optional service rates without coercing blanks to zero", () => {
    expect(parseServiceRate("125")).toBe(125);
    expect(parseServiceRate("")).toBeNull();
    expect(parseServiceRate("abc")).toBeNull();
  });

  it("reads role-switch context defensively from sessionStorage", () => {
    window.sessionStorage.setItem("role_switch_ctx", JSON.stringify({ fromType: "buyer", hadActiveSub: true }));
    expect(readRoleSwitchCtx()).toEqual({ fromType: "buyer", hadActiveSub: true });

    window.sessionStorage.setItem("role_switch_ctx", "{bad");
    expect(readRoleSwitchCtx()).toBeNull();
  });

  it("resolves first-onboarding state from paired role and participant fields", () => {
    expect(resolvePresetType({ role: "seller", participant_type: "seller" })).toBe("seller");
    expect(resolvePresetType({ role: "buyer", participant_type: "seller" })).toBeNull();
    expect(isFirstOnboardingFor({ role: "buyer", participant_type: "seller" })).toBe(true);
  });

  it("keeps professional categories and back-step flow explicit", () => {
    expect(isProfessionalCategory("architect")).toBe(true);
    expect(isProfessionalCategory("not-a-real-category")).toBe(false);
    expect(BACK_STEP_BY_STEP["pro-services"]).toBe("pro-verify");
  });
});
