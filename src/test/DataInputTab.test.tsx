import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { hooksMock } = vi.hoisted(() => ({
  hooksMock: {
    useAgentDataInputs: vi.fn(),
    useAgentDataInputQuota: vi.fn(),
    useSubmitAgentDataInput: vi.fn(),
  },
}));

vi.mock("@/hooks/useAgentDataInputs", () => hooksMock);

vi.mock("@/lib/format", () => ({
  formatDate: (value: string | null | undefined) => value ?? "-",
  formatPrice: (value: number | null | undefined) => `price:${value ?? "-"}`,
  formatPriceFromCents: (value: number | null | undefined) => `credit:${value ?? "-"}`,
}));

import DataInputTab from "@/pages/dashboard/DataInputTab";
import type { AgentDataInput } from "@/hooks/useAgentDataInputs";

const baseInput: AgentDataInput = {
  id: "input-1",
  user_id: "agent-1",
  closed_at: "2026-04-20",
  property_address: "Ermou 12",
  property_city: "Athens",
  property_postal_code: "10563",
  property_type: "apartment",
  transaction_type: "sale",
  agent_side: "seller",
  closing_price: 250000,
  kaek: null,
  buyer_name: null,
  seller_name: null,
  notes: null,
  status: "verified",
  rejection_reason: null,
  reviewed_at: "2026-04-21",
  reviewed_by: null,
  discount_pct: 0.5,
  applied_to_invoice_at: null,
  stripe_credit_id: null,
  stripe_credit_amount_cents: null,
  stripe_credit_currency: null,
  created_at: "2026-04-19",
  updated_at: "2026-04-21",
};

beforeEach(() => {
  hooksMock.useAgentDataInputs.mockReturnValue({ data: [], isLoading: false });
  hooksMock.useAgentDataInputQuota.mockReturnValue({
    data: { used: 0, monthly_limit: 20, remaining: 20, is_banned: false },
    isLoading: false,
  });
  hooksMock.useSubmitAgentDataInput.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  });
});

describe("DataInputTab billing credit summary", () => {
  it("shows projected percent while verified credits have not been applied to billing yet", () => {
    hooksMock.useAgentDataInputs.mockReturnValue({
      data: [
        { ...baseInput, id: "verified-1", status: "verified" },
        { ...baseInput, id: "verified-2", status: "verified", stripe_credit_amount_cents: null },
        { ...baseInput, id: "pending-1", status: "pending" },
      ],
      isLoading: false,
    });

    render(<DataInputTab />);

    expect(screen.getByText("1.0%")).toBeInTheDocument();
    expect(screen.getByText(/Pending.*applies once submissions are verified\./)).toBeInTheDocument();
  });

  it("prefers applied Stripe billing credit totals once invoice credits exist", () => {
    hooksMock.useAgentDataInputs.mockReturnValue({
      data: [
        { ...baseInput, id: "credited-1", stripe_credit_amount_cents: 12500 },
        { ...baseInput, id: "credited-2", stripe_credit_amount_cents: 3750 },
        { ...baseInput, id: "pending-1", status: "pending", stripe_credit_amount_cents: null },
      ],
      isLoading: false,
    });

    render(<DataInputTab />);

    expect(screen.getByText("credit:16250")).toBeInTheDocument();
    expect(screen.getByText("Applied to upcoming invoices.")).toBeInTheDocument();
    expect(screen.getAllByText("credit:12500")).toHaveLength(1);
    expect(screen.getAllByText("credit:3750")).toHaveLength(1);
  });

  it("submits a valid closing, trims optional fields, and resets the form", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    hooksMock.useSubmitAgentDataInput.mockReturnValue({ isPending: false, mutateAsync });

    render(<DataInputTab />);

    fireEvent.change(screen.getByLabelText(/Closing date/i), { target: { value: "2026-04-20" } });
    fireEvent.change(screen.getByLabelText(/Closing price/i), { target: { value: "250000" } });
    fireEvent.change(screen.getByLabelText(/Property address/i), { target: { value: "  Ermou 12  " } });
    fireEvent.change(screen.getByLabelText(/^City/i), { target: { value: " Athens " } });
    fireEvent.change(screen.getByLabelText(/Postal code/i), { target: { value: " 10563 " } });
    fireEvent.change(screen.getByLabelText(/KAEK/i), { target: { value: " 050123456789 " } });
    fireEvent.change(screen.getByLabelText(/Buyer name/i), { target: { value: " Buyer One " } });
    fireEvent.change(screen.getByLabelText(/Seller name/i), { target: { value: " Seller One " } });
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: " Notary ref " } });

    fireEvent.click(screen.getByRole("button", { name: /submit closing/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        closed_at: "2026-04-20",
        property_address: "Ermou 12",
        property_city: "Athens",
        property_postal_code: "10563",
        transaction_type: "sale",
        agent_side: "seller",
        closing_price: 250000,
        kaek: "050123456789",
        buyer_name: "Buyer One",
        seller_name: "Seller One",
        notes: "Notary ref",
      })),
    );
    expect(screen.getByLabelText(/Closing price/i)).toHaveValue(null);
  });

  it("blocks invalid prices and disabled quota states without submitting", () => {
    const mutateAsync = vi.fn();
    hooksMock.useSubmitAgentDataInput.mockReturnValue({ isPending: false, mutateAsync });

    const { rerender } = render(<DataInputTab />);
    fireEvent.change(screen.getByLabelText(/Closing price/i), { target: { value: "-1" } });
    fireEvent.submit(screen.getByRole("button", { name: /submit closing/i }).closest("form")!);
    expect(mutateAsync).not.toHaveBeenCalled();

    hooksMock.useAgentDataInputQuota.mockReturnValue({
      data: { used: 20, monthly_limit: 20, remaining: 0, is_banned: false },
      isLoading: false,
    });
    rerender(<DataInputTab />);
    expect(screen.getByText(/Limit reached for this month/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit closing/i })).toBeDisabled();

    hooksMock.useAgentDataInputQuota.mockReturnValue({
      data: { used: 5, monthly_limit: 20, remaining: 15, is_banned: true },
      isLoading: false,
    });
    rerender(<DataInputTab />);
    expect(screen.getByText(/Data input submissions disabled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit closing/i })).not.toBeInTheDocument();
  });

  it("renders loading, empty, rejected, pending, and verified history states", () => {
    const { rerender } = render(<DataInputTab />);
    expect(screen.getByText(/No submissions yet/i)).toBeInTheDocument();

    hooksMock.useAgentDataInputs.mockReturnValue({ data: [], isLoading: true });
    rerender(<DataInputTab />);
    expect(screen.queryByText(/No submissions yet/i)).not.toBeInTheDocument();

    hooksMock.useAgentDataInputs.mockReturnValue({
      data: [
        { ...baseInput, id: "pending-1", status: "pending", property_address: "Pending Street" },
        { ...baseInput, id: "verified-1", status: "verified", property_address: "Verified Street" },
        { ...baseInput, id: "rejected-1", status: "rejected", property_address: "Rejected Street", rejection_reason: "Could not verify" },
      ],
      isLoading: false,
    });
    rerender(<DataInputTab />);

    expect(screen.getByText("3 total")).toBeInTheDocument();
    expect(screen.getByText("Pending Street")).toBeInTheDocument();
    expect(screen.getByText("Verified Street")).toBeInTheDocument();
    expect(screen.getByText("Rejected Street")).toBeInTheDocument();
    expect(screen.getByText("Could not verify")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});
