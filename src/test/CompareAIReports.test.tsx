/**
 * Tests for the `CompareAIReports` row component. The component renders
 * inline as <tr> rows so we wrap it in a <table>/<tbody>. We mock
 * supabase.functions.invoke for the three edge functions (valuation,
 * neighbourhood-report, property-pois) and the auth + walk score libs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { useAuthMock, invokeMock, computeWalkScoreMock, getAiErrMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  invokeMock: vi.fn(),
  computeWalkScoreMock: vi.fn(),
  getAiErrMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock("@/lib/aiErrorUtils", () => ({ getAiErrorMessage: (...a: unknown[]) => getAiErrMock(...a) }));
vi.mock("@/lib/walkScore", () => ({
  computeWalkScore: (...a: unknown[]) => computeWalkScoreMock(...a),
  walkScoreLabel: (s: number) => `Score ${s}`,
  walkScoreColour: () => "#16a34a",
}));
vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));

import { CompareAIReports } from "@/components/CompareAIReports";

const wrap = (children: React.ReactNode) => (
  <table><tbody>{children}</tbody></table>
);

const baseListing = (over: Record<string, unknown> = {}) => ({
  id: "l-1",
  title: "Bright 2BR",
  _raw: {
    city: "Athens",
    address: "Plaka 10",
    price: 250_000,
    sqm: 90,
    bedrooms: 2,
    bathrooms: 1,
    property_type: "apartment",
    listing_type: "sale",
    floor: 3,
    year_built: 1995,
    energy_class: "B",
    price_per_sqm: 2778,
    has_parking: true,
    has_pool: false,
    has_elevator: true,
    region: "attica",
    latitude: 37.97,
    longitude: 23.74,
    ...over,
  },
});

beforeEach(() => {
  useAuthMock.mockReset();
  invokeMock.mockReset();
  computeWalkScoreMock.mockReset();
  getAiErrMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  computeWalkScoreMock.mockReturnValue(82);
  getAiErrMock.mockImplementation((_e: unknown, x: { error?: string } | null, fb: string) =>
    x?.error || fb,
  );
});

describe("CompareAIReports — gated empty state", () => {
  it("renders the SignInForAI prompt when no user is logged in", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    expect(screen.getByText(/Sign in for AI Compare/i)).toBeInTheDocument();
  });

  it("renders the 'Run AI Analysis' CTA when logged in but not yet triggered", () => {
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    expect(screen.getByRole("button", { name: /Run AI Analysis/i })).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does nothing when the unauthenticated CTA is somehow clicked (defensive)", () => {
    // The CTA only renders for authenticated users — for the unauth case the
    // SignInForAI block is shown instead, so no fetchReports button exists.
    useAuthMock.mockReturnValue({ user: null });
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    expect(screen.queryByRole("button", { name: /Run AI Analysis/i })).toBeNull();
  });
});

describe("CompareAIReports — Run AI Analysis happy path", () => {
  it("invokes the 3 edge functions, then renders valuation + walk + safety + noise rows", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "property-valuation")
        return Promise.resolve({
          data: {
            estimatedValue: 240_000,
            auctionAdjustedValue: 300_000,
            rangeLow: 220_000,
            rangeHigh: 260_000,
            confidence: 0.9,
            marketComparison: "above_market",
            marketComparisonPct: 20,
            rentalYieldEstimate: 4.5,
          },
          error: null,
        });
      if (name === "neighbourhood-report")
        return Promise.resolve({
          data: {
            safetyScore: { score: 88 },
            noiseLevel: { label: "Quiet" },
          },
          error: null,
        });
      if (name === "property-pois")
        return Promise.resolve({ data: { pois: [{ distanceKm: 0.3, category: "supermarket" }] }, error: null });
      throw new Error("unexpected " + name);
    });
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));

    // Valuation cell shows the formatted clean-market estimate + market badge.
    await waitFor(() => expect(screen.getByText(/300,000/)).toBeInTheDocument());
    expect(screen.getByText(/Above Mkt/i)).toBeInTheDocument();
    expect(screen.getByText(/Yield:/i)).toBeInTheDocument();
    // Walk score badge text uses our mocked label.
    expect(screen.getByText("Score 82")).toBeInTheDocument();
    // Safety bar shows the score "/100".
    expect(screen.getByText(/88\/100/)).toBeInTheDocument();
    // Noise badge is "Quiet".
    expect(screen.getByText(/Quiet/i)).toBeInTheDocument();

    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({ city: "Athens", sqm: 90, propertyType: "apartment" }),
    }));
    expect(invokeMock).toHaveBeenCalledWith("neighbourhood-report", expect.any(Object));
    expect(invokeMock).toHaveBeenCalledWith("property-pois", expect.any(Object));
  });

  it("supports primitive safetyScore + noise strings (legacy edge fn shape)", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "property-valuation")
        return Promise.resolve({
          data: {
            estimatedValue: 100, rangeLow: 90, rangeHigh: 110, confidence: 0.5,
            marketComparison: "at_market", marketComparisonPct: 0, rentalYieldEstimate: 3,
          },
          error: null,
        });
      if (name === "neighbourhood-report")
        return Promise.resolve({ data: { safety_score: 60, noise_level: "high" }, error: null });
      if (name === "property-pois")
        return Promise.resolve({ data: { pois: [] }, error: null });
      throw new Error("unexpected " + name);
    });
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));
    await waitFor(() => expect(screen.getByText(/60\/100/)).toBeInTheDocument());
    expect(screen.getByText(/At Market/i)).toBeInTheDocument();
    expect(screen.getByText(/Noisy/i)).toBeInTheDocument();
  });

  it("normalizes sparse successful valuation payloads before rendering", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "property-valuation")
        return Promise.resolve({ data: {}, error: null });
      if (name === "neighbourhood-report")
        return Promise.resolve({ data: { safety_score: 70, noise_level: "moderate" }, error: null });
      if (name === "property-pois")
        return Promise.resolve({ data: { pois: [] }, error: null });
      throw new Error("unexpected " + name);
    });
    render(wrap(<CompareAIReports listings={[baseListing({ price: 250_000 })]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));

    await waitFor(() => expect(screen.getByText(/250,000/)).toBeInTheDocument());
    expect(screen.getByText(/At Market/i)).toBeInTheDocument();
    expect(screen.getByText(/225,000/)).toBeInTheDocument();
    expect(screen.getByText(/275,000/)).toBeInTheDocument();
  });

  it("renders em-dashes when valuation fails", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "property-valuation")
        return Promise.resolve({ data: null, error: { message: "limit hit" } });
      if (name === "neighbourhood-report")
        return Promise.resolve({ data: null, error: { message: "limit hit" } });
      return Promise.resolve({ data: null, error: null });
    });
    render(wrap(<CompareAIReports listings={[baseListing()]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));
    // After invocation the loaders are replaced by em-dashes.
    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  it("skips POI lookup when latitude/longitude are missing (walk score stays null)", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "property-valuation")
        return Promise.resolve({
          data: {
            estimatedValue: 200, rangeLow: 180, rangeHigh: 220,
            confidence: 0.8, marketComparison: "at_market", marketComparisonPct: 0,
            rentalYieldEstimate: 3,
          },
          error: null,
        });
      if (name === "neighbourhood-report")
        return Promise.resolve({ data: { safety_score: 70, noise_level: "moderate" }, error: null });
      throw new Error("should not be called: " + name);
    });
    render(wrap(<CompareAIReports listings={[baseListing({ latitude: null, longitude: null })]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));
    await waitFor(() => expect(screen.getByText(/€200/)).toBeInTheDocument());
    // walkScore stays null → render falls through to "—" in the walk-score row
    expect(invokeMock).not.toHaveBeenCalledWith("property-pois", expect.any(Object));
  });

  it("supports listings without a `_raw` envelope (fallback path)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    const flat = {
      id: "l-1", title: "Flat", city: "Athens", address: "X",
      price: 100, sqm: 80, bedrooms: 1, bathrooms: 1,
      property_type: "apartment", listing_type: "sale", region: "attica",
    };
    render(wrap(<CompareAIReports listings={[flat]} />));
    fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    // Even with no _raw, the city is read from the flat shape.
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({ city: "Athens" }),
    }));
  });
});
