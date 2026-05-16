import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import InvestorDashboard from "@/pages/InvestorDashboard";

type DealRow = {
  id: string;
  address: string;
  city: string;
  property_type: string;
  sqm: number;
  asking_price: number;
  ai_estimate?: number;
  status: string;
  created_at: string;
};

let feedRows: DealRow[] = [];
let feedError: Error | null = null;
const expressInterestMock = vi.fn().mockResolvedValue({});
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
let invitationRow: Record<string, unknown> | null = null;
let myInterestsMap = new Map<string, Record<string, unknown>>();

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
    user: { id: "user-1", email: "investor.private@maiprop.demo" },
    profile: authProfile,
  }),
}));

vi.mock("@/hooks/useFiresaleInterest", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useFiresaleInterest")>("@/hooks/useFiresaleInterest");
  return {
    ...actual,
    useMyFiresaleInterests: () => ({ data: myInterestsMap, isLoading: false }),
    useExpressInterest: () => ({ mutateAsync: expressInterestMock, isPending: false }),
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
        "investor.kpi.liveDealsThisWeek": "Updated this week",
        "investor.kpi.totalDealValue": "Total deal value",
        "investor.kpi.totalDealValueDelta": "Current pipeline",
        "investor.kpi.avgDiscount": "Average discount",
        "investor.kpi.avgDiscountDelta": "Vs market value",
        "investor.kpi.avgRoi": "Average ROI",
        "investor.kpi.avgRoiDelta": "Estimated spread",
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
    authProfile = { id: "profile-1", role: "admin", participant_type: "investor" };
    subscriptionRow = {
      id: "sub-1",
      user_id: "user-1",
      tier: "private",
      status: "active",
      started_at: "2026-01-01T00:00:00Z",
      expires_at: null,
    };
    invitationRow = null;
    myInterestsMap = new Map();
    queriedTables = [];
    expressInterestMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes accessible filters and computed ROI", async () => {
    renderWithProviders(<InvestorDashboard />);

    await screen.findByTestId("investor-filters");
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/property type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/urgency/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("20.0%")).toBeInTheDocument());
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

    const reportButtons = await screen.findAllByRole("button", { name: /ai report/i });
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
    await waitFor(() => expect(queriedTables).toContain("investor_subscriptions"));
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
});
