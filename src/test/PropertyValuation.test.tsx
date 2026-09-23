import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { valuationV2 } from "@/test/valuationV2Fixture";

const { useAuthMock, invokeMock, toastMock, invalidateQueriesMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(), invokeMock: vi.fn(), toastMock: { error: vi.fn() }, invalidateQueriesMock: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@tanstack/react-query", async () => ({ ...(await vi.importActual("@tanstack/react-query")), useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }) }));
vi.mock("@/lib/invokeAuthenticatedFunction", () => ({ invokeAuthenticatedFunction: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/SignInForAI", () => ({ SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div> }));

import PropertyValuation from "@/components/PropertyValuation";

const props = { listingId: "a", title: "A", city: "Athens", price: 320000, sqm: 80, listingType: "sale", propertyType: "apartment" };

beforeEach(() => { useAuthMock.mockReturnValue({ user: { id: "u-1" } }); invokeMock.mockReset(); toastMock.error.mockReset(); });

describe("PropertyValuation v2", () => {
  it("gates anonymous users", () => {
    useAuthMock.mockReturnValue({ user: null }); render(<PropertyValuation {...props} />);
    expect(screen.getByText(/Sign in for Property valuation/i)).toBeInTheDocument();
  });

  it("requests v2 and renders OS values, true zero confidence, density, and unavailable unsupported fields", async () => {
    invokeMock.mockResolvedValue({ data: valuationV2(), error: null }); render(<PropertyValuation {...props} latitude={37.97} longitude={23.74} />);
    fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    expect(await screen.findByText(/€400\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence.*0\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/€4\.000\/m²/)).toBeInTheDocument();
    expect(screen.getByText(/Gross annual yield.*Unavailable/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({ body: expect.objectContaining({ responseVersion: 2, listingId: "a", latitude: 37.97, longitude: 23.74 }) }));
  });

  it("keeps provider and quota-style failures visible inline and reports them through the toast", async () => {
    invokeMock.mockResolvedValue({ data: { code: "valuation_unavailable" }, error: new Error("Valuation evidence unavailable") });
    render(<PropertyValuation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Valuation evidence unavailable");
    expect(toastMock.error).toHaveBeenCalledWith("Valuation evidence unavailable");
  });

  it("keeps analysis-only partials useful and renders preserved sections", async () => {
    invokeMock.mockResolvedValue({ data: valuationV2({ status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: null, keyFactors: [{ factor: "Transit", impact: "positive", note: "Supplied nearby station" }], redFlags: ["Seller-stated repair need"], renovationPotential: "Potential after inspection", highestBestUseHint: "Long-term use", evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" } }), error: null });
    render(<PropertyValuation {...props} />); fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Supplied nearby station/)).toBeInTheDocument();
    expect(screen.getByText(/Seller-stated repair need/)).toBeInTheDocument();
    expect(screen.getByText(/Potential after inspection/)).toBeInTheDocument();
  });

  it("keeps OS auction output separate from AI clean-market estimate and labels its assumption", async () => {
    const base = valuationV2();
    invokeMock.mockResolvedValue({ data: valuationV2({ transaction: "auction", estimateBasis: "os_auction_model", estimatedValue: 250000, auctionAdjustedValue: 400000, rangeBasis: "auctionAdjustedValue", evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "os_prediction", auctionAdjustedValue: "ai_estimate", rangeLow: "ai_estimate", rangeHigh: "ai_estimate" } } }), error: null });
    render(<PropertyValuation {...props} listingType="auction" />); fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    expect(await screen.findByText(/clear-title assumption/i)).toBeInTheDocument();
    expect(screen.getByText(/Separate OS auction-model estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/€250\.000/)).toBeInTheDocument();
  });

  it("supports the explicit analysis toggle and refresh controls", async () => {
    invokeMock.mockResolvedValue({ data: valuationV2(), error: null });
    render(<PropertyValuation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    expect(await screen.findByText("• Not a formal appraisal.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Method, legal context and limitations/i }));
    expect(screen.queryByText("• Not a formal appraisal.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Method, legal context and limitations/i }));
    expect(screen.getByText("• Not a formal appraisal.")).toBeInTheDocument();
    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Refresh analysis/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });

  it("rejects a delayed old-property response after the subject changes", async () => {
    let resolveOld!: (value: unknown) => void;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ data: valuationV2({ estimatedValue: 500000 }), error: null });
    const { rerender } = render(<PropertyValuation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Run valuation analysis/i }));
    rerender(<PropertyValuation {...props} listingId="b" title="B" price={350000} />);
    resolveOld({ data: valuationV2({ estimatedValue: 999999 }), error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /Run valuation analysis/i })).toBeInTheDocument());
    expect(screen.queryByText(/999\.999/)).not.toBeInTheDocument();
  });
});
