import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { fromMock, rpcMock, invokeMock, getSessionMock, getUserMock, toastMock, useAuthMock, useMyListingsMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  useAuthMock: vi.fn(),
  useMyListingsMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
  profileRoleSwitchInProgress: () => false,
}));
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => useMyListingsMock(),
}));
vi.mock("@/hooks/usePricingConfigs", () => ({
  INVESTOR_TIER_TO_KEY: { private: "private", institutional: "institutional" },
  usePricingConfigs: () => ({
    data: {
      private: { amount: 490, currency: "EUR", interval: "month" },
      institutional: { amount: 1490, currency: "EUR", interval: "month" },
    },
  }),
  formatPrice: (cfg: { amount?: number } | undefined, opts?: { fallback?: string }) =>
    cfg?.amount ? `EUR ${cfg.amount}/mo` : (opts?.fallback ?? "EUR 0"),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/AdminFiresalePipeline", () => ({ default: () => <div data-testid="admin-pipeline">Pipeline body</div> }));
vi.mock("@/components/AdminInvestorScreening", () => ({ default: () => <div data-testid="admin-investor-screening" /> }));
vi.mock("@/components/OpenHouseDashboardSection", () => ({
  default: ({ myListings }: { myListings: Array<{ title?: string }> }) => (
    <div data-testid="admin-open-houses">
      {myListings.map((listing) => listing.title).join(",")}
    </div>
  ),
}));
vi.mock("@/pages/AdminPricing", () => ({ AdminPricingContent: () => <div data-testid="admin-pricing" /> }));
vi.mock("@/components/AdminProfessionalVerification", () => ({ AdminProfessionalVerification: () => <div data-testid="admin-pro-verification" /> }));
vi.mock("@/components/POFVerificationPanel", () => ({ POFVerificationPanel: () => <div data-testid="admin-pof-review" /> }));
vi.mock("@/components/AdminReports", () => ({ default: () => <div data-testid="admin-reports" /> }));
vi.mock("@/components/AdminContactSubmissions", () => ({ default: () => <div data-testid="admin-contact-submissions" /> }));
vi.mock("@/components/AdminUserActivity", () => ({ default: () => <div data-testid="admin-user-activity" /> }));

import AdminDashboard from "@/pages/AdminDashboard";
import AdminFeaturedListings from "@/components/AdminFeaturedListings";
import AdminInvitationRequests from "@/components/AdminInvitationRequests";
import AdminSubscribers from "@/components/AdminSubscribers";
import AdminPanel from "@/components/AdminPanel";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderWithProviders(ui: React.ReactElement, initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient()}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderAdminRoute(initialPath: string) {
  return renderWithProviders(
    <Suspense fallback={<div>loading tab</div>}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Suspense>,
    initialPath,
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function thenableResult(data: unknown, error: unknown = null) {
  return {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function selectBuilder(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = thenableResult(data, error);
  b.select = vi.fn().mockReturnValue(b);
  b.order = vi.fn().mockReturnValue(b);
  b.limit = vi.fn().mockReturnValue(b);
  b.eq = vi.fn().mockReturnValue(b);
  b.not = vi.fn().mockReturnValue(b);
  b.in = vi.fn().mockReturnValue(b);
  b.gte = vi.fn().mockReturnValue(b);
  b.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  return b;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function tableBuilder(rows: Record<string, unknown[]>, updates: Record<string, unknown> = {}) {
  return (table: string) => ({
    ...selectBuilder(rows[table] ?? []),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(updates[table] ?? { error: null }),
    }),
  });
}

const request = {
  id: "req-1",
  email: "investor@example.com",
  full_name: "Iris Investor",
  phone: "210",
  company: "Acme Capital",
  job_title: "Partner",
  company_website: "https://acme.example",
  linkedin_url: "https://linkedin.example/iris",
  investment_focus: "Distressed residential",
  deal_size_range: "1m-5m",
  investment_vehicle: "Fund",
  geographic_focus: "Athens",
  aum_range: "50m",
  years_experience: "12",
  source: "referral",
  message: "Interested in off-market deals",
  user_id: "user-1",
  created_at: "2026-04-01T10:00:00Z",
  status: "pending",
};

function promotionRow(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: "listing-1",
    title: "Sea View Flat",
    city: "Athens",
    property_type: "apartment",
    listing_type: "sale",
    price: 300000,
    cover_image_url: null,
    is_featured: true,
    priority_placement: 1,
    featured_until: "2026-08-01T00:00:00Z",
    priority_until: "2026-08-02T00:00:00Z",
    status: "active",
    owner_id: "owner-1",
    seller_name: "Owner One",
    campaign_type: "spotlight",
    source_type: "admin",
    campaign_status: "active",
    starts_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-08-01T00:00:00Z",
    detail_views: 2,
    saves: 1,
    enquiries: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  fromMock.mockReset();
  rpcMock.mockReset();
  invokeMock.mockReset();
  getSessionMock.mockReset();
  getUserMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "admin-user" }, profile: { role: "admin" }, refreshProfile: vi.fn().mockResolvedValue(undefined) });
  useMyListingsMock.mockReturnValue({ data: [], isLoading: false });
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
  getUserMock.mockResolvedValue({ data: { user: { id: "admin-user" } } });
  invokeMock.mockResolvedValue({ data: { status: "ok" }, error: null });
  fromMock.mockImplementation(tableBuilder({}));
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "get_listing_management_catalogue") {
      return fromMock("listing_management_catalogue");
    }
    return Promise.resolve({ data: null, error: null });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminDashboard tab routing", () => {
  it("falls back to Pipeline for an invalid tab and routes when a tab is clicked", async () => {
    renderAdminRoute("/admin?tab=not-real");

    expect(await screen.findByTestId("admin-pipeline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Subscribers/i }));
    expect(await screen.findByText(/Transfer platform admin/i)).toBeInTheDocument();
  });

  it("opens the requested admin section from the tab query string", async () => {
    renderAdminRoute("/admin?tab=featured");

    expect(await screen.findByRole("heading", { name: /Listing Promotions/i })).toBeInTheDocument();
  });

  it("routes platform contact submissions to the admin inbox tab", async () => {
    renderAdminRoute("/admin?tab=contact-inbox");

    expect(await screen.findByTestId("admin-contact-submissions")).toBeInTheDocument();
  });

  it("routes admin user and search activity analytics to the dedicated tab", async () => {
    renderAdminRoute("/admin?tab=users-activity");

    expect(await screen.findByTestId("admin-user-activity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /User Activity/i })).toHaveClass("bg-primary");
  });

  it("loads the admin open-house listing overview", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "listing_management_catalogue") {
        return selectBuilder([
          {
            id: "oh-admin-1",
            owner_id: "other-owner",
            organization_id: null,
            title: "Non-owned Open House",
            listing_type: "open_house",
            status: "active",
            open_house_date: "2026-07-01T10:00:00Z",
            views_count: 4,
            cover_image_url: null,
            price: 350000,
          },
        ]);
      }
      return selectBuilder([]);
    });

    renderAdminRoute("/admin?tab=open-houses");

    expect(await screen.findByText(/across the platform/i)).toBeInTheDocument();
    expect(await screen.findByText("Non-owned Open House")).toBeInTheDocument();
    expect(useMyListingsMock).not.toHaveBeenCalled();
  });
});

describe("AdminFeaturedListings", () => {
  it("reports campaign-window outcomes and source instead of lifetime impressions", async () => {
    rpcMock.mockResolvedValue({
      data: [promotionRow()],
      error: null,
    });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText("Sea View Flat")).toBeInTheDocument();
    expect(screen.getAllByText("Admin grant")).toHaveLength(2);
    expect(screen.getAllByText(/2 detail views/i)).toHaveLength(2);
    expect(screen.getAllByText(/1 save/i)).toHaveLength(2);
    expect(screen.getAllByText(/1 enquiry/i)).toHaveLength(2);
    expect(screen.getAllByText(/50\.0% enquiry conversion/i)).toHaveLength(2);
    expect(screen.getAllByText(/Collecting data/i)).toHaveLength(2);
    expect(screen.getAllByText(/(?:1 Jul 2026|Jul 1, 2026)/i)).toHaveLength(2);
    expect(screen.getAllByText(/(?:1 Aug 2026|Aug 1, 2026)/i)).toHaveLength(2);
    expect(screen.queryByText(/Total Spotlight impressions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^High$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Low$/i)).not.toBeInTheDocument();
  });

  it("keeps campaign source, dates, and outcomes available below desktop widths", async () => {
    rpcMock.mockResolvedValue({
      data: [promotionRow()],
      error: null,
    });

    renderWithProviders(<AdminFeaturedListings />);

    const mobileSummary = await screen.findByTestId("promotion-mobile-summary-listing-1");
    expect(mobileSummary).toHaveClass("lg:hidden");
    expect(within(mobileSummary).getByText("Admin grant")).toBeInTheDocument();
    expect(within(mobileSummary).getByText(/2 detail views/i)).toBeInTheDocument();
    expect(within(mobileSummary).getByText(/1 save/i)).toBeInTheDocument();
    expect(within(mobileSummary).getByText(/1 enquiry/i)).toBeInTheDocument();
    expect(within(mobileSummary).getByText(/50\.0% enquiry conversion/i)).toBeInTheDocument();
  });

  it("marks Open Houses ineligible for both paid promotion products", async () => {
    rpcMock.mockResolvedValue({
      data: [promotionRow({
        listing_id: "open-house-1",
        title: "Open House Loft",
        city: "Glyfada",
        listing_type: "open_house",
        price: 950,
        is_featured: false,
        priority_placement: 0,
        featured_until: null,
        priority_until: null,
        campaign_type: null,
        source_type: null,
        campaign_status: null,
        starts_at: null,
        ends_at: null,
        detail_views: 0,
        saves: 0,
        enquiries: 0,
      })],
      error: null,
    });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText("Open House Loft")).toBeInTheDocument();
    expect(screen.getAllByText(/Promotions unavailable for Open Houses/i)).toHaveLength(2);
    expect(screen.getByRole("switch", { name: /Toggle Spotlight for Open House Loft/i })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Toggle Priority for Open House Loft/i })).toBeDisabled();
  });

  it("loads active owner-backed promotion inventory from the admin reporting RPC", async () => {
    rpcMock.mockResolvedValue({ data: [promotionRow()], error: null });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText("Sea View Flat")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("get_admin_listing_promotion_campaigns");
    expect(fromMock).not.toHaveBeenCalledWith("listings");
  });

  it("shows the error branch when listings fail to load", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("listing db down") });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText(/Failed to load listings: listing db down/i)).toBeInTheDocument();
  });

  it("renders empty and search-empty states", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText(/No listings found/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search by title or city/i), { target: { value: "Athens" } });
    expect(screen.getByText(/No listings match your search/i)).toBeInTheDocument();
  });

  it("updates featured state, priority, expiry, and detail paths", async () => {
    rpcMock.mockResolvedValue({
      data: [
        promotionRow(),
        promotionRow({ listing_id: "listing-2", title: "Auction Maisonette", listing_type: "auction", is_featured: false, priority_placement: 1, campaign_type: "priority" }),
        promotionRow({ listing_id: "listing-3", title: "Open House Loft", listing_type: "open_house", is_featured: false, priority_placement: 0, featured_until: null, priority_until: null, campaign_type: null, source_type: null, starts_at: null, ends_at: null }),
        promotionRow({ listing_id: "listing-4", title: "New Build Flat", listing_type: "new_build", is_featured: false, priority_placement: 3, campaign_type: "priority" }),
      ],
      error: null,
    });

    renderWithProviders(<AdminFeaturedListings />);

    expect(await screen.findByText("Sea View Flat")).toBeInTheDocument();
    expect(screen.getAllByText("Owner One")).toHaveLength(4);
    expect(screen.queryByText(/^High$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Medium$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Low$/i)).not.toBeInTheDocument();
    const detailLinks = screen.getAllByTitle("View listing");
    expect(detailLinks[0]).toHaveAttribute("href", "/property/listing-1");
    expect(detailLinks[1]).toHaveAttribute("href", "/auction/listing-2");
    expect(detailLinks[2]).toHaveAttribute("href", "/open-house/listing-3");
    expect(detailLinks[3]).toHaveAttribute("href", "/new-build/listing-4");

    fireEvent.click(screen.getByRole("switch", { name: /Toggle Spotlight for Sea View Flat/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Spotlight removed from listing"));

    fireEvent.click(screen.getByRole("switch", { name: /Toggle Priority for Sea View Flat/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Priority removed from listing"));

    const expiry = screen.getByLabelText(/Spotlight until for Sea View Flat/i);
    fireEvent.change(expiry, { target: { value: "2026-08-20" } });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/Expires/i)));
  });

  it("does not silently replace a cleared Spotlight expiry with another 30-day campaign", async () => {
    rpcMock.mockResolvedValue({ data: [promotionRow()], error: null });

    renderWithProviders(<AdminFeaturedListings />);

    const expiry = await screen.findByLabelText(/Spotlight until for Sea View Flat/i);
    fireEvent.change(expiry, { target: { value: "" } });

    expect(toastMock.error).toHaveBeenCalledWith(
      "Choose a future expiry date or remove Spotlight.",
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("enables inactive Priority as a binary paid placement", async () => {
    rpcMock.mockResolvedValue({
      data: [promotionRow({ priority_placement: 0, priority_until: null, campaign_type: null, source_type: null, starts_at: null, ends_at: null })],
      error: null,
    });

    renderWithProviders(<AdminFeaturedListings />);

    fireEvent.click(await screen.findByRole("switch", { name: /Toggle Priority for Sea View Flat/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Priority enabled for listing"));
  });
});

describe("AdminInvitationRequests", () => {
  it("blocks non-admin profiles", () => {
    useAuthMock.mockReturnValue({ profile: { role: "buyer" } });

    renderWithProviders(<AdminInvitationRequests />);

    expect(screen.getByText(/Admin access required/i)).toBeInTheDocument();
  });

  it("filters, expands details, rejects with a reason, and approves linked requests", async () => {
    fromMock.mockImplementation(tableBuilder({ invitation_requests: [request, { ...request, id: "req-2", email: "done@example.com", full_name: "Approved Applicant", status: "approved" }] }));
    invokeMock.mockResolvedValue({ data: { success: true, result: { granted_role: "institutional" } }, error: null });

    renderWithProviders(<AdminInvitationRequests />);

    expect(await screen.findByText("Iris Investor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Approved/i }));
    expect(screen.queryByText("Iris Investor")).not.toBeInTheDocument();
    expect(screen.getByText("done@example.com")).toBeInTheDocument();
    const amountInput = screen.getByLabelText(/Payment amount for done@example.com/i);
    expect(amountInput).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create payment link/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Enter a payment amount greater than 0.");
    fireEvent.change(amountInput, { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: /Create payment link/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("create-investor-payment", {
        body: {
          request_id: "req-2",
          user_id: "user-1",
          plan_key: "investor_private",
          amount: 12500,
        },
        headers: { Authorization: "Bearer token" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^All/i }));
    const requestCard = screen.getByText("Iris Investor").closest(".rounded-2xl") as HTMLElement;
    fireEvent.click(within(requestCard).getAllByRole("button").at(-1)!);
    expect(screen.getByText(/Distressed residential/i)).toBeInTheDocument();
    expect(screen.getByText(/Linked user account/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Reject$/i }));
    fireEvent.change(screen.getByPlaceholderText(/Optional: explain why/i), { target: { value: "Not enough fit" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Rejection/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/Request rejected.*email sent/i)));

    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Approve$/i })).at(-1)!);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/Approved/)));
  });

  it("does not approve an applicant without a linked user account", async () => {
    fromMock.mockImplementation(tableBuilder({ invitation_requests: [{ ...request, user_id: null }] }));

    renderWithProviders(<AdminInvitationRequests />);

    fireEvent.click(await screen.findByRole("button", { name: /^Approve$/i }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Approve$/i })).at(-1)!);

    expect(toastMock.error).toHaveBeenCalledWith("Cannot approve: this applicant has no linked user account yet.");
  });
});

describe("AdminSubscribers", () => {
  it("renders empty subscribers and validates admin transfer email", async () => {
    fromMock.mockImplementation(tableBuilder({ investor_subscriptions: [] }));

    renderWithProviders(<AdminSubscribers />);

    expect(await screen.findByText(/No subscribers yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Transfer admin/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Enter the new admin's email");
  });

  it("edits tier, expiry, and status actions for subscriber rows", async () => {
    const sub = {
      id: "sub-1",
      user_id: "user-1",
      tier: "private",
      status: "active",
      started_at: "2026-04-01T00:00:00Z",
      expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: "2026-04-01T00:00:00Z",
    };
    fromMock.mockImplementation(tableBuilder({
      investor_subscriptions: [sub],
      profiles_public: [{ user_id: "user-1", display_name: "Subscriber One" }],
    }));

    const { container } = renderWithProviders(<AdminSubscribers />);

    expect(await screen.findByText("Subscriber One")).toBeInTheDocument();
    expect(screen.getByText(/Expires in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "institutional" } });
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Subscription updated"));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel Sub/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Subscription updated"));
  });
});

