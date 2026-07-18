import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PropertyValuation from "@/components/PropertyValuation";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { renderWithProviders } from "@/test/utils";

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

  it("renders the detailed valuation result as monthly rent", async () => {
    invokeAuthenticatedFunctionMock.mockResolvedValueOnce({
      error: null,
      data: {
        estimatedValue: 1600,
        rangeLow: 1450,
        rangeHigh: 1725,
        executionValue: 1600,
        pricePerSqmEstimate: 20,
        confidence: 82,
        confidenceLabel: "High",
        liquidityScore: 76,
        marketComparison: "above_market",
        marketComparisonPct: 6,
        pricingPosition: "fair",
        methodUsed: "Monthly rental valuation using mAI Prop OS lease evidence",
        valuationMode: "MODE_2_PUBLIC_ENRICHED",
        summary: "Recent rental comparables support the monthly rent.",
        keyFactors: [],
        legalCleanliness: 70,
        planningCertainty: 72,
        taxFriction: 20,
        transferReadiness: 70,
        legalSummary: "Lease context looks normal.",
        taxSummary: "Normal lease taxation assumed.",
        objectiveValueProxy: null,
        renovationPotential: null,
        rentalYieldEstimate: 0,
        highestBestUseHint: null,
        redFlags: [],
        auctionAdjustedValue: null,
        listingQualityScore: 82,
      },
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

    fireEvent.click(screen.getByRole("button", { name: /Run AI Rent Valuation/i }));

    await waitFor(() => expect(screen.getByText("AI Monthly Rent")).toBeInTheDocument());
    expect(screen.getByText("€1.600/mo")).toBeInTheDocument();
    expect(screen.getByText(/€1.450.*€1.725\/mo/)).toBeInTheDocument();
    expect(screen.getByText("vs. Listed Rent")).toBeInTheDocument();
    expect(screen.getByText("Rent / sqm")).toBeInTheDocument();
    expect(screen.getByText("€20/sqm/month")).toBeInTheDocument();
  });
});
