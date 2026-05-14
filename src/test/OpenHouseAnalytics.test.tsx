/**
 * Tests for OpenHouseAnalytics — the per-listing recharts dashboard. Covers
 * the loading skeleton, the empty state, KPI computation (registered /
 * approved / attended / offers / conversion %), the timeslot utilization
 * table, and the mortgage-status pie data shape.
 *
 * recharts requires non-zero canvas dimensions to render its SVGs. We mock
 * ResponsiveContainer to force a fixed size and assert via the rendered
 * KPI/text content rather than via SVG path geometry.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock("@/components/charts/LazyRecharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Leaf = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Leaf,
    PieChart: Passthrough,
    Pie: Passthrough,
    Cell: Leaf,
    Legend: Leaf,
    ChartFallback: ({ height = 180 }: { height?: number }) => (
      <div data-testid="chart-fallback" style={{ height }} />
    ),
  };
});

import OpenHouseAnalytics from "@/components/OpenHouseAnalytics";

/**
 * Wires the three concurrent supabase reads (registrations / offers /
 * settings.maybeSingle) the component fires inside its load() effect.
 */
function withDataset(
  registrations: Array<{ id: string; status: string | null; mortgage_status: string | null; timeslot_index: number | null }>,
  offers: Array<{ id: string }>,
  timeslots: Array<{ start: string; end: string; max_visitors: number }>,
) {
  fromMock.mockImplementation((table: string) => {
    if (table === "open_house_registrations") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: registrations.map((r) => ({
            listing_id: "l1",
            created_at: "2026-04-01T00:00:00Z",
            ...r,
          })),
          error: null,
        }),
      };
    }
    if (table === "open_house_offers") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: offers.map((o) => ({ listing_id: "l1", created_at: "2026-04-02T00:00:00Z", ...o })),
          error: null,
        }),
      };
    }
    if (table === "open_house_settings") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { timeslots }, error: null }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("OpenHouseAnalytics", () => {
  it("renders the loading skeleton on first paint (before useEffect resolves)", () => {
    // Make every supabase chain return a never-resolving thenable. The initial
    // render captures `useState(true)` so 4 .animate-pulse divs paint on the
    // very first commit, before useEffect even fires.
    const pendingThenable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnValue(new Promise(() => {})),
      then: () => new Promise(() => {}),
    };
    fromMock.mockReturnValue(pendingThenable);
    const { container } = render(<OpenHouseAnalytics listingId="l1" />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when there are no registrations", async () => {
    withDataset([], [], []);
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/No registrations yet/i));
  });

  it("computes KPIs (registered / attended / offers / conversion %)", async () => {
    withDataset(
      [
        { id: "r1", status: "approved", mortgage_status: "yes", timeslot_index: 0 },
        { id: "r2", status: "attended", mortgage_status: "yes", timeslot_index: 0 },
        { id: "r3", status: "attended", mortgage_status: "no", timeslot_index: 1 },
        { id: "r4", status: "pending", mortgage_status: null, timeslot_index: null },
      ],
      [{ id: "o1" }],
      [],
    );
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/Total Registered/i));
    // Registered = 4
    expect(screen.getByText("4")).toBeInTheDocument();
    // Attended = 2 → conversion = 1/2 * 100 = 50.0%
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders timeslot utilization with the right registered/max ratio + percent", async () => {
    withDataset(
      [
        { id: "r1", status: "approved", mortgage_status: null, timeslot_index: 0 },
        { id: "r2", status: "approved", mortgage_status: null, timeslot_index: 0 },
        { id: "r3", status: "approved", mortgage_status: null, timeslot_index: 1 },
      ],
      [],
      [
        { start: "10:00", end: "11:00", max_visitors: 5 },
        { start: "11:00", end: "12:00", max_visitors: 5 },
      ],
    );
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/Timeslot Utilization/i));
    // Slot 1: 2/5 → 40%; Slot 2: 1/5 → 20%
    expect(screen.getByText(/2 \/ 5 \(40%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 5 \(20%\)/)).toBeInTheDocument();
  });

  it("renders the mortgage breakdown card when registrations have mortgage_status", async () => {
    withDataset(
      [
        { id: "r1", status: "attended", mortgage_status: "yes", timeslot_index: 0 },
        { id: "r2", status: "attended", mortgage_status: "no", timeslot_index: 0 },
      ],
      [],
      [],
    );
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/Attendee Pre-qualification/i));
  });

  it("clamps timeslot percentage at 100 when registrations exceed max", async () => {
    withDataset(
      Array.from({ length: 10 }).map((_, i) => ({
        id: `r${i}`,
        status: "approved",
        mortgage_status: null,
        timeslot_index: 0,
      })),
      [],
      [{ start: "10:00", end: "11:00", max_visitors: 3 }],
    );
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/Timeslot Utilization/i));
    expect(screen.getByText(/10 \/ 3 \(100%\)/)).toBeInTheDocument();
  });

  it("swallows fetch errors silently and shows the empty state", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "open_house_registrations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error("rls") }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    });
    render(<OpenHouseAnalytics listingId="l1" />);
    await waitFor(() => screen.getByText(/No registrations yet/i));
  });
});
