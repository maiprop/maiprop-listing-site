/**
 * Tests for the `PropertyValuation` component. The data layer (auth,
 * subscription, valuation usage + record) is fully mocked so we can
 * deterministically test:
 *   - Sign-in gate
 *   - Pro plan gate (both paths)
 *   - Per-month limit gate
 *   - OS API short-circuit (fetch-report-from-os success)
 *   - AI fallback path (property-valuation success)
 *   - AI error → toast
 *   - Result UI (estimate, score rings, pricing position, score bars)
 *   - Expanded analysis section
 *   - Refresh valuation re-runs the call
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const {
  useAuthMock, useSubMock, useValMock, invokeMock, toastMock, invalidateQueriesMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubMock: vi.fn(),
  useValMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }) };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubMock() }));
vi.mock("@/hooks/useUsageAddons", () => ({
  useValuationUsage: () => useValMock(),
  VALUATION_INCLUDED: 5,
  VALUATION_EXTRA_COST: 9,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/aiErrorUtils", () => ({
  getAiErrorMessage: (e: unknown, _x: unknown, fb: string) =>
    (e instanceof Error && e.message) || fb,
}));
vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));

import PropertyValuation from "@/components/PropertyValuation";

const baseProps = {
  title: "Bright apt",
  city: "Athens",
  address: "Plaka 1",
  price: 250_000,
  sqm: 90,
};

const validResult = {
  estimatedValue: 240_000,
  rangeLow: 220_000,
  rangeHigh: 260_000,
  executionValue: 235_000,
  pricePerSqmEstimate: 2667,
  confidence: 88,
  confidenceLabel: "High",
  liquidityScore: 72,
  marketComparison: "below_market",
  marketComparisonPct: -4,
  pricingPosition: "underpriced",
  methodUsed: "Comparable sales + hedonic regression",
  valuationMode: "MODE_2_PUBLIC_ENRICHED",
  summary: "A solid Plaka apartment with strong comps.",
  keyFactors: [
    { factor: "Location prime", impact: "positive", note: "Tourist hotspot" },
    { factor: "Older build", impact: "negative", note: "1985 construction" },
  ],
  legalCleanliness: 80,
  planningCertainty: 70,
  taxFriction: 30,
  transferReadiness: 75,
  legalSummary: "Title clean.",
  taxSummary: "Standard transfer tax.",
  objectiveValueProxy: 180_000,
  renovationPotential: "Kitchen + baths refresh adds value.",
  rentalYieldEstimate: 4.2,
  highestBestUseHint: "Short-term rental",
  redFlags: ["Older electrical panel"],
  auctionAdjustedValue: null,
  listingQualityScore: 85,
};

beforeEach(() => {
  useAuthMock.mockReset();
  useSubMock.mockReset();
  useValMock.mockReset();
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  useSubMock.mockReturnValue({ isPro: true });
  useValMock.mockReturnValue({ data: 0 });
});

describe("PropertyValuation — gates", () => {
  it("renders the sign-in prompt when no user is logged in", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<PropertyValuation {...baseProps} />);
    expect(screen.getByText(/Sign in for Property Valuation/i)).toBeInTheDocument();
  });

  it("toasts a Pro-required error when a non-Pro user clicks Run", () => {
    useSubMock.mockReturnValue({ isPro: false });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Pro plan/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("toasts the limit-reached message when monthly quota is exhausted", () => {
    useValMock.mockReturnValue({ data: 5 });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/included valuations/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("renders the remaining-quota copy when there is at least one valuation left", () => {
    useValMock.mockReturnValue({ data: 2 });
    render(<PropertyValuation {...baseProps} />);
    expect(screen.getByText(/3 of 5 valuations remaining/i)).toBeInTheDocument();
  });
});

describe("PropertyValuation — happy paths", () => {
  it("uses the OS API short-circuit when listingId is provided and OS returns a report", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "fetch-report-from-os")
        return Promise.resolve({ data: { ok: true, report: validResult }, error: null });
      throw new Error("AI should not be called");
    });
    render(<PropertyValuation {...baseProps} listingId="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText("€240.000")).toBeInTheDocument());
    // Pricing badge "Underpriced".
    expect(screen.getByText(/Underpriced/i)).toBeInTheDocument();
  });

  it("falls back to property-valuation when the OS API returns no report", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "fetch-report-from-os")
        return Promise.resolve({ data: { ok: false, report: null }, error: null });
      if (name === "property-valuation")
        return Promise.resolve({ data: validResult, error: null });
      throw new Error("unexpected " + name);
    });
    render(<PropertyValuation {...baseProps} listingId="l-2" />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText("€240.000")).toBeInTheDocument());
    // Both score rings are rendered. Confidence value 88 + liquidity 72.
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("calls AI directly when no listingId is provided (no OS path)", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText("€240.000")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({ city: "Athens", price: 250_000, sqm: 90 }),
    }));
  });

  it("toasts the AI error message when invoke rejects", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("AI down") });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("AI down"));
  });

  it("toasts when the AI returns a data.error payload", async () => {
    invokeMock.mockResolvedValue({ data: { error: "rate-limited" }, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("rate-limited"));
  });

  it("toasts when the AI returns no estimatedValue", async () => {
    invokeMock.mockResolvedValue({ data: { confidence: 50 }, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/no result/i)));
  });
});

describe("PropertyValuation — result UI", () => {
  it("renders execution value + red flags + key factors in the expanded section", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText("€240.000")).toBeInTheDocument());
    // Execution value pill.
    expect(screen.getByText(/Execution value/i)).toBeInTheDocument();
    expect(screen.getByText("€235.000")).toBeInTheDocument();
    // Auto-expanded after run → key factors are shown.
    expect(screen.getByText(/Location prime/)).toBeInTheDocument();
    expect(screen.getByText(/Older build/)).toBeInTheDocument();
    // Red flags.
    expect(screen.getByText(/Older electrical panel/)).toBeInTheDocument();
    // Mode label.
    expect(screen.getByText(/Public-enriched/)).toBeInTheDocument();
  });

  it("Hide/Show analysis toggles the expanded panel", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/Hide analysis/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Hide analysis/i }));
    expect(screen.queryByText(/Location prime/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Full analysis/i }));
    expect(screen.getByText(/Location prime/)).toBeInTheDocument();
  });

  it("Refresh valuation re-runs the AI call", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/Refresh valuation/i)).toBeInTheDocument());
    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Refresh valuation/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });

  it("renders the Auction-Adjusted Value pill when it is non-null", async () => {
    invokeMock.mockResolvedValue({
      data: { ...validResult, auctionAdjustedValue: 200_000 },
      error: null,
    });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/Auction-Adjusted Value/i)).toBeInTheDocument());
    expect(screen.getByText(/Clean market value/i)).toBeInTheDocument();
    expect(screen.getByText("€200.000")).toBeInTheDocument();
  });
});
