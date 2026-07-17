/**
 * Tests for the route guards:
 *   - ProtectedRoute      → auth presence + onboarding redirect
 *   - AdminRoute          → ProtectedRoute ∩ profile.role === 'admin'
 *   - SellerRoute         → ProtectedRoute ∩ sell-side role (+ Pro for developer)
 *   - InvestorRoute       → ProtectedRoute ∩ Quick-Sale eligibility
 *   - DeveloperRoute      → ProtectedRoute ∩ developer role + developer pro
 *   - NewBuildingRoute    → ProtectedRoute ∩ developer role + developer pro
 *
 * Strategy: mock useAuth + useSubscription + useEligibleForQuickSale at the
 * module boundary, then render each guard inside a MemoryRouter so the
 * <Navigate> redirects produce something we can detect via the route table.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";

const { useAuthMock, useSubscriptionMock, useEligibleMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  useEligibleMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => useSubscriptionMock(),
}));
vi.mock("@/hooks/useEligibleForQuickSale", () => ({
  useEligibleForQuickSale: () => useEligibleMock(),
}));

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { SellerRoute } from "@/components/SellerRoute";
import { DeveloperRoute } from "@/components/DeveloperRoute";
import { InvestorRoute } from "@/components/InvestorRoute";
import { NewBuildingRoute } from "@/components/NewBuildingRoute";

/**
 * Renders the guarded route at /private inside a memory router and provides
 * stub destinations for /login, /onboarding, /dashboard, /pricing so we can
 * assert which redirect the guard issued.
 */
function renderGuarded(guard: React.ReactElement, initial: string = "/private") {
  return render(
    <MemoryRouter initialEntries={[initial]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/private" element={guard} />
        <Route path="/dashboard/settings" element={guard} />
        <Route path="/login" element={<div>at-login</div>} />
        <Route path="/onboarding" element={<div>at-onboarding</div>} />
        <Route path="/dashboard" element={<div>at-dashboard</div>} />
        <Route path="/pricing" element={<div>at-pricing</div>} />
        <Route path="/pricing/developer" element={<div>at-pricing-developer</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthMock.mockReset();
  useSubscriptionMock.mockReset();
  useEligibleMock.mockReset();
  // Conservative defaults — every guard test overrides what it needs.
  useSubscriptionMock.mockReturnValue({ isPro: false, hasDeveloperPro: false, loading: false });
  useEligibleMock.mockReturnValue({ eligible: false, isPro: false, loading: false });
});

// ─── ProtectedRoute ─────────────────────────────────────────────────────────

describe("ProtectedRoute", () => {
  it("renders a loading spinner while auth is still loading", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: true,
      profileLoading: false,
      needsOnboarding: false,
    });
    const { container } = renderGuarded(
      <ProtectedRoute>
        <div>SECRET</div>
      </ProtectedRoute>,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("SECRET")).toBeNull();
  });

  it("renders authenticated children while the profile is still loading to avoid post-login full-screen lag", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      loading: false,
      profileLoading: true,
      needsOnboarding: false,
    });
    const { container } = renderGuarded(
      <ProtectedRoute>
        <div>SECRET</div>
      </ProtectedRoute>,
    );
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });

  it("redirects to /login when there is no user", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <ProtectedRoute>
        <div>SECRET</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("at-login")).toBeInTheDocument();
  });

  it("redirects to /onboarding when needsOnboarding=true and not already on /onboarding", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      loading: false,
      profileLoading: false,
      needsOnboarding: true,
    });
    renderGuarded(
      <ProtectedRoute>
        <div>SECRET</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("at-onboarding")).toBeInTheDocument();
  });

  it("does NOT loop when the user is already on /onboarding even if needsOnboarding=true", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      loading: false,
      profileLoading: false,
      needsOnboarding: true,
    });
    render(
      <MemoryRouter initialEntries={["/onboarding"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <div>ONBOARDING-CHILD</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("ONBOARDING-CHILD")).toBeInTheDocument();
  });

  it("allows account settings while needsOnboarding=true so account deletion remains reachable", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      loading: false,
      profileLoading: false,
      needsOnboarding: true,
    });
    renderGuarded(
      <ProtectedRoute>
        <div>ACCOUNT-SETTINGS</div>
      </ProtectedRoute>,
      "/dashboard/settings",
    );
    expect(screen.getByText("ACCOUNT-SETTINGS")).toBeInTheDocument();
  });

  it("renders children when authenticated and not in onboarding", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <ProtectedRoute>
        <div>SECRET</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });
});