describe("AdminPanel", () => {
  it("shows status, filters logs, and handles skipped/success admin actions", async () => {
    fromMock.mockImplementation(tableBuilder({
      sync_log: [
        { id: "log-1", direction: "os_to_hub", entity_type: "auction", entity_id: "a1", status: "success", error_message: null, records_affected: 3, payload: {}, created_at: "2026-04-02T10:00:00Z" },
        { id: "log-2", direction: "hub_to_os", entity_type: "listing", entity_id: "l1", status: "error", error_message: "bad payload", records_affected: 0, payload: {}, created_at: "2026-04-01T10:00:00Z" },
      ],
      listing_management_catalogue: [{ id: "listing-1", title: "Admin Listing", city: "Athens", status: "active" }],
      firesale_requests: [{ id: "fire-1", address: "1 Demo St", city: "Athens", status: "pending" }],
    }));
    invokeMock.mockImplementation((name: string) => {
      if (name === "sync-to-os") return Promise.resolve({ data: { status: "skipped" }, error: null });
      if (name === "sync-firesale-to-os") return Promise.resolve({ data: { status: "ok" }, error: null });
      if (name === "full-sync-from-os") return Promise.resolve({ data: { sync: { auctions: { imported: 2, updated: 1, errors: 0, pages: 1 } } }, error: null });
      return Promise.resolve({ data: { osReachable: true }, error: null });
    });

    renderWithProviders(<AdminPanel />);

    expect(await screen.findByText(/Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/OK/i)).toBeInTheDocument();
    expect(screen.getByText(/3 records/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button").find((button) => button.textContent?.trim().startsWith("Hub"))!);
    expect(screen.queryByText(/3 records/i)).not.toBeInTheDocument();
    expect(screen.getByText(/bad payload/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pull auctions/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/Pull: 2 new.*1 updated/i)));

    fireEvent.click(screen.getAllByRole("button", { name: /Push/i })[0]);
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith("OS credentials not configured."));

    fireEvent.click(screen.getAllByRole("button", { name: /Push/i })[1]);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Firesale pushed to maiProp OS."));
  });

  it("surfaces disconnected credentials hints and advanced tester failures", async () => {
    fromMock.mockImplementation(tableBuilder({ sync_log: [], listing_management_catalogue: [], firesale_requests: [] }, { sync_log: { error: new Error("db") } }));
    invokeMock.mockImplementation((name: string) => {
      if (name === "os-diagnose") return Promise.resolve({ data: null, error: new Error("offline") });
      return Promise.resolve({ data: null, error: new Error("fn failed") });
    });

    renderWithProviders(<AdminPanel />);

    expect(await screen.findByText(/Not connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Set MAIPROP_OS_URL/i)).toBeInTheDocument();
    expect(screen.getByText(/No active listings/i)).toBeInTheDocument();
    expect(screen.getByText(/No pending firesales/i)).toBeInTheDocument();
    expect(screen.getByText(/No sync events yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
    const pageSize = screen.getByDisplayValue("100");
    fireEvent.change(pageSize, { target: { value: "999" } });
    expect(pageSize).toHaveValue(500);
    fireEvent.click(within(screen.getByText("poll-os-auctions").closest("div")!).getByRole("button"));
    expect(await screen.findByText(/fn failed/i)).toBeInTheDocument();
  });
});
