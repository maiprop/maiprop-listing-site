import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import {
  AdminDealRow,
  InvestorQueue,
  STATUS_CONFIG,
  type AdminDeal,
} from "@/components/admin/FiresaleComponents";

const mocks = vi.hoisted(() => ({
  queue: [] as Array<Record<string, unknown>>,
  isLoading: false,
  mutate: vi.fn(),
}));

vi.mock("@/hooks/useFiresaleInterest", () => ({
  useFiresaleInterestQueue: (dealId: string | undefined) => ({
    data: dealId ? mocks.queue : [],
    isLoading: mocks.isLoading,
  }),
  useUpdateInterestStatus: () => ({ mutate: mocks.mutate }),
  hasPriorityProof: (entry: {
    proof_of_funds_url?: string | null;
    proof_amount?: number | null;
    proof_of_funds_verified_at?: string | null;
  }) => Boolean(entry.proof_of_funds_verified_at || entry.proof_of_funds_url || entry.proof_amount),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

const baseDeal = (overrides: Partial<AdminDeal> = {}): AdminDeal => ({
  id: "deal-1",
  address: "12 Solonos",
  city: "Athens",
  property_type: "apartment",
  sqm: 92,
  bedrooms: 2,
  condition: "good",
  ai_estimate: 250000,
  asking_price: 210000,
  offer_price: null,
  status: "pending",
  contact_email: "seller@example.test",
  contact_phone: "+306900000000",
  notes: "Needs a fast sale",
  admin_notes: null,
  seller_response: null,
  seller_response_price: null,
  seller_responded_at: null,
  created_at: "2026-05-15T08:00:00Z",
  ...overrides,
});

describe("FiresaleComponents constants", () => {
  it("keeps every admin deal status mapped to display metadata", () => {
    expect(Object.keys(STATUS_CONFIG)).toEqual(["pending", "reviewed", "offer_sent", "closed"]);
    expect(STATUS_CONFIG.pending.label).toBe("Pending");
    expect(STATUS_CONFIG.closed.color).toContain("brand-emerald");
  });
});

describe("InvestorQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T09:00:00Z"));
    mocks.queue = [];
    mocks.isLoading = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens into loading, empty, and populated queue states", () => {
    mocks.isLoading = true;
    const { rerender } = renderWithProviders(<InvestorQueue dealId="deal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Investor Queue/i }));
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    mocks.isLoading = false;
    mocks.queue = [];
    rerender(<InvestorQueue dealId="deal-1" />);
    expect(screen.getByText(/No investors have expressed interest yet/i)).toBeInTheDocument();

    mocks.queue = [
      {
        id: "interest-1",
        status: "reserved",
        reservation_expires_at: "2026-05-16T11:30:00Z",
        proof_of_funds_url: "proof.pdf",
        proof_amount: 550000,
        proof_of_funds_verified_at: null,
        message: "Can close quickly",
        profiles: { display_name: "Priority Investor" },
      },
      {
        id: "interest-2",
        status: "interested",
        reservation_expires_at: null,
        proof_of_funds_url: null,
        proof_amount: null,
        proof_of_funds_verified_at: null,
        message: null,
        profiles: { first_name: "Nikos", last_name: "Buyer" },
      },
    ];
    rerender(<InvestorQueue dealId="deal-1" />);

    expect(screen.getByText(/2 interested/i)).toHaveTextContent("2 interested");
    expect(screen.getByText(/Active reservation window: 2h 30m left/i)).toBeInTheDocument();
    expect(screen.getByText("Priority Investor")).toBeInTheDocument();
    expect(screen.getAllByText(/POF/).length).toBeGreaterThan(0);
    expect(screen.getByText("Nikos Buyer")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "won" } });
    expect(mocks.mutate).toHaveBeenCalledWith({
      id: "interest-1",
      dealId: "deal-1",
      status: "won",
    });
  });

  it("shows expired reservation labels", () => {
    mocks.queue = [
      {
        id: "interest-1",
        status: "reserved",
        reservation_expires_at: "2026-05-16T08:59:00Z",
        proof_of_funds_url: null,
        proof_amount: null,
        proof_of_funds_verified_at: null,
        message: null,
        profiles: null,
      },
    ];

    renderWithProviders(<InvestorQueue dealId="deal-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Investor Queue/i }));

    expect(screen.getByText(/Active reservation window: expired/i)).toBeInTheDocument();
    expect(screen.getByText("Investor")).toBeInTheDocument();
  });
});

describe("AdminDealRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queue = [];
    mocks.isLoading = false;
  });

  it("expands pending deals, saves notes, and moves simple stages", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AdminDealRow deal={baseDeal({ admin_notes: "[SELLER:ACCEPTED] legacy note" })} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /12 Solonos/i }));

    expect(screen.getByText(/Seller: accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/Deal Journey/i)).toBeInTheDocument();
    expect(screen.getByText("seller@example.test")).toHaveAttribute("href", "mailto:seller@example.test");
    expect(screen.getByText("+306900000000")).toHaveAttribute("href", "tel:+306900000000");
    expect(screen.getByText(/16.0% below value/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Add internal notes..."), {
      target: { value: "Call seller tomorrow" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("deal-1", "pending", "Call seller tomorrow");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Reviewed$/i }));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("deal-1", "reviewed", "Call seller tomorrow");
    });
  });

  it("opens the offer modal and sends a priced offer with terms", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AdminDealRow deal={baseDeal()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /12 Solonos/i }));
    fireEvent.click(screen.getByRole("button", { name: /Send Offer/i }));

    const dialog = screen.getByRole("dialog", { name: /Send offer/i });
    const sendButton = within(dialog).getByRole("button", { name: /Send Offer/i });
    expect(sendButton).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("189000"), {
      target: { value: "190000" },
    });
    const validityInput = dialog.querySelector<HTMLInputElement>('input[type="date"]');
    expect(validityInput).not.toBeNull();
    fireEvent.change(validityInput as HTMLInputElement, {
      target: { value: "2026-06-30" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText(/Subject to survey/i), {
      target: { value: "Proof of title first" },
    });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        "deal-1",
        "offer_sent",
        "Terms: Proof of title first | Valid until: 2026-06-30",
        190000,
      );
    });
  });

  it("records seller accepted, rejected, and counter-offer responses", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <AdminDealRow
        deal={baseDeal({ status: "offer_sent", offer_price: 190000, admin_notes: "Offer valid this week" })}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12 Solonos/i }));
    expect(screen.getByText(/Awaiting Seller Response/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Seller Accepted/i }));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("deal-1", "closed", "Offer valid this week", undefined, "accepted", undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: /Rejected/i }));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("deal-1", "reviewed", "Offer valid this week", undefined, "rejected", undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: /Counter-Offer/i }));
    fireEvent.change(screen.getByPlaceholderText("Seller's counter price"), {
      target: { value: "205000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Counter/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("deal-1", "offer_sent", "Offer valid this week", 205000, "countered", 205000);
    });
  });

  it("renders closed deal economics and fallback property metadata", () => {
    renderWithProviders(
      <AdminDealRow
        deal={baseDeal({
          status: "closed",
          property_type: null,
          bedrooms: null,
          offer_price: 185000,
        })}
        onUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12 Solonos/i }));

    expect(screen.getAllByText("property").length).toBeGreaterThan(0);
    expect(screen.getByText(/Deal Closed/i)).toBeInTheDocument();
    expect(screen.getByText("Saved vs. Market")).toBeInTheDocument();
    expect(screen.getByText("€65,000")).toBeInTheDocument();
  });
});
