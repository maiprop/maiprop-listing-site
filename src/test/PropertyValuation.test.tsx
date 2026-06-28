/**
 * Tests for the `PropertyValuation` component. The data layer (auth,
 * subscription, valuation usage + record) is fully mocked so we can
 * deterministically test:
 *   - Sign-in gate
 *   - Signed-in access for free and Pro users
 *   - Server-side quota path through property-valuation
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
  VALUATION_EXTRA_COST: 39,
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
  latitude: 37.9715,
  longitude: 23.7257,
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

  it("runs for non-Pro users because the server enforces the free quota", async () => {
    useSubMock.mockReturnValue({ isPro: false });
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/240\.000/)).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object));
  });

  it("does not enforce the old client-side monthly valuation cap", async () => {
    useValMock.mockReturnValue({ data: 5 });
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object)));
  });
});


describe("PropertyValuation — happy paths", () => {
  it("passes listing identity and coordinates so the Edge Function can prefer OS valuation data", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} listingId="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/240\.000/)).toBeInTheDocument());
    expect(screen.getByText(/Underpriced/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({
        listingId: "l-1",
        city: "Athens",
        price: 250_000,
        sqm: 90,
        latitude: 37.9715,
        longitude: 23.7257,
      }),
    }));
  });

  it("calls AI directly when no listingId is provided (no OS path)", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/240\.000/)).toBeInTheDocument());
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

  it("keeps AI quota failures visible inline instead of only showing a toast", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Monthly AI valuation limit reached. Upgrade to Pro." },
      error: null,
    });

    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));

    expect(await screen.findByText(/monthly ai valuation limit reached/i)).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith("Monthly AI valuation limit reached. Upgrade to Pro.");
  });

  it("toasts when the AI returns no valuation number", async () => {
    invokeMock.mockResolvedValue({ data: { confidence: 50 }, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/no result/i)));
  });

  it("accepts a clean-market value as a valid primary valuation result", async () => {
    invokeMock.mockResolvedValue({
      data: {
        auctionAdjustedValue: 300_000,
        rangeLow: 280_000,
        rangeHigh: 320_000,
        confidence: 80,
        liquidityScore: 70,
        marketComparisonPct: 20,
        pricingPosition: "overpriced",
      },
      error: null,
    });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/300\.000/)).toBeInTheDocument());
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

describe("PropertyValuation — result UI", () => {
  it("renders execution value + red flags + key factors in the expanded section", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/240\.000/)).toBeInTheDocument());
    // Execution value pill.
    expect(screen.getByText(/Execution value/i)).toBeInTheDocument();
    expect(screen.getByText("€235.000")).toBeInTheDocument();
    // Auto-expanded after run → key factors are shown.
    expect(screen.getByText(/Location prime/)).toBeInTheDocument();
    expect(screen.getByText(/Older build/)).toBeInTheDocument();
    // Red flags.
    expect(screen.getByText(/Older electrical panel/)).toBeInTheDocument();
    expect(screen.queryByText(/Legal & Tax Overlay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Public-enriched/)).not.toBeInTheDocument();
  });

  it("keeps the legal and tax overlay for auction valuations only", async () => {
    invokeMock.mockResolvedValue({ data: validResult, error: null });
    render(<PropertyValuation {...baseProps} listingType="auction" />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/240\.000/)).toBeInTheDocument());

    expect(screen.getByText(/Legal & Tax Overlay/i)).toBeInTheDocument();
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

  it("uses the clean-market value as the primary amount when an auction adjustment is present", async () => {
    invokeMock.mockResolvedValue({
      data: {
        ...validResult,
        estimatedValue: 130_000,
        rangeLow: 120_000,
        rangeHigh: 140_000,
        auctionAdjustedValue: 154_000,
      },
      error: null,
    });
    render(<PropertyValuation {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Run AI Valuation/i }));
    await waitFor(() => expect(screen.getByText(/Hybrid clean-market value/i)).toBeInTheDocument());
    expect(screen.getByText(/154\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Auction-adjusted bid value/i)).toBeInTheDocument();
    expect(screen.getByText(/130\.000/)).toBeInTheDocument();
  });
});
