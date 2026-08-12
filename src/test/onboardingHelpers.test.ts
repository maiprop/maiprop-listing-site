import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BACK_STEP_BY_STEP,
  clearRoleSwitchOperation,
  extractStripeError,
  isFirstOnboardingFor,
  isProfessionalCategory,
  markRoleSwitchOperationBegun,
  parseServiceRate,
  prepareRoleSwitchOperation,
  readRoleSwitchCtx,
  ROLE_SWITCH_OPERATION_STORAGE_KEY,
  resolvePresetType,
} from "@/pages/onboarding/onboardingHelpers";

describe("onboardingHelpers", () => {
  const firstUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeEach(() => {
    window.localStorage.clear();
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
    window.sessionStorage.setItem("role_switch_ctx", JSON.stringify({
      userId: firstUserId,
      fromType: "buyer",
      toType: "seller",
      hadActiveSub: true,
      auditId: "11111111-1111-4111-8111-111111111111",
      status: "prepared",
    }));
    expect(readRoleSwitchCtx(firstUserId)).toEqual({
      userId: firstUserId,
      fromType: "buyer",
      toType: "seller",
      hadActiveSub: true,
      auditId: "11111111-1111-4111-8111-111111111111",
      status: "prepared",
    });

    window.sessionStorage.setItem("role_switch_ctx", "{bad");
    expect(readRoleSwitchCtx(firstUserId)).toBeNull();
  });

  it("durably persists one operation UUID and exposes its prepared and begun states", () => {
    const operationId = "11111111-1111-4111-8111-111111111111";
    const now = Date.now();
    const first = prepareRoleSwitchOperation({
      userId: firstUserId,
      fromType: "agent",
      toType: "seller",
      hadActiveSub: true,
      now,
      createId: () => operationId,
    });

    expect(first.operationId).toBe(operationId);
    expect(window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY)).toContain(operationId);
    expect(readRoleSwitchCtx(firstUserId)).toEqual({
      userId: firstUserId,
      fromType: "agent",
      toType: "seller",
      hadActiveSub: true,
      auditId: operationId,
      status: "prepared",
    });

    const recovered = prepareRoleSwitchOperation({
      userId: firstUserId,
      fromType: "agent",
      toType: "seller",
      hadActiveSub: true,
      now: now + 1_000,
      createId: () => "22222222-2222-4222-8222-222222222222",
    });
    expect(recovered.operationId).toBe(operationId);

    markRoleSwitchOperationBegun(operationId, firstUserId);
    expect(readRoleSwitchCtx(firstUserId)).toEqual({
      userId: firstUserId,
      fromType: "agent",
      toType: "seller",
      hadActiveSub: true,
      auditId: operationId,
      status: "begun",
    });

    clearRoleSwitchOperation(operationId, firstUserId);
    expect(window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY)).toBeNull();
  });

  it("never exposes or reuses another authenticated user's durable operation", () => {
    const firstOperationId = "11111111-1111-4111-8111-111111111111";
    const secondOperationId = "22222222-2222-4222-8222-222222222222";
    const now = Date.now();

    prepareRoleSwitchOperation({
      userId: firstUserId,
      fromType: "buyer",
      toType: "seller",
      hadActiveSub: true,
      now,
      createId: () => firstOperationId,
    });
    markRoleSwitchOperationBegun(firstOperationId, firstUserId);
    window.sessionStorage.setItem("role_switch_ctx", JSON.stringify({
      userId: firstUserId,
      fromType: "buyer",
      toType: "seller",
      hadActiveSub: true,
      auditId: firstOperationId,
      status: "begun",
    }));

    expect(readRoleSwitchCtx(secondUserId)).toBeNull();

    const second = prepareRoleSwitchOperation({
      userId: secondUserId,
      fromType: "buyer",
      toType: "agent",
      hadActiveSub: false,
      now: now + 1_000,
      createId: () => secondOperationId,
    });
    expect(second.operationId).toBe(secondOperationId);
    expect(second.userId).toBe(secondUserId);
    expect(window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY)).not.toContain(firstOperationId);
  });

  it("returns null instead of throwing when browser storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });

    expect(() => readRoleSwitchCtx(firstUserId)).not.toThrow();
    expect(readRoleSwitchCtx(firstUserId)).toBeNull();
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
