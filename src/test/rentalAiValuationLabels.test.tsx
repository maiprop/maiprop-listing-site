import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PropertyValuation from "@/components/PropertyValuation";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { renderWithProviders } from "@/test/utils";
import { valuationV2 } from "@/test/valuationV2Fixture";

const { invokeAuthenticatedFunctionMock, useAuthMock } = vi.hoisted(() => ({
  invokeAuthenticatedFunctionMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/lib/invokeAuthenticatedFunction", () => ({
  invokeAuthenticatedFunction: invokeAuthenticatedFunctionMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: useAuthMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const rentalUser = { id: "user-1", email: "user@test.local" } as User;

beforeEach(() => {
  invokeAuthenticatedFunctionMock.mockReset();
  useAuthMock.mockReturnValue({ user: rentalUser });
});

describe("rental AI valuation labels", () => {
  it("renders AI Insights using monthly-rent units for rental listings", () => {
    renderWithProviders(
      <PropertyAIInsightsSection
        user={rentalUser}
        isPro
        loading={false}
        data={{
          vsMarket: 4,
          rentalYield: 0,
          estimatedValue: 1600,
          pricePerSqmEstimate: 20,
          marketComparison: "at_market",
          confidenceLabel: "High",
        }}
        listingType="rent"
      />,
    );

    expect(screen.getByText("vs Rental Market")).toBeInTheDocument();
    expect(screen.getByText("Rent / m² / mo")).toBeInTheDocument();
    expect(screen.getByText("€20/m²/mo")).toBeInTheDocument();
    expect(screen.getByText("AI Rent Estimate")).toBeInTheDocument();
    expect(screen.getByText("€1.600/mo")).toBeInTheDocument();
  });

  it("does not label a missing rental estimate as a monthly price", () => {
    renderWithProviders(
      <PropertyAIInsightsSection
        user={rentalUser}
        isPro
        loading={false}
        data={{
          vsMarket: null,
          rentalYield: 0,
          estimatedValue: null,
          marketComparison: null,
          confidenceLabel: "Medium",
        }}
        listingType="rent"
      />,
    );

    expect(screen.getByText("AI Rent Estimate")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("€0/mo")).not.toBeInTheDocument();
  });

  it("renders returned new-build density with derived source and selected basis", () => {
    const report = valuationV2({
      pricePerSqmEstimate: 5250,
      evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, pricePerSqmEstimate: "derived_ai", estimatedValue: "ai_estimate" } },
    });
    renderWithProviders(
      <PropertyAIInsightsSection user={rentalUser} isPro loading={false} listingType="new_build" data={{
        vsMarket: null, rentalYield: null, estimatedValue: 400000, pricePerSqmEstimate: 5250,
        marketComparison: null, confidenceLabel: "High", estimateSource: "ai_estimate", estimateUnit: "EUR", valuation: report,
      }} />,
    );
    expect(screen.getByText(/Valuation density: €5,250\/m².*derived from unverified AI estimate.*market value basis/i)).toBeInTheDocument();
  });

  it("keeps unavailable new-build density explicit", () => {
    const base = valuationV2();
    const report = valuationV2({
      pricePerSqmEstimate: null,
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, pricePerSqmEstimate: "unavailable" } },
    });
    renderWithProviders(
      <PropertyAIInsightsSection user={rentalUser} isPro loading={false} listingType="new_build" data={{
        vsMarket: null, rentalYield: null, estimatedValue: 400000,
        marketComparison: null, confidenceLabel: "High", estimateSource: "os_prediction", estimateUnit: "EUR", valuation: report,
      }} />,
    );
    expect(screen.getByText(/Valuation density: Unavailable/i)).toBeInTheDocument();
  });

  it("uses the selected response unit and preserves a useful text-only report", () => {
    const base = valuationV2();
    const partial = valuationV2({
      status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null,
      pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: null,
      keyFactors: [{ factor: "Layout", impact: "positive", note: "Efficient circulation." }],
      renovationPotential: "Survey the services before works.", taxSummary: "Only supplied tax context is included.",
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" },
    });
    renderWithProviders(
      <PropertyAIInsightsSection user={rentalUser} isPro loading={false} listingType="rent" data={{
        vsMarket: null, rentalYield: null, estimatedValue: null, marketComparison: null,
        confidenceLabel: null, estimateSource: null, estimateUnit: null, valuation: partial,
      }} />,
    );
    expect(screen.getByText(/Efficient circulation/)).toBeInTheDocument();
    expect(screen.getByText(/Survey the services before works/)).toBeInTheDocument();
    expect(screen.getByText(/Only supplied tax context/)).toBeInTheDocument();
  });

  it("renders clean auction AI and separate OS auction quantities with the selected range", () => {
    const auction = valuationV2({
      transaction: "auction", valueUnit: "EUR", estimateBasis: "os_auction_model", estimatedValue: 250000,
      auctionAdjustedValue: 400000, rangeLow: 380000, rangeHigh: 420000, rangeBasis: "auctionAdjustedValue",
      providerPrediction: { value: 250000, field: "propertyPredictedPrice", model: "auction", unit: "EUR" },
      evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "os_prediction", auctionAdjustedValue: "ai_estimate", rangeLow: "ai_estimate", rangeHigh: "ai_estimate" } },
    });
    renderWithProviders(
      <PropertyAIInsightsSection user={rentalUser} isPro loading={false} listingType="auction" data={{
        vsMarket: null, rentalYield: null, estimatedValue: 400000, marketComparison: null,
        confidenceLabel: "High", estimateSource: "ai_estimate", estimateUnit: "EUR", valuation: auction,
      }} />,
    );
    expect(screen.getByText(/clear-title assumption/i)).toBeInTheDocument();
    expect(screen.getByText(/€380.*€420/)).toBeInTheDocument();
    expect(screen.getByText("Separate OS auction-model estimate:").closest("p")).toHaveTextContent(/€250[,.]000.*not clean-market/i);
  });

  it("renders an unknown-period OS lease observation without monthly labelling", () => {
    const base = valuationV2();
    const lease = valuationV2({
      status: "partial", transaction: "rent", valueUnit: "EUR/month", estimateBasis: "monthly_rent",
      providerPrediction: { value: 1800, field: "propertyPredictedLeasePrice", model: "market", unit: null },
      estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: null,
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable" } },
    });
    renderWithProviders(
      <PropertyAIInsightsSection user={rentalUser} isPro loading={false} listingType="rent" data={{
        vsMarket: null, rentalYield: null, estimatedValue: null, marketComparison: null,
        confidenceLabel: null, estimateSource: null, estimateUnit: null, valuation: lease,
      }} />,
    );
    expect(screen.getByText("Rental model observation:").closest("p")).toHaveTextContent(/€1[,.]800.*period unavailable/i);
    expect(document.body.textContent).not.toMatch(/1[.,]800\/mo/);
  });

  it("renders the detailed valuation result as monthly rent", async () => {
    invokeAuthenticatedFunctionMock.mockResolvedValueOnce({
      error: null,
      data: valuationV2({ transaction: "rent", valueUnit: "EUR/month", estimateBasis: "monthly_rent", estimatedValue: 1600, rangeLow: 1450, rangeHigh: 1725, pricePerSqmEstimate: 20, confidence: 82, confidenceLabel: "High", liquidityScore: 76, marketComparison: "above_market", marketComparisonPct: 6, pricingPosition: "overpriced", summary: "Recent rental evidence supports the monthly rent.", evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "ai_estimate", rangeLow: "ai_estimate", rangeHigh: "ai_estimate", pricePerSqmEstimate: "derived_ai", confidence: "ai_estimate", liquidityScore: "ai_estimate", marketComparisonPct: "derived_ai" }, analysis: "ai_estimate" } }),
    });

    renderWithProviders(
      <PropertyValuation
        title="Recent Glyfada rental"
        city="Glyfada"
        price={1500}
        sqm={80}
        propertyType="apartment"
        listingType="rent"
        yearBuilt={2024}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));

    await waitFor(() => expect(screen.getByText("Primary estimate")).toBeInTheDocument());
    expect(screen.getByText("€1.600/mo")).toBeInTheDocument();
    expect(screen.getByText(/€1.450.*€1.725\/mo/)).toBeInTheDocument();
    expect(screen.getByText(/Asking versus estimate/)).toBeInTheDocument();
    expect(screen.getByText(/€20\/m²\/mo/)).toBeInTheDocument();
  });
});
