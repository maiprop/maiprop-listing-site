import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createTestQueryClient, renderWithProviders } from "@/test/utils";
import InvestorDashboard from "@/pages/InvestorDashboard";

type DealRow = {
  id: string;
  address: string;
  city: string;
  property_type: string | null;
  sqm: number | null;
  bedrooms?: number | null;
  condition?: string | null;
  asking_price: number | null;
  ai_estimate?: number | null;
  status: string | null;
  created_at: string;
};

let feedRows: DealRow[] = [];
let feedError: Error | null = null;
let reservationLogicOverride: boolean | null = null;
const expressInterestMock = vi.fn().mockResolvedValue({});
let expressInterestPending = false;
let authUser: { id: string; email: string } | null = { id: "user-1", email: "investor.private@maiprop.demo" };
let authProfile: Record<string, unknown> = { id: "profile-1", role: "admin", participant_type: "investor" };
let queriedTables: string[] = [];
let subscriptionRow: Record<string, unknown> | null = {
  id: "sub-1",
  user_id: "user-1",
  tier: "private",
  status: "active",
  started_at: "2026-01-01T00:00:00Z",
  expires_at: null,
};
let subscriptionLoading = false;
let invitationRow: Record<string, unknown> | null = null;
let myInterestsMap = new Map<string, Record<string, unknown>>();

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function makeQuery(table: string) {
  queriedTables.push(table);
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "investor_subscriptions") {
        return { data: subscriptionRow, error: null };
      }
      if (table === "invitation_requests") {
        return { data: invitationRow, error: null };
      }
      return { data: null, error: null };
    }),
    then: (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
      Promise.resolve({
        data: feedError ? null : feedRows,
        error: table === "firesale_requests_investor_feed" || table === "firesale_requests" ? feedError : null,
      }).then(resolve, reject),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeQuery(table)),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
  useAuth: () => ({
    user: authUser,
    profile: authProfile,
  }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => {
    const status = typeof subscriptionRow?.status === "string"
      ? subscriptionRow.status
      : null;
    const active = status === "active" || status === "trial";
    return {
      isPro: active,
      isInvestorManagedPlan: active,
      subscriptionEnd: subscriptionRow?.expires_at ?? null,
      loading: subscriptionLoading,
    };
  },
}));

vi.mock("@/hooks/useFiresaleInterest", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useFiresaleInterest")>("@/hooks/useFiresaleInterest");
  return {
    ...actual,
    isActiveReservation: (entry: Parameters<typeof actual.isActiveReservation>[0]) =>
      reservationLogicOverride ?? actual.isActiveReservation(entry),
    useMyFiresaleInterests: () => ({ data: myInterestsMap, isLoading: false }),
    useExpressInterest: () => ({ mutateAsync: expressInterestMock, isPending: expressInterestPending }),
  };
});

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/InvitationRequestModal", () => ({
  InvitationRequestModal: ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => (
    <div role="dialog" aria-label="Invitation request">
      <button onClick={onSuccess}>submit invitation success</button>
      <button onClick={onClose}>close invitation</button>
    </div>
  ),
}));
vi.mock("@/components/investor/InvestorSidebarAnalytics", () => ({
  InvestorSidebarAnalytics: () => <aside data-testid="investor-sidebar-analytics" />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "investor.hero.badge": "Investor",
        "investor.hero.title": "Strategic",
        "investor.hero.titleHighlight": "Capital",
        "investor.hero.subtitle": "Private quick-sale opportunities",
        "investor.hero.liveDeals": `${params?.count ?? 0} live deals`,
        "investor.hero.requestInvitation": "Request invitation",
        "investor.hero.planActive": `${params?.tier ?? ""} plan active`,
        "investor.expiry.titleToday": `${params?.tier ?? ""} expires today`,
        "investor.expiry.title": `${params?.tier ?? ""} expires in ${params?.count ?? 1} day`,
        "investor.expiry.title_other": `${params?.tier ?? ""} expires in ${params?.count ?? 0} days`,
        "investor.expiry.subtitle": "Renew before access pauses.",
        "investor.expiry.requestRenewal": "Request renewal",
        "investor.access.noneBadge": "Invitation required",
        "investor.access.noneTitle": "Request",
        "investor.access.noneTitleHighlight": "access",
        "investor.access.noneDesc": "Apply to join the quick-sale deal flow.",
        "investor.access.cta": "Request invitation",
        "investor.access.alreadyApplied": "Already applied?",
        "investor.access.alreadyAppliedNote": "We will follow up.",
        "investor.access.pendingBadge": "Pending",
        "investor.access.pendingTitle": "Application",
        "investor.access.pendingTitleHighlight": "pending",
        "investor.access.pendingDesc": "Your application is being reviewed.",
        "investor.access.pendingNote": "Review in progress",
        "investor.access.pendingCTA": "Pending review",
        "investor.access.pendingCTANote": "We will contact you.",
        "investor.access.rejectedBadge": "Rejected",
        "investor.access.rejectedTitle": "Application",
        "investor.access.rejectedTitleHighlight": "not approved",
        "investor.access.rejectedDesc": "You can re-apply with more detail.",
        "investor.access.reApply": "Re-apply for access",
        "investor.access.reApplyNote": "Add more proof this time.",
        "investor.kpi.liveDeals": "Live deals",
        "investor.kpi.liveDealsThisWeek": `${params?.count ?? 0} added in last 7 days`,
        "investor.kpi.totalDealValue": "Total deal value",
        "investor.kpi.totalDealValueDelta": "Current pipeline",
        "investor.kpi.avgValueSpread": "Average value gap",
        "investor.kpi.avgValueSpreadDelta": "AI market value denominator",
        "investor.kpi.valuationCoverage": "Valuation coverage",
        "investor.kpi.valuationCoverageDelta": "Deals with asking and AI values",
        "investor.hero.tabDealFeed": "Deal feed",
      };
      return labels[key] ?? key;
    },
  }),
}));

