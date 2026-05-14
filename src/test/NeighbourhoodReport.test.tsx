/**
 * Tests for `NeighbourhoodReport`. Mocks supabase + auth + sonner. Covers:
 *   - Sign-in gate
 *   - Initial Load button → fetch
 *   - OS API short-circuit on listingId
 *   - Fallback to neighbourhood-report when OS misses
 *   - Error toast + retry
 *   - Full result UI (highlights, trend, noise, safety, walkability,
 *     development projects, investment outlook, demographics, refresh)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthMock, invokeMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock("@/lib/aiErrorUtils", () => ({
  getAiErrorMessage: (e: unknown, _x: unknown, fb: string) =>
    (e instanceof Error && e.message) || fb,
}));
vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import NeighbourhoodReport from "@/components/NeighbourhoodReport";

const baseProps = {
  city: "Athens",
  address: "Plaka 1",
  region: "attica",
  propertyType: "apartment",
  lat: 37.97,
  lng: 23.74,
  isPro: true, // default to Pro so tests exercise the load/fetch flows
};

const fullData = {
  areaName: "Plaka",
  walkabilityScore: 88,
  pricePerSqmTrend: {
    current: 3500,
    oneYearAgo: 3200,
    threeYearsAgo: 2900,
    fiveYearsAgo: 2500,
    changeYoY: 9.4,
    change5Y: 40,
  },
  noiseLevel: { score: 5, label: "Moderate", notes: "Lively at night" },
  safetyScore: { score: 82, label: "Very Safe", trend: "Improving", notes: "Police presence" },
  developmentProjects: [
    {
      name: "Acropolis Walk",
      type: "infrastructure",
      status: "under_construction",
      impact: "positive",
      estimatedCompletion: "Q3 2026",
      distanceKm: 0.4,
    },
    {
      name: "New Metro Stop",
      type: "transit",
      status: "planned",
      impact: "positive",
      estimatedCompletion: "2027",
      distanceKm: 1.5,
    },
  ],
  demographics: { primaryResidents: "Mixed locals + tourists", avgAge: 38, tourismImpact: "High" },
  investmentOutlook: { rating: "Excellent", summary: "Tier 1 Athens micro-market." },
  areaHighlights: ["UNESCO district", "Walkable to Acropolis"],
};

beforeEach(() => {
  useAuthMock.mockReset();
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

describe("NeighbourhoodReport — gates", () => {
  it("renders the SignInForAI block when no user is logged in", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<NeighbourhoodReport {...baseProps} />);
    expect(screen.getByText(/Sign in for Neighbourhood Report/i)).toBeInTheDocument();
  });

  it("renders the upgrade CTA when the user is logged in but not Pro", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NeighbourhoodReport {...baseProps} isPro={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load Neighbourhood Report/i })).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("renders the Load CTA when user is logged in but data hasn't been fetched", () => {
    render(<NeighbourhoodReport {...baseProps} />);
    expect(screen.getByRole("button", { name: /Load Neighbourhood Report/i })).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("NeighbourhoodReport — fetch flows", () => {
  it("uses the OS API short-circuit when listingId is provided and the report is valid", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "fetch-report-from-os")
        return Promise.resolve({ data: { ok: true, report: fullData }, error: null });
      throw new Error("AI should not be called");
    });
    render(<NeighbourhoodReport {...baseProps} listingId="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    // Highlights pills.
    expect(screen.getByText(/UNESCO district/)).toBeInTheDocument();
    // Investment outlook value.
    expect(screen.getByText(/Excellent/)).toBeInTheDocument();
  });

  it("falls back to neighbourhood-report when OS returns no usable report", async () => {
    invokeMock.mockImplementation((name: string) => {
      if (name === "fetch-report-from-os")
        return Promise.resolve({ data: { ok: false, report: null }, error: null });
      if (name === "neighbourhood-report")
        return Promise.resolve({ data: fullData, error: null });
      throw new Error("unexpected " + name);
    });
    render(<NeighbourhoodReport {...baseProps} listingId="l-2" />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("calls neighbourhood-report directly when no listingId is given", async () => {
    invokeMock.mockResolvedValue({ data: fullData, error: null });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      "neighbourhood-report",
      expect.objectContaining({
        body: expect.objectContaining({ city: "Athens", lat: 37.97, lng: 23.74 }),
      }),
    );
  });

  it("renders the loading skeleton while the fetch is in flight", async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    expect(screen.getByText(/AI is analysing/i)).toBeInTheDocument();
    resolve({ data: fullData, error: null });
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
  });

  it("renders the error pill + Retry button when invoke rejects, and Retry re-invokes", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("AI down") });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText("AI down")).toBeInTheDocument());
    expect(toastMock.error).toHaveBeenCalledWith("AI down");
    invokeMock.mockResolvedValueOnce({ data: fullData, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
  });

  it("renders the error pill when the AI returns a data.error payload", async () => {
    invokeMock.mockResolvedValue({ data: { error: "rate-limit" }, error: null });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText("rate-limit")).toBeInTheDocument());
  });
});

describe("NeighbourhoodReport — full result UI", () => {
  it("renders all sections (trend, noise, safety, walkability, projects, outlook, demographics)", async () => {
    invokeMock.mockResolvedValue({ data: fullData, error: null });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());

    // Price per m² + YoY pill.
    expect(screen.getByText("€3,500")).toBeInTheDocument();
    expect(screen.getByText(/\+9\.4% YoY/)).toBeInTheDocument();
    // Noise + Safety labels.
    expect(screen.getByText(/Moderate/)).toBeInTheDocument();
    expect(screen.getByText(/Very Safe/)).toBeInTheDocument();
    // Walkability label (88 → "Very Walkable").
    expect(screen.getByText(/Very Walkable/)).toBeInTheDocument();
    // Project rows.
    expect(screen.getByText(/Acropolis Walk/)).toBeInTheDocument();
    expect(screen.getByText(/New Metro Stop/)).toBeInTheDocument();
    // Demographics.
    expect(screen.getByText(/Mixed locals \+ tourists/)).toBeInTheDocument();
    expect(screen.getByText(/High tourism/i)).toBeInTheDocument();
  });

  it("Refresh report re-invokes the edge fn", async () => {
    invokeMock.mockResolvedValue({ data: fullData, error: null });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Refresh report/i)).toBeInTheDocument());
    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Refresh report/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });

  it("hides the walkability card when walkabilityScore is null", async () => {
    invokeMock.mockResolvedValue({
      data: { ...fullData, walkabilityScore: null },
      error: null,
    });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(screen.queryByText(/Walkability/)).toBeNull();
  });

  it("hides the development projects section when the array is empty", async () => {
    invokeMock.mockResolvedValue({
      data: { ...fullData, developmentProjects: [] },
      error: null,
    });
    render(<NeighbourhoodReport {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(screen.queryByText(/Development Projects/i)).toBeNull();
  });
});
