/**
 * Tests for `NeighbourhoodReport`. Mocks supabase + auth + sonner. Covers:
 *   - Sign-in gate
 *   - Initial Load button → fetch
 *   - Listing-scoped neighbourhood-report calls
 *   - Error toast + retry
 *   - Full result UI (highlights, trend, noise, safety, walkability,
 *     development projects, investment outlook, demographics, refresh)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthMock, invokeMock, rpcMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));
vi.mock("@/lib/aiErrorUtils", () => ({
  getAiErrorMessage: (e: unknown, _x: unknown, fb: string) =>
    (e instanceof Error && e.message) || fb,
  isAiMonthlyLimitError: () => false,
}));
vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import NeighbourhoodReport from "@/components/NeighbourhoodReport";

const loadReport = async () => {
  await screen.findByText(/1 \/ 5 used/i);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Load Neighbourhood Report/i }));
    await Promise.resolve();
  });
};

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

const quotaData = { allowed: true, reason: null, used: 1, limit: 5 };
const mockQuotaAndReport = (
  report: unknown = fullData,
  quota: unknown = quotaData,
) => {
  invokeMock.mockImplementation(async (name: string) => {
    if (name === "ai-quota-status") return { data: quota, error: null };
    return { data: report, error: null };
  });
};
const reportCalls = () =>
  invokeMock.mock.calls.filter(([name]) => name === "neighbourhood-report");

beforeEach(() => {
  useAuthMock.mockReset();
  invokeMock.mockReset();
  rpcMock.mockReset();
  mockQuotaAndReport();
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

  it("renders the Load CTA when the user is logged in but not Pro", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NeighbourhoodReport {...baseProps} isPro={false} />
      </MemoryRouter>,
    );
    await screen.findByText(/1 \/ 5 used/i);
    expect(screen.getByRole("button", { name: /Load Neighbourhood Report/i })).toBeInTheDocument();
    expect(reportCalls()).toHaveLength(0);
  });

  it("renders the Load CTA when user is logged in but data hasn't been fetched", async () => {
    render(<NeighbourhoodReport {...baseProps} />);
    await screen.findByText(/1 \/ 5 used/i);
    expect(screen.getByRole("button", { name: /Load Neighbourhood Report/i })).toBeInTheDocument();
    expect(reportCalls()).toHaveLength(0);
  });
});

describe("NeighbourhoodReport — fetch flows", () => {
  it("calls neighbourhood-report when listingId is provided so quota and GPT analysis are enforced", async () => {
    mockQuotaAndReport(fullData);
    render(<NeighbourhoodReport {...baseProps} listingId="l-1" />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());

    const counter = screen.getByLabelText(/Neighbourhood Report request counter/i);
    expect(counter).toHaveTextContent(/1 \/ 5 used/i);
    expect(counter).toHaveTextContent(/Free 5\/mo \| Pro 50\/mo/i);
    expect(invokeMock).toHaveBeenCalledWith("ai-quota-status", {
      body: { bucket: "neighbourhood-report" },
      timeout: 4_000,
    });
    expect(screen.getByText(/UNESCO district/)).toBeInTheDocument();
    expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    expect(reportCalls()).toHaveLength(1);
    expect(reportCalls()[0]).toEqual([
      "neighbourhood-report",
      expect.objectContaining({ body: expect.objectContaining({ listingId: "l-1" }) }),
    ]);
  });

  it("calls neighbourhood-report directly when no listingId is given", async () => {
    mockQuotaAndReport(fullData);
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(reportCalls()).toHaveLength(1);
    expect(reportCalls()[0]).toEqual([
      "neighbourhood-report",
      expect.objectContaining({
        body: expect.objectContaining({ city: "Athens", lat: 37.97, lng: 23.74 }),
      }),
    ]);
  });

  it("passes municipality to the edge function for OS-backed local reports", async () => {
    mockQuotaAndReport(fullData);
    render(<NeighbourhoodReport {...baseProps} municipality="Agios Dimitrios" />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(reportCalls()[0]).toEqual([
      "neighbourhood-report",
      expect.objectContaining({
        body: expect.objectContaining({
          city: "Athens",
          municipality: "Agios Dimitrios",
          lat: 37.97,
          lng: 23.74,
        }),
      }),
    ]);
  });

  it("renders the loading skeleton while the fetch is in flight", async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockImplementation((name: string) => {
      if (name === "ai-quota-status") return Promise.resolve({ data: quotaData, error: null });
      return new Promise((r) => { resolve = r; });
    });
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    expect(screen.getByText(/AI is analysing/i)).toBeInTheDocument();
    resolve({ data: fullData, error: null });
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
  });

  it("renders the error pill + Retry button when invoke rejects, and Retry re-invokes", async () => {
    let reportAttempt = 0;
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") return { data: quotaData, error: null };
      reportAttempt += 1;
      return reportAttempt === 1
        ? { data: null, error: new Error("AI down") }
        : { data: fullData, error: null };
    });
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText("AI down")).toBeInTheDocument());
    expect(toastMock.error).toHaveBeenCalledWith("AI down");
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
  });

  it("renders the error pill when the AI returns a data.error payload", async () => {
    mockQuotaAndReport({ error: "rate-limit" });
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText("rate-limit")).toBeInTheDocument());
  });

  it("shows the quota counter and upgrade CTA instead of invoking when the monthly cap is reached", async () => {
    mockQuotaAndReport(fullData, { allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5 });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NeighbourhoodReport {...baseProps} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/5 \/ 5 used/i)).toBeInTheDocument();
    expect(screen.getByText(/Monthly cap reached/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(reportCalls()).toHaveLength(0);
  });

  it("shows a Pro allowance counter with the Pro monthly cap", async () => {
    mockQuotaAndReport(fullData, { allowed: true, reason: null, used: 12, limit: 50 });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NeighbourhoodReport {...baseProps} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/12 \/ 50 used/i)).toBeInTheDocument();
    expect(screen.getByText(/38 Pro requests remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/Free: 5\/month\. Pro: 50\/month\./i)).toBeInTheDocument();
  });
});

describe("NeighbourhoodReport — full result UI", () => {
  it("renders all sections (trend, noise, safety, walkability, projects, outlook, demographics)", async () => {
    mockQuotaAndReport(fullData);
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
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

  it("discloses when price trend data is municipality-level OS market intelligence", async () => {
    mockQuotaAndReport({
      ...fullData,
      generatedBy: "openai_maiprop_os",
      osMunicipalityStatus: "ok",
      osMunicipalityName: "Dimos Glyfadas",
    });
    render(<NeighbourhoodReport {...baseProps} city="Glyfada" municipality="Dimos Glyfadas" />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Glyfada/i)).toBeInTheDocument());

    expect(screen.getByText(/mAI Prop OS municipality market report/i)).toBeInTheDocument();
    expect(screen.getByText(/municipality-level residential intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/not a new-build or street-level asking-price benchmark/i)).toBeInTheDocument();
  });

  it("Refresh report re-invokes the edge fn", async () => {
    mockQuotaAndReport(fullData);
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Refresh report/i)).toBeInTheDocument());
    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Refresh report/i }));
    await waitFor(() => expect(reportCalls()).toHaveLength(1));
  });

  it("hides the walkability card when walkabilityScore is null", async () => {
    mockQuotaAndReport({ ...fullData, walkabilityScore: null });
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(screen.queryByText(/Walkability/)).toBeNull();
  });

  it("hides the development projects section when the array is empty", async () => {
    mockQuotaAndReport({ ...fullData, developmentProjects: [] });
    render(<NeighbourhoodReport {...baseProps} />);
    await loadReport();
    await waitFor(() => expect(screen.getByText(/Plaka.*Athens/i)).toBeInTheDocument());
    expect(screen.queryByText(/Development Projects/i)).toBeNull();
  });
});
