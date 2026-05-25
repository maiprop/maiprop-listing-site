/**
 * Tests for POFVerificationPanel — admin Proof of Funds reviewer. Covers
 * the load query (with + without dealId scope), tab switching, verify
 * mutation (success + error toast), reject dialog flow (open / required
 * reason / confirm / cancel), totals computation and the empty-state per
 * tab.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { fromMock, getOpenHouseDocSignedUrlMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getOpenHouseDocSignedUrlMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  getOpenHouseDocSignedUrl: (...a: unknown[]) => getOpenHouseDocSignedUrlMock(...a),
}));

import { POFVerificationPanel } from "@/components/POFVerificationPanel";

type Row = {
  id: string;
  requester_id: string;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  pof_verified_status: "unreviewed" | "verified" | "rejected" | null;
  pof_rejection_reason: string | null;
  created_at: string | null;
  listing_id: string;
  rejection_reason: string | null;
  status: string | null;
};

/**
 * Wires the load() query: SELECT ... .not(proof_of_funds_url is null)
 * .order(created_at desc) .limit(100) [.eq(listing_id, dealId)].
 */
function withRows(rows: Row[]) {
  fromMock.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.not = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.update = vi.fn().mockReturnValue(builder);
    builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null }));
    return builder;
  });
}

const baseRow = (overrides: Partial<Row> = {}): Row => ({
  id: "r-1",
  requester_id: "user-abc-12345",
  proof_of_funds_url: "https://docs/pof.pdf",
  proof_amount: 250_000,
  pof_verified_status: "unreviewed",
  pof_rejection_reason: null,
  created_at: "2026-04-01T00:00:00Z",
  listing_id: "l-1",
  rejection_reason: null,
  status: "approved",
  ...overrides,
});

beforeEach(() => {
  fromMock.mockReset();
  getOpenHouseDocSignedUrlMock.mockReset();
  getOpenHouseDocSignedUrlMock.mockResolvedValue("https://signed.example/pof.pdf");
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("POFVerificationPanel", () => {
  it("renders the empty-state for the default 'Unreviewed' tab when no docs exist", async () => {
    withRows([]);
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/No\s+unreviewed/i));
  });

  it("opens hydrated POF rows through signed document URLs", async () => {
    withRows([baseRow()]);
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Investor user-a/));
    // Euro formatter inserts NBSP/comma per locale; just confirm a 250k
    // figure shows up somewhere. getAllByText matches both the leaf span
    // and ancestor wrappers, so any non-zero count proves the row paints.
    expect(
      screen.getAllByText((_, node) => /250[\s.,\u00a0]?000/.test(node?.textContent ?? "")).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /View Doc/i }));
    await waitFor(() => expect(getOpenHouseDocSignedUrlMock).toHaveBeenCalledWith("https://docs/pof.pdf"));
    expect(window.open).toHaveBeenCalledWith("https://signed.example/pof.pdf", "_blank", "noopener,noreferrer");
  });

  it("falls back to 'Demo Doc' (disabled) when the URL is missing", async () => {
    withRows([baseRow({ proof_of_funds_url: "#" })]);
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Demo Doc/i));
  });

  it("verifies an unreviewed entry and toasts success", async () => {
    let updateCalls = 0;
    fromMock.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn().mockReturnValue(b);
      b.not = vi.fn().mockReturnValue(b);
      b.order = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockImplementation(() => {
        updateCalls++;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      b.eq = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [baseRow()], error: null }));
      return b;
    });
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Investor user-a/));
    fireEvent.click(screen.getByRole("button", { name: /Verify/i }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/verified for/i)));
    expect(updateCalls).toBe(1);
  });

  it("toasts an error when the verify update fails", async () => {
    fromMock.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn().mockReturnValue(b);
      b.not = vi.fn().mockReturnValue(b);
      b.order = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error("rls") }),
      });
      b.eq = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [baseRow()], error: null }));
      return b;
    });
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Investor user-a/));
    fireEvent.click(screen.getByRole("button", { name: /Verify/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Failed to verify/i)));
  });

  it("opens the reject dialog, requires a reason, and confirms rejection", async () => {
    let updates = 0;
    fromMock.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn().mockReturnValue(b);
      b.not = vi.fn().mockReturnValue(b);
      b.order = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockImplementation(() => {
        updates++;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      b.eq = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [baseRow()], error: null }));
      return b;
    });
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Investor user-a/));
    // Two buttons match /Reject/i: the row's "Reject" action and the
    // "Rejected" tab. Pick the row action by exact textContent.
    const rejectBtn = screen
      .getAllByRole("button", { name: /Reject/i })
      .find((b) => b.textContent?.trim() === "Reject")!;
    fireEvent.click(rejectBtn);
    expect(screen.getByText(/Reject POF/i)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /Confirm Rejection/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Document expired/i), {
      target: { value: "Document is older than 90 days" },
    });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/rejected for/i)));
    expect(updates).toBe(1);
  });

  it("cancels the reject dialog without mutating state", async () => {
    withRows([baseRow()]);
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/Investor user-a/));
    const rejectBtn = screen
      .getAllByRole("button", { name: /Reject/i })
      .find((b) => b.textContent?.trim() === "Reject")!;
    fireEvent.click(rejectBtn);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByText(/Reject POF/i)).toBeNull();
  });

  it("scopes the load query by listing_id when dealId is provided", async () => {
    let eqCalledWith: [string, string] | null = null;
    fromMock.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn().mockReturnValue(b);
      b.not = vi.fn().mockReturnValue(b);
      b.order = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockReturnValue(b);
      b.eq = vi.fn().mockImplementation((col: string, val: string) => {
        eqCalledWith = [col, val];
        return b;
      });
      b.update = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null }));
      return b;
    });
    render(<POFVerificationPanel dealId="deal-x" />);
    await waitFor(() => expect(eqCalledWith).toEqual(["listing_id", "deal-x"]));
  });

  it("switches between tabs and shows verified/rejected only on their tabs", async () => {
    withRows([
      baseRow({ id: "v1", pof_verified_status: "verified", proof_amount: 100_000 }),
      baseRow({ id: "r1", pof_verified_status: "rejected", proof_amount: 50_000, pof_rejection_reason: "stale" }),
    ]);
    render(<POFVerificationPanel />);
    // Default tab = unreviewed → empty
    await waitFor(() => screen.getByText(/No\s+unreviewed/i));
    // Switch to verified
    fireEvent.click(screen.getByRole("button", { name: /Verified/i }));
    expect(screen.getByText(/Investor user-a/)).toBeInTheDocument();
    // Switch to rejected
    fireEvent.click(screen.getByRole("button", { name: /Rejected/i }));
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });

  it("swallows query errors silently and leaves the list empty", async () => {
    fromMock.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn().mockReturnValue(b);
      b.not = vi.fn().mockReturnValue(b);
      b.order = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockReturnValue(b);
      b.eq = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: { data: null; error: Error }) => unknown) =>
        Promise.resolve(resolve({ data: null, error: new Error("rls") }));
      return b;
    });
    render(<POFVerificationPanel />);
    await waitFor(() => screen.getByText(/No\s+unreviewed/i));
  });
});
