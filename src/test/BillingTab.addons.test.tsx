import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BillingTab from "@/pages/dashboard/BillingTab";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof import("@/test/utils").makeMockSupabase> | null,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  mocks.supabase = makeMockSupabase();
  return { supabase: mocks.supabase };
});

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn(() => ({
    isPro: true,
    subscriptionEnd: null,
    loading: false,
    accessSource: "stripe",
    hasStripeBilling: true,
    isInvestorManagedPlan: false,
    isManuallyManagedPlan: false,
  })),
}));

const authState = {
  profile: {
    role: "seller",
    participant_type: "seller",
  },
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("BillingTab add-on checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: null,
          },
          error: null,
        });
      }
      if (fn === "create-checkout") {
        return Promise.resolve({
          data: { url: "https://checkout.stripe.test/session" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("shows seller-relevant add-ons and starts Stripe checkout for the selected add-on key", async () => {
    renderWithProviders(<BillingTab />);

    const featuredCard = (await screen.findByText("Featured Listing")).closest("div");
    expect(featuredCard).not.toBeNull();
    fireEvent.click(within(featuredCard as HTMLElement).getByRole("button", { name: /Buy add-on/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "featured_listing",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
      });
    });

    expect(screen.queryByText("Extra Agent Seat")).not.toBeInTheDocument();
    expect(screen.queryByText("API Access")).not.toBeInTheDocument();
  });
});