const defaultRows: DealRow[] = [
  {
    id: "deal-1",
    address: "Kolonaki 12",
    city: "Athens",
    property_type: "apartment",
    sqm: 100,
    asking_price: 100_000,
    ai_estimate: 130_000,
    status: "reviewed",
    created_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "deal-2",
    address: "Marina 8",
    city: "Piraeus",
    property_type: "villa",
    sqm: 150,
    asking_price: 100_000,
    ai_estimate: 110_000,
    status: "reviewed",
    created_at: "2026-05-02T00:00:00Z",
  },
];

describe("InvestorDashboard behavior", () => {
  beforeEach(() => {
    feedRows = defaultRows;
    feedError = null;
    reservationLogicOverride = null;
    authUser = { id: "user-1", email: "investor.private@maiprop.demo" };
    authProfile = { id: "profile-1", role: "admin", participant_type: "investor" };
    expressInterestPending = false;
    subscriptionRow = {
      id: "sub-1",
      user_id: "user-1",
      tier: "private",
      status: "active",
      started_at: "2026-01-01T00:00:00Z",
      expires_at: null,
    };
    subscriptionLoading = false;
    invitationRow = null;
    myInterestsMap = new Map();
    queriedTables = [];
    expressInterestMock.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes accessible filters and evidence-backed value metrics without annual ROI claims", async () => {
    renderWithProviders(<InvestorDashboard />);

    await screen.findByTestId("investor-filters");
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/property type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/urgency/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("+16.1%")).toBeInTheDocument());
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.queryByText(/ROI/i)).not.toBeInTheDocument();
  });

  it("shows the actual number of deals added during the last seven days", async () => {
    feedRows = [
      { ...defaultRows[0], created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
      { ...defaultRows[1], created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
    ];

    renderWithProviders(<InvestorDashboard />);

    expect(await screen.findByText("1 added in last 7 days")).toBeInTheDocument();
  });

  it("filters the visible deal feed by city, type, and urgency", async () => {
    renderWithProviders(<InvestorDashboard />);

    await screen.findByText("Kolonaki 12");
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "Athens" } });
    expect(screen.getByText(/1 deals found/i)).toBeInTheDocument();
    expect(screen.getByText("Kolonaki 12")).toBeInTheDocument();
    expect(screen.queryByText("Marina 8")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/property type/i), { target: { value: "villa" } });
    expect(screen.getByText(/0 deals found/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText(/property type/i), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText(/urgency/i), { target: { value: "HIGH" } });
    expect(screen.getByText(/1 deals found/i)).toBeInTheDocument();
    expect(screen.getByText("Kolonaki 12")).toBeInTheDocument();
  });

  it("exports a deal report for authorized users", async () => {
    const createObjectURL = vi.fn(() => "blob:deal-report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    renderWithProviders(<InvestorDashboard />);

    await screen.findByText("Kolonaki 12", {}, { timeout: 5_000 });
    const reportButtons = screen.getAllByRole("button", { name: /ai report/i });
    fireEvent.click(reportButtons[0]);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:deal-report");
  });

  it("shows a generic retryable deal-feed error without raw backend detail", async () => {
    feedError = new Error("permission denied for policy firesale_requests_investor_feed");

    renderWithProviders(<InvestorDashboard />);

    const errorState = await screen.findByTestId("investor-deal-feed-error");
    expect(errorState).toHaveTextContent("Deal feed could not load");
    expect(errorState).toHaveTextContent("We could not refresh the investor deal feed");
    expect(errorState).not.toHaveTextContent("permission denied");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("does not load paid investor deal flow for a non-investor subscribed profile", async () => {
    authProfile = { id: "profile-1", role: "developer", participant_type: "developer" };

    renderWithProviders(<InvestorDashboard />);

    await screen.findByTestId("investor-dashboard");
    await waitFor(() => expect(queriedTables).not.toContain("investor_subscriptions"));
    expect(queriedTables).not.toContain("firesale_requests_investor_feed");
    expect(queriedTables).not.toContain("firesale_requests");
  });

  it("opens invitation requests from access gates and expiry renewal CTAs", async () => {
    authProfile = { id: "profile-1", role: "buyer", participant_type: "buyer" };
    subscriptionRow = null;
    invitationRow = { status: "rejected" };

    const { unmount } = renderWithProviders(<InvestorDashboard />);
    await screen.findByText(/not approved/i);
    fireEvent.click(screen.getByRole("button", { name: /Re-apply for access/i }));
    expect(await screen.findByRole("dialog", { name: /Invitation request/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close invitation/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Invitation request/i })).not.toBeInTheDocument());

    unmount();
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    subscriptionRow = {
      id: "sub-1",
      user_id: "user-1",
      tier: "private",
      status: "active",
      started_at: "2026-01-01T00:00:00Z",
      expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    renderWithProviders(<InvestorDashboard />);
    await screen.findByText(/expires in/i);
    fireEvent.click(screen.getByRole("button", { name: /Request renewal/i }));
    expect(await screen.findByRole("dialog", { name: /Invitation request/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /submit invitation success/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Invitation request/i })).not.toBeInTheDocument());
  });

  it("shows interest status badges and submits proof-backed interest", async () => {
    myInterestsMap = new Map([
      [
        "deal-1",
        {
          id: "interest-1",
          deal_id: "deal-1",
          status: "reserved",
          proof_of_funds_url: "https://example.com/pof.pdf",
          reservation_expires_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        },
      ],
      [
        "deal-2",
        {
          id: "interest-2",
          deal_id: "deal-2",
          status: "expired",
          proof_of_funds_url: null,
          reservation_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        },
      ],
    ]);
    renderWithProviders(<InvestorDashboard />);

    await screen.findAllByText(/Reserved for you/i);
    fireEvent.click(screen.getByRole("button", { name: /Rejoin Queue/i }));
    fireEvent.change(screen.getByLabelText(/message to admin/i), { target: { value: "Ready to verify" } });
    fireEvent.change(screen.getByLabelText(/proof of funds/i), {
      target: { files: [new File(["funds"], "funds.pdf", { type: "application/pdf" })] },
    });
    fireEvent.change(await screen.findByLabelText(/available proof of funds amount/i), { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: /Register Interest/i }));

    await waitFor(() => expect(expressInterestMock).toHaveBeenCalledWith(expect.objectContaining({
      dealId: "deal-2",
      message: "Ready to verify",
      proofAmount: "250000",
      proofFile: expect.any(File),
    })));
  });

  it("labels the express-interest dialog fields and restores focus on close", async () => {
    renderWithProviders(<InvestorDashboard />);

    const opener = (await screen.findAllByRole("button", { name: /express interest/i }))[0];
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: /express interest/i });
    const closeButton = screen.getByRole("button", { name: /close express interest dialog/i });
    await waitFor(() => expect(closeButton).toHaveFocus());

    expect(screen.getByLabelText(/message to admin/i)).toBeInTheDocument();
    const proofInput = screen.getByLabelText(/proof of funds/i);
    expect(proofInput).toHaveAttribute("type", "file");

    fireEvent.change(proofInput, {
      target: { files: [new File(["statement"], "statement.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByLabelText(/available proof of funds amount/i)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /express interest/i })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("uses only complete financial evidence and ignores unsupported days-on-market data", async () => {
    feedRows = [
      {
        id: "deep-discount",
        address: "Deep Discount 1",
        city: "Athens",
        property_type: "apartment",
        sqm: 100,
        bedrooms: 2,
        condition: "renovated",
        asking_price: 100_000,
        ai_estimate: 200_000,
        status: "reviewed",
        created_at: new Date().toISOString(),
      },
      {
        id: "stale-no-ai",
        address: "Published Only 2",
        city: "Athens",
        property_type: null,
        sqm: null,
        bedrooms: null,
        condition: null,
        asking_price: null,
        ai_estimate: null,
        status: null,
        created_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "near-market",
        address: "Near Market 3",
        city: "Piraeus",
        property_type: "office",
        sqm: 50,
        asking_price: 100_000,
        ai_estimate: 102_000,
        status: "reviewed",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "below-market",
        address: "Below Market 4",
        city: "Glyfada",
        property_type: "villa",
        sqm: 200,
        asking_price: 100_000,
        ai_estimate: 110_000,
        status: "reviewed",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "negative-spread",
        address: "Over Market 5",
        city: "Glyfada",
        property_type: "land",
        sqm: 500,
        asking_price: 120_000,
        ai_estimate: 100_000,
        status: "reviewed",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    renderWithProviders(<InvestorDashboard />);

    await screen.findByText("Deep Discount 1");
    expect(queriedTables).toContain("firesale_requests");
    expect(queriedTables).not.toContain("firesale_requests_investor_feed");
    expect(screen.getByText("Significantly below market")).toBeInTheDocument();
    expect(screen.getByText("Market comparison unavailable")).toBeInTheDocument();
    expect(screen.getByText("Above market estimate")).toBeInTheDocument();
    expect(screen.getByText("Below market value")).toBeInTheDocument();

    const missingEvidenceCard = screen.getByTestId("investor-deal-stale-no-ai");
    expect(missingEvidenceCard).toHaveTextContent("Asking—");
    expect(missingEvidenceCard).toHaveTextContent("MEDIUM");
    expect(missingEvidenceCard).not.toHaveTextContent("12%");

    const discountedCard = screen.getByTestId("investor-deal-deep-discount");
    expect(discountedCard).toHaveTextContent("50%");
    expect(discountedCard).toHaveTextContent("+50%");

    const aboveMarketCard = screen.getByTestId("investor-deal-negative-spread");
    expect(aboveMarketCard).toHaveTextContent("-20%");
    expect(within(aboveMarketCard).getByText("Discount").previousSibling).toHaveTextContent("—");

    expect(screen.queryByText(/ROI Est\./i)).not.toBeInTheDocument();
    expect(screen.queryByText("48h")).not.toBeInTheDocument();
    expect(screen.getAllByText("Added").length).toBeGreaterThan(0);
    expect(screen.getByText("renovated condition")).toBeInTheDocument();
    expect(screen.getAllByText("apartment", { selector: "span" }).length).toBeGreaterThan(0);
  });

  it("allows only active or trial investor roles into the paid investor feed", async () => {
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    subscriptionRow = { ...subscriptionRow!, status: "trial" };
    const trialView = renderWithProviders(<InvestorDashboard />);
    await screen.findByText("Kolonaki 12");
    expect(queriedTables).toContain("firesale_requests_investor_feed");

    trialView.unmount();
    queriedTables = [];
    subscriptionRow = { ...subscriptionRow!, status: "cancelled" };
    const cancelledView = renderWithProviders(<InvestorDashboard />);
    await screen.findByTestId("investor-dashboard");
    expect(queriedTables).not.toContain("investor_subscriptions");
    expect(queriedTables).not.toContain("firesale_requests_investor_feed");

    cancelledView.unmount();
    queriedTables = [];
    subscriptionRow = { ...subscriptionRow!, status: "active" };
    authProfile = {
      id: "profile-1",
      role: "institutional",
      participant_type: "institutional",
      role_switch_in_progress_at: "2026-07-13T00:00:00Z",
    };
    renderWithProviders(<InvestorDashboard />);
    await screen.findByTestId("investor-dashboard");
    expect(queriedTables).not.toContain("investor_subscriptions");
    expect(queriedTables).not.toContain("firesale_requests_investor_feed");
  });

  it("keys the investor feed cache by authenticated user identity", async () => {
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    const queryClient = createTestQueryClient();

    renderWithProviders(<InvestorDashboard />, { queryClient });

    await screen.findByText("Kolonaki 12");
    const [feedQuery] = queryClient.getQueryCache().findAll({
      queryKey: ["investor-deal-feed"],
    });

    expect(feedQuery?.queryKey).toContain("user-1");
  });

  it("keeps granted deal data visible during a background entitlement refresh", async () => {
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    const view = renderWithProviders(<InvestorDashboard />);
    await screen.findByText("Kolonaki 12");

    subscriptionLoading = true;
    view.rerender(<InvestorDashboard />);

    expect(screen.getByText("Kolonaki 12")).toBeInTheDocument();
    expect(screen.getByTestId("investor-deal-list")).not.toBeEmptyDOMElement();
  });

  it("uses a distinct feed cache context and hides cached deals after entitlement loss", async () => {
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    const queryClient = createTestQueryClient();
    const view = renderWithProviders(<InvestorDashboard />, { queryClient });

    await screen.findByText("Kolonaki 12");
    const [grantedFeedQuery] = queryClient.getQueryCache().findAll({
      queryKey: ["investor-deal-feed"],
    });
    const grantedFeedKey = grantedFeedQuery?.queryKey;
    expect(grantedFeedKey).toContain("granted");

    subscriptionRow = { ...subscriptionRow!, status: "cancelled" };
    view.rerender(<InvestorDashboard />);

    await waitFor(() => {
      expect(screen.queryByText("Kolonaki 12")).not.toBeInTheDocument();
    });
    const [deniedFeedQuery] = queryClient.getQueryCache().findAll({
      queryKey: ["investor-deal-feed"],
    });
    expect(deniedFeedQuery?.queryKey).not.toEqual(grantedFeedKey);
    expect(deniedFeedQuery?.queryKey).toContain("user-1");
    expect(deniedFeedQuery?.queryKey).toContain("denied");
  });

  it("does not reuse another investor account's cached deal data", async () => {
    authProfile = { id: "profile-1", role: "investor", participant_type: "investor" };
    const queryClient = createTestQueryClient();
    const view = renderWithProviders(<InvestorDashboard />, { queryClient });

    await screen.findByText("Kolonaki 12");

    authUser = { id: "user-2", email: "second.investor@maiprop.demo" };
    authProfile = { id: "profile-2", role: "investor", participant_type: "investor" };
    subscriptionRow = {
      ...subscriptionRow!,
      user_id: "user-2",
    };
    feedRows = [
      {
        id: "deal-user-2",
        address: "Second Account Deal",
        city: "Patras",
        property_type: "house",
        sqm: 90,
        asking_price: 90_000,
        ai_estimate: 110_000,
        status: "reviewed",
        created_at: "2026-05-03T00:00:00Z",
      },
    ];
    view.rerender(<InvestorDashboard />);

    expect(screen.queryByText("Kolonaki 12")).not.toBeInTheDocument();
    expect(await screen.findByText("Second Account Deal")).toBeInTheDocument();
    const [secondAccountFeedQuery] = queryClient.getQueryCache().findAll({
      queryKey: ["investor-deal-feed"],
    });
    expect(secondAccountFeedQuery?.queryKey).not.toContain("user-1");
    expect(secondAccountFeedQuery?.queryKey).toContain("user-2");
  });

  it("normalizes invitation statuses and does not query user-owned records while signed out", async () => {
    authUser = null;
    authProfile = { id: "profile-1", role: "buyer", participant_type: "buyer" };
    subscriptionRow = null;
    invitationRow = { status: "unexpected" };

    renderWithProviders(<InvestorDashboard />);

    await screen.findByTestId("investor-dashboard");
    expect(screen.getAllByRole("button", { name: /Request invitation/i })).toHaveLength(1);
    expect(screen.queryByText("Invitation required")).not.toBeInTheDocument();
    expect(queriedTables).not.toContain("investor_subscriptions");
    expect(queriedTables).not.toContain("invitation_requests");
    expect(screen.queryByRole("dialog", { name: /Invitation request/i })).not.toBeInTheDocument();
  });

  it("renders every investor queue state with the correct proof and re-entry semantics", async () => {
    reservationLogicOverride = false;
    feedRows = Array.from({ length: 7 }, (_, index) => ({
      id: `state-${index}`,
      address: `State Deal ${index}`,
      city: "Athens",
      property_type: "apartment",
      sqm: 80,
      asking_price: 100_000,
      ai_estimate: 120_000,
      status: "reviewed",
      created_at: "2026-01-01T00:00:00Z",
    }));
    myInterestsMap = new Map([
      ["state-0", { deal_id: "state-0", status: "engaged", proof_of_funds_url: null }],
      ["state-1", { deal_id: "state-1", status: "won", proof_of_funds_url: null }],
      ["state-2", { deal_id: "state-2", status: "prioritized", proof_of_funds_url: "proof.pdf" }],
      ["state-3", { deal_id: "state-3", status: "passed", proof_of_funds_url: null }],
      ["state-4", { deal_id: "state-4", status: "expired", proof_of_funds_url: null }],
      ["state-5", { deal_id: "state-5", status: "queued", proof_of_funds_url: "proof.pdf" }],
      ["state-6", { deal_id: "state-6", status: "queued", proof_of_funds_url: null }],
    ]);

    renderWithProviders(<InvestorDashboard />);

    expect(await screen.findAllByText("In negotiation")).toHaveLength(2);
    expect(screen.getAllByText("Closed with you")).toHaveLength(2);
    expect(screen.getAllByText("Priority queue")).toHaveLength(2);
    expect(screen.getAllByText("Passed for now")).toHaveLength(1);
    expect(screen.getAllByText("Hold expired")).toHaveLength(1);
    expect(screen.getAllByText(/Interest registered/).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText("POF")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Rejoin Queue/i })).toHaveLength(2);
  });

  it("disables duplicate interest submission while the mutation is pending", async () => {
    expressInterestPending = true;
    renderWithProviders(<InvestorDashboard />);

    fireEvent.click((await screen.findAllByRole("button", { name: /Express Interest/i }))[0]);
    expect(await screen.findByRole("button", { name: /Register Interest/i })).toBeDisabled();
  });

  it("keeps the interest dialog open when submission fails without raising an unhandled rejection", async () => {
    expressInterestMock.mockRejectedValueOnce(new Error("submission rejected"));
    renderWithProviders(<InvestorDashboard />);

    fireEvent.click((await screen.findAllByRole("button", { name: /Express Interest/i }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Register Interest/i }));

    await waitFor(() => expect(expressInterestMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: /express interest/i })).toBeInTheDocument();
  });

  it("distinguishes pending and approved invitation review states", async () => {
    authProfile = { id: "profile-1", role: "buyer", participant_type: "buyer" };
    subscriptionRow = null;
    invitationRow = { status: "pending" };
    const pending = renderWithProviders(<InvestorDashboard />);
    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/Review in progress/i)).toBeInTheDocument();

    pending.unmount();
    invitationRow = { status: "approved" };
    renderWithProviders(<InvestorDashboard />);
    expect(await screen.findByText("Invitation required")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Request invitation/i })).toHaveLength(2);
  });

  it("formats reservation holds without a deadline, after expiry, in minutes, and in hours", async () => {
    reservationLogicOverride = true;
    feedRows = Array.from({ length: 4 }, (_, index) => ({
      id: `hold-${index}`,
      address: `Hold Deal ${index}`,
      city: "Athens",
      property_type: "apartment",
      sqm: 80,
      asking_price: 100_000,
      ai_estimate: 120_000,
      status: "reviewed",
      created_at: "2026-01-01T00:00:00Z",
    }));
    myInterestsMap = new Map([
      ["hold-0", { deal_id: "hold-0", status: "reserved", reservation_expires_at: null }],
      ["hold-1", { deal_id: "hold-1", status: "reserved", reservation_expires_at: new Date(Date.now() - 1_000).toISOString() }],
      ["hold-2", { deal_id: "hold-2", status: "reserved", reservation_expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }],
      ["hold-3", { deal_id: "hold-3", status: "reserved", reservation_expires_at: new Date(Date.now() + 135 * 60_000).toISOString() }],
    ]);

    renderWithProviders(<InvestorDashboard />);

    const badges = await screen.findAllByText(/Reserved for you/);
    expect(badges.some((badge) => badge.textContent === "Reserved for you")).toBe(true);
    expect(badges.some((badge) => badge.textContent?.includes("Expired"))).toBe(true);
    expect(badges.some((badge) => badge.textContent?.includes("m left"))).toBe(true);
    expect(badges.some((badge) => badge.textContent?.includes("h") && badge.textContent?.includes("m left"))).toBe(true);
  });
});
