import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { valuationV2 } from "@/test/valuationV2Fixture";

const { useAuthMock, invokeMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), invokeMock: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } } }));
vi.mock("@/lib/walkScore", () => ({ walkScoreLabel: (score: number) => `Score ${score}`, walkScoreColour: () => "#16a34a" }));
vi.mock("@/components/SignInForAI", () => ({ SignInForAI: () => <div>Sign in for AI Compare</div> }));
vi.mock("@/lib/aiErrorUtils", () => ({ getAiErrorMessage: (_e: unknown, data: { error?: string } | null, fallback: string) => data?.error ?? fallback }));

import { CompareAIReports } from "@/components/CompareAIReports";
const listing = (over: Record<string, unknown> = {}) => ({ id: "a", title: "A", _raw: { id: "a", city: "Athens", address: "Street", price: 320000, sqm: 80, property_type: "apartment", listing_type: "sale", walkability_score: 0, ...over } });
const wrap = (child: React.ReactNode) => <table><tbody>{child}</tbody></table>;

beforeEach(() => { useAuthMock.mockReturnValue({ user: { id: "u-1" } }); invokeMock.mockReset(); });
const run = () => fireEvent.click(screen.getByRole("button", { name: /Run AI Analysis/i }));

describe("CompareAIReports v2", () => {
  it("requests v2 and renders source-labelled OS evidence with true zero stored score", async () => {
    invokeMock.mockImplementation((name: string) => name === "property-valuation"
      ? Promise.resolve({ data: valuationV2(), error: null })
      : Promise.resolve({ data: { safetyScore: { score: 0 }, noiseLevel: { label: "Quiet" } }, error: null }));
    render(wrap(<CompareAIReports listings={[listing()]} />)); run();
    expect(await screen.findByText(/€400,000/)).toBeInTheDocument();
    expect(screen.getByText(/^OS model prediction · market value$/)).toBeInTheDocument();
    expect(screen.getByText(/Asking versus estimate: -20%/)).toBeInTheDocument();
    expect(screen.getByText("Score 0")).toBeInTheDocument();
    expect(screen.getByText(/Stored listing data.*not independently verified/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({ body: expect.objectContaining({ responseVersion: 2 }) }));
    expect(invokeMock.mock.calls.some(([name]) => name === "property-pois")).toBe(false);
  });

  it("keeps only finite in-range stored scores, including zero, and labels each as unverified", async () => {
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? valuationV2() : {}, error: null }));
    const listings = [
      listing({ walkability_score: 0 }),
      { ...listing({ walkability_score: 82 }), id: "b", _raw: { ...listing({ walkability_score: 82 })._raw, id: "b" } },
      { ...listing({ walkability_score: 101 }), id: "c", _raw: { ...listing({ walkability_score: 101 })._raw, id: "c" } },
    ];
    render(wrap(<CompareAIReports listings={listings} />)); run();
    expect(await screen.findByText("Score 0")).toBeInTheDocument();
    expect(screen.getByText("Score 82")).toBeInTheDocument();
    expect(screen.queryByText("Score 101")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Stored listing data.*not independently verified/i)).toHaveLength(2);
  });

  it("retains neighbourhood and stored POI state when valuation fails", async () => {
    invokeMock.mockImplementation((name: string) => name === "property-valuation"
      ? Promise.resolve({ data: { code: "valuation_unavailable" }, error: new Error("unavailable") })
      : Promise.resolve({ data: { safetyScore: { score: 88 }, noiseLevel: { label: "Quiet" } }, error: null }));
    render(wrap(<CompareAIReports listings={[listing({ walkability_score: 72 })]} />)); run();
    expect(await screen.findByText("88/100 · Safe")).toBeInTheDocument();
    expect(screen.getByText("Score 72")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders analysis-only partials without fabricating a number", async () => {
    const base = valuationV2();
    const partial = valuationV2({ status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: "Useful qualitative report", evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" } });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? partial : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing()]} />)); run();
    expect(await screen.findByText("Useful qualitative report")).toBeInTheDocument();
    expect(screen.getByText("Unavailable", { selector: "span.font-display" })).toBeInTheDocument();
    expect(screen.getByText(/Valuation density: Unavailable/i)).toBeInTheDocument();
  });

  it("renders returned sale density with its derived source and selected basis", async () => {
    const density = valuationV2({
      pricePerSqmEstimate: 5250,
      evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, pricePerSqmEstimate: "derived_ai", estimatedValue: "ai_estimate" } },
    });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? density : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing()]} />)); run();
    expect(await screen.findByText(/Valuation density: €5,250\/m².*derived from unverified AI estimate.*market value basis/i)).toBeInTheDocument();
  });

  it("renders returned rental density with the monthly unit and basis", async () => {
    const base = valuationV2();
    const density = valuationV2({
      transaction: "rent", valueUnit: "EUR/month", estimateBasis: "monthly_rent", estimatedValue: 1600,
      rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: 20,
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "ai_estimate", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "derived_ai" } },
    });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? density : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing({ listing_type: "rent", price: 1600 })]} />)); run();
    expect(await screen.findByText(/Valuation density: €20\/m²\/month.*derived from unverified AI estimate.*monthly rent basis/i)).toBeInTheDocument();
  });

  it("renders factors, renovation, and tax text from a numberless partial report", async () => {
    const base = valuationV2();
    const partial = valuationV2({
      status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null,
      pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: null,
      keyFactors: [{ factor: "Layout", impact: "positive", note: "Efficient two-bedroom plan." }],
      renovationPotential: "Inspect services before budgeting works.", taxSummary: "Tax evidence is limited to supplied documents.",
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" },
    });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? partial : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing()]} />)); run();
    expect(await screen.findByText(/Efficient two-bedroom plan/)).toBeInTheDocument();
    expect(screen.getByText(/Inspect services before budgeting works/)).toBeInTheDocument();
    expect(screen.getByText(/Tax evidence is limited/)).toBeInTheDocument();
  });

  it("keeps AI clean-market auction value, range, and OS auction observation distinct", async () => {
    const auction = valuationV2({
      transaction: "auction", estimateBasis: "os_auction_model", estimatedValue: 250000,
      auctionAdjustedValue: 400000, rangeLow: 380000, rangeHigh: 420000, rangeBasis: "auctionAdjustedValue",
      providerPrediction: { value: 250000, field: "propertyPredictedPrice", model: "auction", unit: "EUR" },
      evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "os_prediction", auctionAdjustedValue: "ai_estimate", rangeLow: "ai_estimate", rangeHigh: "ai_estimate" } },
    });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? auction : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing({ listing_type: "auction" })]} />)); run();
    expect(await screen.findByText(/€400,000/)).toBeInTheDocument();
    expect(screen.getByText(/€380,000.*€420,000/)).toBeInTheDocument();
    expect(screen.getByText(/clear-title assumption/i)).toBeInTheDocument();
    expect(screen.getByText(/Separate OS auction-model estimate.*€250,000/i)).toBeInTheDocument();
  });

  it("renders an OS lease observation without assigning a monthly unit", async () => {
    const base = valuationV2();
    const lease = valuationV2({
      status: "partial", transaction: "rent", valueUnit: "EUR/month", estimateBasis: "monthly_rent",
      providerPrediction: { value: 1800, field: "propertyPredictedLeasePrice", model: "market", unit: null },
      estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: null,
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable" } },
    });
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? lease : {}, error: null }));
    render(wrap(<CompareAIReports listings={[listing({ listing_type: "rent", price: 1600 })]} />)); run();
    expect(await screen.findByText(/Rental model observation.*€1,800.*period unavailable/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/€1,800\/mo/);
  });

  it("retains a valid partial safety estimate while noise remains unavailable", async () => {
    invokeMock.mockImplementation((name: string) => Promise.resolve({
      data: name === "property-valuation" ? valuationV2() : { responseVersion: 2, safetyScore: { score: 82 }, noiseLevel: null },
      error: null,
    }));
    render(wrap(<CompareAIReports listings={[listing({ walkability_score: null })]} />)); run();
    expect(await screen.findByText(/82\/100/)).toBeInTheDocument();
    expect(screen.getByText(/AI estimate.*not independently verified/i)).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    { safetyScore: { score: "bogus" }, noiseLevel: { label: "mystery" } },
    { safetyScore: { score: Number.NaN }, noiseLevel: { label: "constructor" } },
  ])("keeps malformed safety and unknown noise unavailable", async (neighbourhood) => {
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? valuationV2() : neighbourhood, error: null }));
    render(wrap(<CompareAIReports listings={[listing({ walkability_score: null })]} />)); run();
    await waitFor(() => expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByText(/Quiet|Moderate|Noisy/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|constructor/);
  });

  it("resets old report state when compared subjects change", async () => {
    invokeMock.mockImplementation((name: string) => Promise.resolve({ data: name === "property-valuation" ? valuationV2() : {}, error: null }));
    const { rerender } = render(wrap(<CompareAIReports listings={[listing()]} />)); run();
    expect(await screen.findByText(/€400,000/)).toBeInTheDocument();
    rerender(wrap(<CompareAIReports listings={[{ ...listing(), id: "b", _raw: { ...listing()._raw, id: "b" } }]} />));
    expect(screen.getByRole("button", { name: /Run AI Analysis/i })).toBeInTheDocument();
    expect(screen.queryByText(/€400,000/)).not.toBeInTheDocument();
  });
});
