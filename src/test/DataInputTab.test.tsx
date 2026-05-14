import { render, screen } from "@testing-library/react";
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
  closing_price: 250000,
  kaek: null,
  buyer_name: null,
  seller_name: null,
  notes: null,
  status: "verified",
  rejection_reason: null,
  reviewed_at: "2026-04-21",
  reviewed_by: null,
  discount_pct: 0,
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
});
