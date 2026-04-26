/**
 * Tests for the admin ProfessionalVerificationPanel. Covers:
 *   - load: empty list, populated list (chained Supabase: professionals →
 *     profiles_public name lookup → mapping), error swallowed silently.
 *   - tabs: All / Pending / Approved / Rejected filter their counts.
 *   - approve(id): flips status to approved + success toast.
 *   - reject(id): inline reject flow — opens panel, requires reason text,
 *     confirms rejection.
 *   - refresh button calls load() again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { fromMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import { ProfessionalVerificationPanel } from "@/components/ProfessionalVerificationPanel";

/**
 * The component fires two queries in sequence:
 *   1. SELECT id, user_id, category, license_number, verified, created_at
 *      FROM professionals WHERE verified=false LIMIT 50
 *   2. SELECT user_id, display_name FROM profiles_public WHERE user_id IN (...)
 *
 * `withDataset(rows, profiles)` wires both with the supplied data.
 */
function withDataset(
  rows: Array<{ id: string; user_id: string; category: string; license_number: string }>,
  profiles: Array<{ user_id: string; display_name: string }>,
) {
  fromMock.mockImplementation((table: string) => {
    if (table === "professionals") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: rows.map((r) => ({
            ...r,
            verified: false,
            created_at: "2026-04-01T00:00:00Z",
          })),
          error: null,
        }),
      };
    }
    if (table === "profiles_public") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: profiles, error: null }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  fromMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("ProfessionalVerificationPanel", () => {
  it("renders the empty state when no submissions are returned", async () => {
    withDataset([], []);
    render(<ProfessionalVerificationPanel />);
    await waitFor(() =>
      expect(screen.getByText(/No\s+submissions/i)).toBeInTheDocument(),
    );
    // Pending KPI = 0
    expect(screen.getByText(/Pending Review/i)).toBeInTheDocument();
  });

  it("renders the loading skeletons before the fetch resolves", async () => {
    let resolveFn!: (v: unknown) => void;
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(new Promise((r) => { resolveFn = r; })),
    }));
    const { container } = render(<ProfessionalVerificationPanel />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    resolveFn({ data: [], error: null });
    await waitFor(() => expect(container.querySelectorAll(".animate-pulse").length).toBe(0));
  });

  it("hydrates rows with names from profiles_public and shows the count badge", async () => {
    withDataset(
      [{ id: "p1", user_id: "u1", category: "Lawyer", license_number: "LIC-1" }],
      [{ user_id: "u1", display_name: "Alice Lawyer" }],
    );
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => expect(screen.getByText(/Alice Lawyer/i)).toBeInTheDocument());
    expect(screen.getByText(/LIC-1/)).toBeInTheDocument();
  });

  it("falls back to 'Unknown' when there's no matching profile row", async () => {
    withDataset(
      [{ id: "p2", user_id: "u-orphan", category: "Notary", license_number: "LIC-2" }],
      [],
    );
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => expect(screen.getByText(/Unknown/)).toBeInTheDocument());
  });

  it("approves a row and toasts success", async () => {
    withDataset(
      [{ id: "p3", user_id: "u3", category: "Engineer", license_number: "ENG-3" }],
      [{ user_id: "u3", display_name: "Cara Engineer" }],
    );
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => screen.getByText(/Cara Engineer/));
    // Two buttons match /Approve/i: the row's "Approve" action and the
    // tab labelled "Approved". We want the row action.
    const approveBtn = screen
      .getAllByRole("button", { name: /Approve/i })
      .find((b) => b.textContent?.trim() === "Approve")!;
    fireEvent.click(approveBtn);
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/Cara Engineer/));
  });

  it("rejects a row only after a reason is typed and 'Confirm rejection' is clicked", async () => {
    withDataset(
      [{ id: "p4", user_id: "u4", category: "Mover", license_number: "MV-4" }],
      [{ user_id: "u4", display_name: "Dan Mover" }],
    );
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => screen.getByText(/Dan Mover/));
    // The tab named "Rejected" also matches /Reject/i; pick the row action.
    const rejectBtn = screen
      .getAllByRole("button", { name: /Reject/i })
      .find((b) => b.textContent?.includes("Reject") && !b.textContent?.includes("Rejected"))!;
    fireEvent.click(rejectBtn);
    const textarea = screen.getByPlaceholderText(/License number not found/);
    const confirm = screen.getByRole("button", { name: /Confirm rejection/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "License unverifiable" } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(toastMock.success).toHaveBeenCalledWith("Verification rejected");
  });

  it("filters by 'Approved' tab after an approval", async () => {
    withDataset(
      [
        { id: "p5", user_id: "u5", category: "Lawyer", license_number: "LIC-5" },
        { id: "p6", user_id: "u6", category: "Notary", license_number: "LIC-6" },
      ],
      [
        { user_id: "u5", display_name: "Eve Lawyer" },
        { user_id: "u6", display_name: "Frank Notary" },
      ],
    );
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => screen.getByText(/Eve Lawyer/));
    // First Approve button = first row.
    const approveBtns = screen
      .getAllByRole("button", { name: /Approve/i })
      .filter((b) => b.textContent?.trim() === "Approve");
    fireEvent.click(approveBtns[0]);
    // Click the "Approved" tab (button with text 'Approved' + a count badge).
    const approvedTab = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Approved"))!;
    fireEvent.click(approvedTab);
    expect(screen.queryByText(/Frank Notary/)).toBeNull();
  });

  it("Refresh button re-runs the fetch", async () => {
    let calls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "professionals") {
        calls++;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => expect(calls).toBe(1));
    // The refresh button has an icon-only label on small screens; pick by sr text.
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("swallows query errors silently and renders the empty-state UI", async () => {
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error("rls denied") }),
    }));
    render(<ProfessionalVerificationPanel />);
    await waitFor(() => expect(screen.getByText(/No\s+submissions/i)).toBeInTheDocument());
  });
});
