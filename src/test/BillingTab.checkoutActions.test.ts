import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createAddonCheckoutUrl,
  createSubscriptionCheckoutUrl,
  formatBillingAmount,
} from "@/pages/dashboard/billing/checkoutActions";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

describe("billing checkout actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts Stripe add-on checkout with canonical billing redirect paths", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/session" },
      error: null,
    });

    await expect(createAddonCheckoutUrl("valuation_single")).resolves.toBe(
      "https://stripe.example/session",
    );

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        addon_key: "valuation_single",
        success_url: "/dashboard/billing?checkout=success",
        cancel_url: "/dashboard/billing?checkout=cancelled",
      },
    });
  });

  it("starts Stripe subscription checkout from the billing page", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/subscription-session" },
      error: null,
    });

    await expect(
      createSubscriptionCheckoutUrl("agent_basic", { billingCycle: "annual" }),
    ).resolves.toBe("https://stripe.example/subscription-session");

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        plan: "agent_basic",
        billing_cycle: "annual",
        success_url: "/dashboard/billing?checkout=success",
        cancel_url: "/dashboard/billing?checkout=cancelled",
      },
    });
  });

  it("can attach resource targets to add-on checkout payloads", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/targeted-session" },
      error: null,
    });

    await expect(
      createAddonCheckoutUrl("property_report_single", {
        targetType: "listing",
        targetId: "listing_123",
      }),
    ).resolves.toBe("https://stripe.example/targeted-session");

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        addon_key: "property_report_single",
        target_type: "listing",
        target_id: "listing_123",
        success_url: "/dashboard/billing?checkout=success",
        cancel_url: "/dashboard/billing?checkout=cancelled",
      },
    });
  });

  it("can override add-on checkout return paths for resource-specific purchases", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/property-report-session" },
      error: null,
    });

    await expect(
      createAddonCheckoutUrl("property_report_single", {
        targetType: "listing",
        targetId: "listing_123",
        successUrl: "/property/listing_123?checkout=success&addon=property_report_single&target_id=listing_123",
        cancelUrl: "/property/listing_123?checkout=cancelled&addon=property_report_single&target_id=listing_123",
      }),
    ).resolves.toBe("https://stripe.example/property-report-session");

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        addon_key: "property_report_single",
        target_type: "listing",
        target_id: "listing_123",
        success_url: "/property/listing_123?checkout=success&addon=property_report_single&target_id=listing_123",
        cancel_url: "/property/listing_123?checkout=cancelled&addon=property_report_single&target_id=listing_123",
      },
    });
  });

  it("can attach a requested add-on quantity to checkout payloads", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/multi-credit-session" },
      error: null,
    });

    await expect(
      createAddonCheckoutUrl("valuation_single", { quantity: 3 }),
    ).resolves.toBe("https://stripe.example/multi-credit-session");

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        addon_key: "valuation_single",
        quantity: 3,
        success_url: "/dashboard/billing?checkout=success",
        cancel_url: "/dashboard/billing?checkout=cancelled",
      },
    });
  });

  it("surfaces checkout errors without changing add-on gating state locally", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { error: "Plan is not eligible for this add-on" },
      error: null,
    });

    await expect(createAddonCheckoutUrl("api_access")).rejects.toThrow(
      "Plan is not eligible for this add-on",
    );
  });

  it("formats billing amounts in the dashboard currency display", () => {
    expect(formatBillingAmount(29, "EUR")).toBe("29,00\u00a0€");
  });
});
