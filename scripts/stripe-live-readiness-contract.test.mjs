import { describe, expect, it } from "vitest";
import {
  assessPaymentMethodConfigurations,
  assertRestrictedKeyWriteDenied,
} from "./stripe-live-readiness-contract.mjs";

function configuration(overrides = {}) {
  return {
    id: "pmc_live_default",
    active: true,
    livemode: true,
    is_default: true,
    application: null,
    card: {
      available: true,
      display_preference: { value: "on" },
    },
    link: {
      available: true,
      display_preference: { value: "on" },
    },
    ...overrides,
  };
}

describe("Stripe live readiness contracts", () => {
  it("accepts an active live direct configuration with card enabled", () => {
    const result = assessPaymentMethodConfigurations([configuration()]);
    expect(result.ok).toBe(true);
    expect(result.configuration_id).toBe("pmc_live_default");
    expect(result.enabled_payment_methods).toContain("card");
  });

  it.each([
    ["no configuration", []],
    ["inactive", [configuration({ active: false })]],
    ["test mode", [configuration({ livemode: false })]],
    ["non-default", [configuration({ is_default: false })]],
    ["child configuration", [configuration({ application: "ca_123" })]],
    ["card unavailable", [configuration({ card: { available: false, display_preference: { value: "off" } } })]],
  ])("rejects %s", (_label, configurations) => {
    expect(assessPaymentMethodConfigurations(configurations).ok).toBe(false);
  });

  it("accepts only an explicit Stripe permission denial for the write probe", () => {
    expect(assertRestrictedKeyWriteDenied({
      status: 403,
      body: { error: { type: "invalid_request_error" } },
    })).toEqual({ denied: true, status: 403 });
    expect(() => assertRestrictedKeyWriteDenied({
      status: 404,
      body: { error: { code: "resource_missing" } },
    })).toThrow(/write permission/i);
    expect(() => assertRestrictedKeyWriteDenied({
      status: 200,
      body: {},
    })).toThrow(/write permission/i);
  });
});
