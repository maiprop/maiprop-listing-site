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
        return {
          data: {
            id: "sub-1",
            user_id: "user-1",
            tier: "private",
            status: "active",
            started_at: "2026-01-01T00:00:00Z",
            expires_at: null,
          },
          error: null,
        };
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
    useMyFiresaleInterests: () => ({ data: new Map(), isLoading: false }),
    useExpressInterest: () => ({ mutateAsync: expressInterestMock, isPending: false }),
  };
});

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/InvitationRequestModal", () => ({ InvitationRequestModal: () => null }));
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