// ─── AdminRoute ─────────────────────────────────────────────────────────────

describe("AdminRoute", () => {
  it("blocks unauthenticated visitors at the ProtectedRoute layer", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <AdminRoute>
        <div>ADMIN</div>
      </AdminRoute>,
    );
    expect(screen.getByText("at-login")).toBeInTheDocument();
  });

  it("shows a spinner while the profile is still arriving", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: null,
      loading: true,
      profileLoading: false,
      needsOnboarding: false,
    });
    const { container } = renderGuarded(
      <AdminRoute>
        <div>ADMIN</div>
      </AdminRoute>,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("redirects non-admin users to /dashboard", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <AdminRoute>
        <div>ADMIN</div>
      </AdminRoute>,
    );
    expect(screen.getByText("at-dashboard")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN")).toBeNull();
  });

  it("renders children when profile.role === 'admin'", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "admin" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <AdminRoute>
        <div>ADMIN</div>
      </AdminRoute>,
    );
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });
});

// ─── SellerRoute ────────────────────────────────────────────────────────────

describe("SellerRoute", () => {
  it("blocks unauthenticated visitors at the ProtectedRoute layer", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText("at-login")).toBeInTheDocument();
  });

  it("shows a spinner while subscription is still loading", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "seller", participant_type: "seller" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: false, loading: true });
    const { container } = renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows the 'Listing Access Required' upsell to buy-side roles", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Listing Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });

  it("renders children for an Agent profile", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText("LIST-FORM")).toBeInTheDocument();
  });

  it("blocks Developer accounts without a Pro subscription with the Pro upsell", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: false, loading: false });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });

  it("blocks stale Developer roles when participant_type is missing even if subscription is Pro", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: null },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });

  it("blocks mismatched Developer profiles even if subscription is Pro", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "seller" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });

  it("blocks stale developer participant_type on non-developer roles", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "seller", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });

  it("admits Developer accounts with an active Pro subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText("LIST-FORM")).toBeInTheDocument();
  });

  it("admits platform admins regardless of role/subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "admin", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText("LIST-FORM")).toBeInTheDocument();
  });

  it("does not keep listing access while the previous role is being switched away", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: {
        user_id: "u-1",
        role: "seller",
        participant_type: "seller",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <SellerRoute>
        <div>LIST-FORM</div>
      </SellerRoute>,
    );
    expect(screen.getByText(/Listing Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("LIST-FORM")).toBeNull();
  });
});

// ─── DeveloperRoute ─────────────────────────────────────────────────────────

describe("DeveloperRoute", () => {
  const renderDeveloperRoute = () => renderWithProviders(
    <Routes>
      <Route
        path="/private"
        element={(
          <DeveloperRoute>
            <div>PROJECTS</div>
          </DeveloperRoute>
        )}
      />
      <Route path="/login" element={<div>at-login</div>} />
      <Route path="/dashboard" element={<div>at-dashboard</div>} />
      <Route path="/dashboard/settings" element={<div>at-settings</div>} />
      <Route path="/pricing" element={<div>at-pricing</div>} />
      <Route path="/onboarding" element={<div>at-onboarding</div>} />
    </Routes>,
    { initialPath: "/private" },
  );

  it("blocks unauthenticated visitors at the ProtectedRoute layer", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderDeveloperRoute();
    expect(screen.getByText("at-login")).toBeInTheDocument();
  });

  it("shows a recovery view when an authenticated user has no resolved profile", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderDeveloperRoute();
    expect(screen.getByText(/Profile Required/i)).toBeInTheDocument();
    expect(screen.queryByText("PROJECTS")).toBeNull();
  });

  it("blocks non-developer Pro accounts from developer modules", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, hasDeveloperPro: false, loading: false });
    renderDeveloperRoute();
    expect(screen.getByText(/Developer Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("PROJECTS")).toBeNull();
  });

  it("blocks Developer accounts without Pro", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: false, hasDeveloperPro: false, loading: false });
    renderDeveloperRoute();
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("PROJECTS")).toBeNull();
  });

  it("blocks Developer accounts with a non-developer Pro subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, hasDeveloperPro: false, loading: false });
    renderDeveloperRoute();
    expect(screen.getByText(/Developer Pro Required/i)).toBeInTheDocument();
    expect(screen.queryByText("PROJECTS")).toBeNull();
  });

  it("admits Developer accounts with an active Developer Pro subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, hasDeveloperPro: true, loading: false });
    renderDeveloperRoute();
    expect(screen.getByText("PROJECTS")).toBeInTheDocument();
  });

  it("admits platform admins regardless of role/subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "admin", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderDeveloperRoute();
    expect(screen.getByText("PROJECTS")).toBeInTheDocument();
  });
});

