import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  const cachedDeals = Array.from({ length: 4 }, (_, index) => ({
    id: `cached-${index}`,
    address: `Cached Deal ${index}`,
    city: "Athens",
    property_type: "apartment",
    sqm: 80,
    bedrooms: null,
    condition: null,
    ai_estimate: 120_000,
    asking_price: 100_000,
    price_per_sqm: 1_250,
    discount_pct: 16.7,
    value_spread_pct: 16.7,
    status: "reviewed",
    created_at: "2026-07-13T00:00:00Z",
    urgency: "HIGH",
    reason: "Below market value",
  }));
  return {
    ...actual,
    useQuery: (options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === "investor-subscription") return { data: null };
      if (options.queryKey[0] === "invitation-status") return { data: "none" };
      if (options.queryKey[0] === "investor-deal-feed") {
        return { data: cachedDeals, isError: false, isLoading: false, refetch: vi.fn() };
      }
      return { data: null };
    },
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  profileRoleSwitchInProgress: () => false,
  useAuth: () => ({
    user: { id: "buyer-1", email: "buyer@example.com" },
    profile: { id: "buyer-1", role: "buyer", participant_type: "buyer" },
    subscription: {
      subscribed: false,
      productId: null,
      subscriptionEnd: null,
      source: "database",
      syncStatus: "synced",
      loading: false,
    },
    refreshSubscription: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/useFiresaleInterest", () => ({
  hasPriorityProof: () => false,
  isActiveReservation: () => false,
  useMyFiresaleInterests: () => ({ data: new Map() }),
  useExpressInterest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    isPro: false,
    isInvestorManagedPlan: false,
    subscriptionEnd: null,
    loading: false,
  }),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/InvitationRequestModal", () => ({ InvitationRequestModal: () => null }));
vi.mock("@/components/investor/InvestorHeroHeader", () => ({
  InvestorHeroHeader: () => <header>Investor overview</header>,
}));
vi.mock("@/components/investor/InvestorExpiryBanner", () => ({ InvestorExpiryBanner: () => null }));
vi.mock("@/components/investor/InvestorAccessGate", () => ({
  InvestorAccessGate: () => <div>Access payment required</div>,
}));
vi.mock("@/components/investor/InvestorSidebarAnalytics", () => ({
  InvestorSidebarAnalytics: () => <aside />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import InvestorDashboard from "@/pages/InvestorDashboard";

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.invalidateQueries.mockReset();
});

describe("InvestorDashboard cached authorization gate", () => {
  it("never exposes cached paid deals after the account loses investor entitlement", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvestorDashboard />
      </MemoryRouter>,
    );

    expect(screen.getByText("Access payment required")).toBeInTheDocument();
    expect(screen.getByTestId("investor-deal-list")).toBeEmptyDOMElement();
    expect(screen.queryByText("Cached Deal 0")).not.toBeInTheDocument();
    expect(screen.queryByText("Subscribe to unlock this deal")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock Deal Flow" })).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
