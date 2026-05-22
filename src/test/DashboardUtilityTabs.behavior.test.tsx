import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillingTab from "@/pages/dashboard/BillingTab";
import AuctionsTab from "@/pages/dashboard/AuctionsTab";
import { SettingsSection } from "@/components/dashboard/SettingsSection";
import Signup from "@/pages/Signup";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
  useAuth: vi.fn(),
  useSubscription: vi.fn(),
  useAuctionAlerts: vi.fn(),
  useDeleteAuctionAlert: vi.fn(),
  useUpdateAuctionAlert: vi.fn(),
  usePrivateOwnerAdAlert: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  analytics: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
      signInWithOAuth: (...args: unknown[]) => mocks.signInWithOAuth(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => mocks.useSubscription() }));
vi.mock("@/hooks/useAuctionAlerts", () => ({
  useAuctionAlerts: () => mocks.useAuctionAlerts(),
  useDeleteAuctionAlert: () => mocks.useDeleteAuctionAlert(),
  useUpdateAuctionAlert: () => mocks.useUpdateAuctionAlert(),
}));
vi.mock("@/hooks/usePrivateOwnerAdAlert", () => ({ usePrivateOwnerAdAlert: () => mocks.usePrivateOwnerAdAlert() }));
vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: ({ open, editAlert, onClose }: { open: boolean; editAlert?: { id: string } | null; onClose: () => void }) =>
    open ? <button data-testid="auction-modal" onClick={onClose}>{editAlert ? `editing-${editAlert.id}` : "new-alert"}</button> : null,
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: (...args: unknown[]) => mocks.analytics(...args) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderHarness(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const billingInfo = {
  billing_configured: true,
  customer_found: true,
  portal_eligible: true,
  subscription: {
    id: "sub_1",
    status: "active",
    current_period_end: "2026-06-01",
    cancel_at_period_end: false,
    plan_name: "Agent Pro",
    amount: 2900,
    currency: "EUR",
    interval: "month",
  },
  invoices: [
    {
      id: "inv_1",
      number: "INV-001",
      status: "paid",
      amount_paid: 2900,
      currency: "EUR",
      created: "2026-05-01",
      period_start: "2026-05-01",
      period_end: "2026-06-01",
      hosted_invoice_url: "https://stripe.example/invoice",
      invoice_pdf: "https://stripe.example/invoice.pdf",
      description: "May",
    },
    {
      id: "inv_2",
      number: null,
      status: "uncollectible",
      amount_paid: 0,
      currency: "EUR",
      created: "2026-04-01",
      period_start: null,
      period_end: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      description: null,
    },
  ],
};

describe("dashboard utility tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", { writable: true, value: { href: "http://localhost/dashboard/billing" } });
    sessionStorage.clear();
    mocks.useAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { participant_type: "agent", role: "agent" },
      signUp: vi.fn(),
      loading: false,
      refreshProfile: vi.fn(),
    });
    mocks.useSubscription.mockReturnValue({
      isPro: true,
      loading: false,
      hasStripeBilling: true,
      isInvestorManagedPlan: false,
      isManuallyManagedPlan: false,
      subscriptionEnd: null,
      accessSource: "stripe",
    });
    mocks.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") return Promise.resolve({ data: billingInfo, error: null });
      if (fn === "customer-portal") return Promise.resolve({ data: { url: "https://stripe.example/portal" }, error: null });
      if (fn === "create-checkout") return Promise.resolve({ data: { url: "https://stripe.example/addon" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    mocks.useAuctionAlerts.mockReturnValue({ data: [], isLoading: false });
    mocks.useDeleteAuctionAlert.mockReturnValue({ mutate: vi.fn() });
    mocks.useUpdateAuctionAlert.mockReturnValue({ mutate: vi.fn() });
    mocks.usePrivateOwnerAdAlert.mockReturnValue({ isEnabled: false, toggle: { mutate: vi.fn(), isPending: false } });
  });

  it("manages billing portal, addon checkout, invoice states, refresh, and non-Stripe/manual plans", async () => {
    renderHarness(<BillingTab />);

    expect(await screen.findByText("Agent Pro")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Manage billing/i })[0]);
    await waitFor(() => expect(window.location.href).toBe("https://stripe.example/portal"));

    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(mocks.invoke).toHaveBeenCalledWith("get-invoices");

    fireEvent.click(screen.getAllByRole("button", { name: /Buy add-on/i })[0]);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", expect.objectContaining({
      body: expect.objectContaining({ addon_key: "featured_listing" }),
    })));

    mocks.invoke.mockImplementationOnce((fn: string) => (
      fn === "create-checkout"
        ? Promise.resolve({ data: { error: "checkout down" }, error: null })
        : Promise.resolve({ data: billingInfo, error: null })
    ));
    fireEvent.click(screen.getAllByRole("button", { name: /Buy add-on/i })[1]);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("checkout down"));

    mocks.useSubscription.mockReturnValue({
      isPro: true,
      loading: false,
      hasStripeBilling: false,
      isInvestorManagedPlan: true,
      isManuallyManagedPlan: false,
      accessSource: "investor",
    });
    mocks.useAuth.mockReturnValue({ profile: { participant_type: "investor", role: "investor" } });
    mocks.invoke.mockResolvedValue({ data: { ...billingInfo, subscription: null, invoices: [], portal_eligible: false, customer_found: false }, error: null });
    renderHarness(<BillingTab />);
    expect(await screen.findByText(/Investor managed plan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Managed by maiProp/i }));
    expect(mocks.toast.info).not.toHaveBeenCalledWith(expect.stringContaining("Could not"));
  });

  it("covers auction-alert empty, loading, list, edit, toggle, delete, and private-owner branches", async () => {
    const deleteMutate = vi.fn();
    const updateMutate = vi.fn();
    const privateMutate = vi.fn();
    mocks.useAuctionAlerts.mockReturnValueOnce({ data: [], isLoading: true });
    renderHarness(<AuctionsTab />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    cleanup();

    mocks.useAuctionAlerts.mockReturnValueOnce({ data: [], isLoading: false });
    renderHarness(<AuctionsTab />);
    fireEvent.click(screen.getByRole("button", { name: /Create First Alert/i }));
    expect(screen.getByTestId("auction-modal")).toHaveTextContent("new-alert");
    cleanup();

    const alert = {
      id: "alert-1",
      city: "Athens",
      property_type: "apartment",
      min_price: 100000,
      max_price: 250000,
      court_name: "Athens Court",
      active: true,
      email_notify: true,
      created_at: "2026-05-01",
    };
    mocks.useAuth.mockReturnValue({ profile: { role: "agent", participant_type: "agent" } });
    mocks.useSubscription.mockReturnValue({ isPro: true });
    mocks.useAuctionAlerts.mockReturnValue({ data: [alert, { ...alert, id: "alert-2", active: false, city: null, property_type: null, min_price: null, max_price: null }], isLoading: false });
    mocks.useDeleteAuctionAlert.mockReturnValue({ mutate: deleteMutate });
    mocks.useUpdateAuctionAlert.mockReturnValue({ mutate: updateMutate });
    mocks.usePrivateOwnerAdAlert.mockReturnValue({ isEnabled: false, toggle: { mutate: privateMutate, isPending: false } });
    renderHarness(<AuctionsTab />);

    expect(await screen.findByText("Athens")).toBeInTheDocument();
    const firstAlertRow = screen.getByText("Athens").closest(".glass-card") as HTMLElement;
    const rowButtons = Array.from(firstAlertRow.querySelectorAll("button"));
    fireEvent.click(rowButtons[0]);
    expect(updateMutate).toHaveBeenCalledWith({ id: "alert-1", updates: { active: false } });
    fireEvent.click(rowButtons[1]);
    expect(screen.getByTestId("auction-modal")).toHaveTextContent("editing-alert-1");
    fireEvent.click(rowButtons[2]);
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    expect(deleteMutate).toHaveBeenCalledWith("alert-1");
    fireEvent.click(screen.getByRole("button", { name: /Enable/i }));
    expect(privateMutate).toHaveBeenCalledWith(true);
  });

  it("switches participant type, handles RPC errors, deletes accounts, and shows permission fallbacks", async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValueOnce({ error: null });
    renderHarness(<SettingsSection roleLabel="Agent" onUpdate={vi.fn()} refreshProfile={refreshProfile} currentType="agent" hasActiveSub />);

    expect(screen.getByText("Lead management")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Switch Participant Type/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch my type/i }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("begin_role_switch"));
    expect(sessionStorage.getItem("role_switch_ctx")).toContain("agent");
    expect(refreshProfile).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/onboarding");
    cleanup();

    mocks.rpc.mockResolvedValueOnce({ error: { message: "not_authenticated" } });
    renderHarness(<SettingsSection roleLabel="Unknown" onUpdate={vi.fn()} refreshProfile={refreshProfile} currentType={null} hasActiveSub={false} />);
    expect(screen.getByText(/determined server-side/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Switch Participant Type/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch my type/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Your session has expired. Please sign in again."));

    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    mocks.invoke.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /Delete account/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete my account/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("delete-account", expect.objectContaining({
      headers: { Authorization: "Bearer token" },
    })));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/");

    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    fireEvent.click(screen.getByRole("button", { name: /Delete account/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, delete my account/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not delete account. Please contact support."));
  });

  it("exercises signup validation, password visibility, confirmation view, OAuth, and error variants", async () => {
    const signUp = vi.fn()
      .mockResolvedValueOnce({ error: null, needsEmailConfirm: true })
      .mockResolvedValueOnce({ error: { message: "User already exists" } })
      .mockResolvedValueOnce({ error: { message: "over_email_send_rate_limit" } })
      .mockResolvedValueOnce({ error: { message: "Other failure" } });
    mocks.useAuth.mockReturnValue({ user: null, loading: false, signUp });
    mocks.signInWithOAuth.mockResolvedValueOnce({ error: { message: "oauth failed" } });
    renderHarness(<Signup />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "new@maiprop.co" } });
    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "short" } });
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auth.signup.createAccount/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "StrongPass1!" } });
    fireEvent.change(screen.getByPlaceholderText("Nikos"), { target: { value: "Nikos" } });
    fireEvent.change(screen.getByPlaceholderText("Papadopoulos"), { target: { value: "Tester" } });
    fireEvent.click(screen.getByRole("button", { name: /auth.signup.createAccount/i }));
    await screen.findByText("Check your inbox");
    expect(signUp).toHaveBeenCalledWith("new@maiprop.co", "StrongPass1!", { full_name: "Nikos Tester" });
    fireEvent.click(screen.getByRole("button", { name: /Use a different email/i }));

    fireEvent.click(screen.getByRole("button", { name: /auth.signup.google/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Google sign-in failed. Please try again."));

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(screen.getByPlaceholderText("Min. 8 characters")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /auth.signup.createAccount/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("An account with this email already exists.", expect.anything()));
    for (const expected of [
      "Too many attempts. Please wait a few minutes before trying again.",
      "Other failure",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: /auth.signup.createAccount/i }));
      await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expected));
    }

    mocks.useAuth.mockReturnValue({ user: { id: "u1" }, loading: false, signUp });
    renderHarness(<Signup />);
    expect(mocks.navigate).toHaveBeenCalledWith("/onboarding", { replace: true });
  });
});
