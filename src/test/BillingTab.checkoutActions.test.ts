import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAddonCheckoutUrl, formatBillingAmount } from "@/pages/dashboard/billing/checkoutActions";

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

    await expect(createAddonCheckoutUrl("featured_listing")).resolves.toBe(
      "https://stripe.example/session",
    );

    expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
      body: {
        addon_key: "featured_listing",
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
