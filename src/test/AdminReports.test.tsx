/**
 * Tests for AdminReports — two-tab admin analytics view.
 *
 * We:
 *  - Mock `@/integrations/supabase/client` so tab 1's 7 parallel `.select()`
 *    count queries and tab 2's listing_reports query/Edge action all resolve.
 *  - Mock recharts (ResponsiveContainer) so jsdom's 0-dim SVG doesn't throw.
 *  - Provide a real QueryClientProvider so `useQuery` / `useMutation` execute.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fromMock, invokeMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    functions: {
      invoke: (...a: unknown[]) => invokeMock(...a),
    },
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 180 }}>
        {children}
      </div>
    ),
  };
});

import AdminReports from "@/components/AdminReports";

/**
 * Build a minimal Postgrest-style chainable that supports the surface used
 * by AdminReports: `.from(t).select(...).eq(...).gte(...).order(...)` and
 * `.from(t).update({...}).eq(...)`. Every chainable returns the same `b`
 * so `await` resolves the final `then`.
 */
const buildBuilder = (data: unknown, count: number | null = null, error: unknown = null) => {
  const b: Record<string, unknown> = {};
  b.select = vi.fn().mockReturnValue(b);
  b.eq = vi.fn().mockReturnValue(b);
  b.gte = vi.fn().mockReturnValue(b);
  b.order = vi.fn().mockReturnValue(b);
  b.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolve({ data, error, count: count ?? undefined }));
  return b;
};

const countQuery = (count: number) => buildBuilder([], count, null);
const rowsQuery = (rows: unknown[]) => buildBuilder(rows, null, null);

const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ data: { data: { id: "r-1", status: "resolved" }, error: null }, error: null });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  // Default: every .from() call yields zero counts / empty rows.
  fromMock.mockImplementation((table: string) => {
    if (table === "listing_reports") return rowsQuery([]);
    return countQuery(0);
  });
});

describe("AdminReports", () => {
  it("renders both tabs (Platform Overview + Content Reports)", async () => {
    render(<AdminReports />, { wrapper: makeWrapper() });
    expect(screen.getByRole("button", { name: /Platform Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Content Reports/i })).toBeInTheDocument();
    expect(screen.getByText(/Platform Analytics/i)).toBeInTheDocument();
  });

  it("Platform Overview paints the 6 KPI cards after the 7 count queries settle", async () => {
    render(<AdminReports />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/Total Listings/i)).toBeInTheDocument());
    expect(screen.getByText(/Active Listings/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Users/i)).toBeInTheDocument();
    expect(screen.getByText(/New Users This Month/i)).toBeInTheDocument();
    expect(screen.getByText(/Firesale Requests/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Houses/i)).toBeInTheDocument();
  });

  it("shows 'No listings created …' placeholder when every monthly bucket is empty", async () => {
    render(<AdminReports />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/No listings created in the last 6 months/i)).toBeInTheDocument());
  });

  it("Export CSV button creates a blob download + toasts success", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    render(<AdminReports />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("CSV downloaded");
  });

  it("switching to Content Reports shows the empty-state ('No reports yet.')", async () => {
    render(<AdminReports />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /Content Reports/i }));
    await waitFor(() => expect(screen.getByText(/No reports yet\./i)).toBeInTheDocument());
  });

  it("Content Reports renders a row per report + Resolve action calls the mutation", async () => {
    // Override the default handler so listing_reports returns a pending row.
    fromMock.mockImplementation((table: string) => {
      if (table === "listing_reports")
        return rowsQuery([
          {
            id: "r-1",
            entity_type: "firesale_request",
            entity_id: "fr-123",
            reporter_id: "u-1",
            created_at: "2026-04-01T10:00:00Z",
            status: "pending",
          },
        ]);
      return countQuery(0);
    });
    render(<AdminReports />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /Content Reports/i }));
    await waitFor(() => expect(screen.getByText("fr-123")).toBeInTheDocument());
    // 'Pending' matches both the status badge and the filter tab; assert via
    // getAllByText that at least one is present.
    expect(screen.getAllByText(/Pending/i).length).toBeGreaterThan(0);
    // 'Resolve' matches both the inline action and the 'resolved' filter tab.
    // Pick the row's action by exact textContent match.
    const resolveBtn = screen
      .getAllByRole("button", { name: /Resolve/i })
      .find((b) => b.textContent?.trim() === "Resolve")!;
    fireEvent.click(resolveBtn);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("admin-content-report-action", {
        body: { action: "resolve", reportId: "r-1" },
      }),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/resolved/i)));
  });

  it("status filter buttons re-scope the visible rows", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "listing_reports")
        return rowsQuery([
          { id: "r-1", entity_type: "listing", entity_id: "e1", reporter_id: "u", created_at: "2026-04-01T10:00:00Z", status: "pending" },
          { id: "r-2", entity_type: "listing", entity_id: "e2", reporter_id: "u", created_at: "2026-04-01T10:00:00Z", status: "resolved" },
        ]);
      return countQuery(0);
    });
    render(<AdminReports />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /Content Reports/i }));
    await waitFor(() => expect(screen.getByText("e1")).toBeInTheDocument());
    expect(screen.getByText("e2")).toBeInTheDocument();
    // Click the 'resolved' filter → 'e1' (pending) disappears.
    fireEvent.click(screen.getByRole("button", { name: /^resolved$/i }));
    expect(screen.queryByText("e1")).toBeNull();
    expect(screen.getByText("e2")).toBeInTheDocument();
  });
});