// ─── InvestorRoute ──────────────────────────────────────────────────────────

describe("InvestorRoute", () => {
  it("blocks unauthenticated visitors at the ProtectedRoute layer", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    renderGuarded(
      <InvestorRoute>
        <div>QUICK-SALE</div>
      </InvestorRoute>,
    );
    expect(screen.getByText("at-login")).toBeInTheDocument();
  });

  it("shows a spinner while eligibility is still loading", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useEligibleMock.mockReturnValue({ eligible: false, isPro: false, loading: true });
    const { container } = renderGuarded(
      <InvestorRoute>
        <div>QUICK-SALE</div>
      </InvestorRoute>,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("lets any signed-in ineligible account apply without Participant Pro", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useEligibleMock.mockReturnValue({ eligible: false, isPro: false, loading: false });
    renderGuarded(
      <InvestorRoute>
        <div>QUICK-SALE</div>
      </InvestorRoute>,
    );
    expect(screen.getByText(/Investor Access Required/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upgrade to Pro to apply/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Apply for investor access/i }));
    expect(screen.getByRole("dialog", { name: /Request Quick Sale access/i })).toBeInTheDocument();
    expect(screen.queryByText("QUICK-SALE")).toBeNull();
  });

  it("lets ineligible Pro accounts open the investor access application", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "pro@example.com" },
      profile: { user_id: "u-1", role: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useEligibleMock.mockReturnValue({ eligible: false, isPro: true, loading: false });
    renderGuarded(
      <InvestorRoute>
        <div>QUICK-SALE</div>
      </InvestorRoute>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply for investor access/i }));
    expect(screen.getByRole("dialog", { name: /Request Quick Sale access/i })).toBeInTheDocument();
    expect(screen.queryByText("QUICK-SALE")).toBeNull();
  });

  it("renders children for eligible investors", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "investor" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useEligibleMock.mockReturnValue({ eligible: true, isPro: true, loading: false });
    renderGuarded(
      <InvestorRoute>
        <div>QUICK-SALE</div>
      </InvestorRoute>,
    );
    expect(screen.getByText("QUICK-SALE")).toBeInTheDocument();
  });
});

describe("DeveloperRoute", () => {
  it("blocks a stale developer profile during role switch", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: {
        user_id: "u-1",
        role: "developer",
        participant_type: "developer",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ hasDeveloperPro: true, loading: false });
    renderGuarded(
      <DeveloperRoute>
        <div>PROJECTS</div>
      </DeveloperRoute>,
    );
    expect(screen.getByText(/Developer Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("PROJECTS")).toBeNull();
  });
});

describe("NewBuildingRoute", () => {
  it("admits platform admins regardless of developer subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "admin", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: false, hasDeveloperPro: false, loading: false });
    renderGuarded(
      <NewBuildingRoute>
        <div>NEW-BUILDING</div>
      </NewBuildingRoute>,
    );
    expect(screen.getByText("NEW-BUILDING")).toBeInTheDocument();
  });

  it("admits Developer accounts with an active Developer Pro subscription", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "developer", participant_type: "developer" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, hasDeveloperPro: true, loading: false });
    renderGuarded(
      <NewBuildingRoute>
        <div>NEW-BUILDING</div>
      </NewBuildingRoute>,
    );
    expect(screen.getByText("NEW-BUILDING")).toBeInTheDocument();
  });

  it("blocks non-developer Pro accounts from off-plan creation", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { user_id: "u-1", role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ isPro: true, hasDeveloperPro: false, loading: false });
    renderGuarded(
      <NewBuildingRoute>
        <div>NEW-BUILDING</div>
      </NewBuildingRoute>,
    );
    expect(screen.getByText(/Developer Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("NEW-BUILDING")).toBeNull();
  });

  it("blocks off-plan creation while a developer switch is still in progress", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: {
        user_id: "u-1",
        role: "developer",
        participant_type: "developer",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      },
      loading: false,
      profileLoading: false,
      needsOnboarding: false,
    });
    useSubscriptionMock.mockReturnValue({ hasDeveloperPro: true, loading: false });
    renderGuarded(
      <NewBuildingRoute>
        <div>NEW-BUILDING</div>
      </NewBuildingRoute>,
    );
    expect(screen.getByText(/Developer Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText("NEW-BUILDING")).toBeNull();
  });
});
